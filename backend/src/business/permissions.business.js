import { withTransaction } from '../config/database.js';
import { AuditModel } from '../models/audit.model.js';
import { AppointmentModel } from '../models/clinical.model.js';
import { PatientModel } from '../models/patient.model.js';
import { PermissionModel } from '../models/permission.model.js';
import { RecordModel } from '../models/record.model.js';
import { RoleModel } from '../models/role.model.js';
import { UserModel } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { CLINICAL_FAMILIES } from '../config/rbac.catalog.js';
import { assertNotLastSuperuser, assertNotSelf, getManageableUser, ROLES, toUserDto } from './access.business.js';

const MAX_TEMP_HOURS = 72;

export const PermissionsBusiness = {
  async catalog() {
    const [roles, permissions] = await Promise.all([RoleModel.list(), PermissionModel.list()]);
    const rolesWithPermissions = await Promise.all(roles.map(async (r) => ({ ...r, permissions: await PermissionModel.roleCodes(r.id) })));
    return {
      roles: rolesWithPermissions,
      permissions: permissions.map((p) => ({
        code: p.code,
        description: p.description,
        module: p.module,
        action: p.action,
        clinical: p.clinical,
        isDelegable: Boolean(p.is_delegable),
      })),
    };
  },

  async getUserAccess(actor, userId) {
    const target = await getManageableUser(actor, userId);
    const [rolePermissions, directPermissions, grants] = await Promise.all([
      PermissionModel.roleCodes(target.role_id),
      PermissionModel.directCodes(userId),
      PermissionModel.directGrants(userId),
    ]);
    const temporary = grants
      .filter((g) => g.expiresAt)
      .map((g) => ({
        permission: g.permissionId,
        justification: g.justification,
        expiresAt: g.expiresAt,
        grantedBy: g.grantedBy,
        active: g.expiresAt > new Date(),
      }));
    return { user: toUserDto(target), rolePermissions, directPermissions, temporary };
  },

  // Reemplaza los permisos directos del usuario. Solo se aceptan permisos delegables.
  async setDirectPermissions(actor, userId, codes, ctx) {
    assertNotSelf(actor, userId, 'No puedes modificar tus propios permisos');
    const target = await getManageableUser(actor, userId);
    if (target.role === ROLES.SUPERUSER) {
      throw new AppError(400, 'El super usuario ya cuenta con todos los permisos');
    }

    if (target.role === ROLES.PATIENT) throw new AppError(400, 'A un paciente no se le otorgan permisos adicionales');
    const unique = [...new Set(codes)];
    const rows = await PermissionModel.findDelegableByCodes(unique);
    if (rows.length !== unique.length) throw new AppError(400, 'Hay permisos invalidos o no delegables');
    // Acceso clinico a un rol no clinico: solo temporal y justificado (ver grantTemporary).
    if (!CLINICAL_FAMILIES.has(target.role_family) && rows.some((r) => r.clinical)) {
      throw new AppError(400, 'Los permisos clinicos para este rol solo se otorgan de forma temporal y justificada');
    }

    await withTransaction(async (conn) => {
      await PermissionModel.replaceDirect(
        userId,
        rows.map((r) => r.id),
        actor.id,
        conn,
      );
      await AuditModel.log({ ...ctx, userId: actor.id, event: 'PERMISSIONS_UPDATED', details: `id=${userId} [${unique.join(',')}]` }, conn);
    });
    return this.getUserAccess(actor, userId);
  },

  // Acceso temporal y justificado (p. ej. Sistemas necesita revisar un expediente por una incidencia).
  // Vence solo; queda en la auditoria con su justificacion.
  async grantTemporary(actor, userId, { permission, justification, hours }, ctx) {
    assertNotSelf(actor, userId, 'No puedes modificar tus propios permisos');
    const target = await getManageableUser(actor, userId);
    if (target.role === ROLES.SUPERUSER || target.role === ROLES.PATIENT)
      throw new AppError(400, 'Este usuario no admite permisos temporales');
    const [row] = await PermissionModel.findDelegableByCodes([permission]);
    if (!row) throw new AppError(400, 'Permiso invalido o no delegable');
    if (hours < 1 || hours > MAX_TEMP_HOURS) throw new AppError(400, `La vigencia debe ser de 1 a ${MAX_TEMP_HOURS} horas`);
    const expiresAt = new Date(Date.now() + hours * 3600000);
    await withTransaction(async (session) => {
      await PermissionModel.grantTemporary(userId, { permissionId: row.code, grantedBy: actor.id, justification, expiresAt }, session);
      await AuditModel.log(
        {
          ...ctx,
          userId: actor.id,
          event: 'PERMISSION_TEMP_GRANTED',
          details: `id=${userId} permiso=${row.code} horas=${hours} motivo=${justification.slice(0, 200)}`,
        },
        session,
      );
    });
    return this.getUserAccess(actor, userId);
  },

  // Herencia de sistemas: el usuario destino recibe los pacientes, registros y permisos directos del origen.
  // Util cuando una persona deja su puesto (ISO 27001 A.5.11 - devolucion de activos).
  async transferSystems(actor, sourceId, { targetUserId, deactivateSource }, ctx) {
    if (sourceId === targetUserId) throw new AppError(400, 'El origen y el destino deben ser distintos');
    if (deactivateSource) assertNotSelf(actor, sourceId, 'No puedes desactivar tu propia cuenta');

    const source = await getManageableUser(actor, sourceId);
    const target = await getManageableUser(actor, targetUserId);
    if (!target.is_active) throw new AppError(400, 'El usuario destino esta inactivo');
    if (deactivateSource) await assertNotLastSuperuser(source);

    const result = await withTransaction(async (conn) => {
      const patientsTransferred = await PatientModel.transferOwnership(sourceId, targetUserId, conn);
      await AppointmentModel.transferOwnership(sourceId, targetUserId, conn);
      const recordsTransferred = await RecordModel.transferOwnership(sourceId, targetUserId, conn);
      const permissionIds = await PermissionModel.directIds(sourceId, conn);
      await PermissionModel.addDirect(targetUserId, permissionIds, actor.id, conn);
      if (deactivateSource) await UserModel.setActive(sourceId, false, conn);

      await AuditModel.log(
        {
          ...ctx,
          userId: actor.id,
          event: 'SYSTEMS_TRANSFERRED',
          details: `origen=${sourceId} destino=${targetUserId} pacientes=${patientsTransferred} registros=${recordsTransferred} permisos=${permissionIds.length} desactivado=${deactivateSource}`,
        },
        conn,
      );
      return { patientsTransferred, recordsTransferred, permissionsTransferred: permissionIds.length };
    });

    return { ...result, sourceDeactivated: deactivateSource };
  },
};
