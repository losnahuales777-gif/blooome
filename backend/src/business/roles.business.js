import { nextId, withTransaction } from '../config/database.js';
import { AuditModel } from '../models/audit.model.js';
import { PermissionModel } from '../models/permission.model.js';
import { RoleModel } from '../models/role.model.js';
import { UserModel } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { CLINICAL_FAMILIES } from '../config/rbac.catalog.js';
import { ROLES } from './access.business.js';

// Gestion de roles (superusuario). Permite agregar roles nuevos sin tocar la arquitectura:
// un rol es un registro con nivel y una lista de permisos del catalogo.
// - El rol de superusuario no se edita ni se desactiva.
// - Un rol personalizado no puede igualar al superusuario ni recibir permisos de gobierno (no delegables).

// Solo permisos del catalogo. Los de gobierno (no delegables) no se agregan a ningun rol: un rol solo
// conserva los que ya tenia por definicion (p. ej. portal.self del paciente). Asi ningun rol puede
// acercarse al superusuario ni editarse a si mismo.
// Los permisos clinicos solo se asignan de forma permanente a roles de la familia clinica; un perfil
// administrativo solo los recibe como acceso temporal y justificado (Permisos y accesos).
const ensureCatalogCodes = async (codes, current = [], family = null) => {
  const all = await PermissionModel.list();
  const byCode = new Map(all.map((p) => [p.code, p]));
  const bad = codes.filter((c) => !byCode.has(c) || (!byCode.get(c).is_delegable && !current.includes(c)));
  if (bad.length) throw new AppError(400, `Permisos invalidos o no permitidos para este rol: ${bad.join(', ')}`);
  if (family && !CLINICAL_FAMILIES.has(family)) {
    const clinical = codes.filter((c) => byCode.get(c).clinical && !current.includes(c));
    if (clinical.length) throw new AppError(400, `Un rol no clinico no recibe permisos clinicos permanentes: ${clinical.join(', ')}`);
  }
};

export const RolesBusiness = {
  async list() {
    const [roles, counts] = await Promise.all([RoleModel.list(), UserModel.countByRole()]);
    const byRole = new Map(counts.map((c) => [c._id, c]));
    return {
      items: await Promise.all(
        roles.map(async (r) => ({
          ...r,
          permissions: await PermissionModel.roleCodes(r.id),
          users: byRole.get(r.id)?.total ?? 0,
          activeUsers: byRole.get(r.id)?.active ?? 0,
        })),
      ),
    };
  },

  async create(actor, { code, name, description, level, permissions }, ctx) {
    if (await RoleModel.findByCode(code)) throw new AppError(409, 'Ya existe un rol con ese codigo');
    await ensureCatalogCodes(permissions);
    // Un rol con permisos clinicos es de la familia clinica (p. ej. nutriologo asistente); el resto es administrativo.
    const all = await PermissionModel.list();
    const family = all.some((p) => p.clinical && permissions.includes(p.code)) ? 'clinico' : 'personalizado';
    const id = await withTransaction(async (session) => {
      const newId = await nextId('roles', session);
      await RoleModel.create({
        id: newId + 100,
        code,
        name,
        description,
        level,
        family,
        permissions: [...new Set(permissions)],
        createdBy: actor.id,
      });
      await AuditModel.log(
        { ...ctx, userId: actor.id, event: 'ROLE_CREATED', details: `codigo=${code} nivel=${level} permisos=${permissions.length}` },
        session,
      );
      return newId + 100;
    });
    return (await this.list()).items.find((r) => r.id === id);
  },

  async update(actor, roleId, { name, description, permissions, active }, ctx) {
    const role = await RoleModel.findById(roleId);
    if (!role) throw new AppError(404, 'Rol no encontrado');
    if (role.code === ROLES.SUPERUSER) throw new AppError(400, 'El rol de superusuario no se modifica');
    // El rol paciente tiene un unico permiso fijo (su portal): asi ninguna edicion le abre datos ajenos.
    if (permissions && role.code === ROLES.PATIENT) throw new AppError(400, 'Los permisos del rol paciente no se modifican');
    if (permissions) await ensureCatalogCodes(permissions, await PermissionModel.roleCodes(roleId), role.family ?? 'personalizado');
    if (active === false && role.code === ROLES.PATIENT)
      throw new AppError(400, 'Desactiva el modulo de portal de pacientes en lugar del rol');
    const changes = Object.fromEntries(Object.entries({ name, description, active }).filter(([, v]) => v !== undefined));
    await RoleModel.update(roleId, changes);
    if (permissions) await PermissionModel.setRolePermissions(roleId, [...new Set(permissions)]);
    await AuditModel.log({
      ...ctx,
      userId: actor.id,
      event: 'ROLE_UPDATED',
      details: `rol=${role.code}${permissions ? ` permisos=[${permissions.join(',')}]` : ''}${active !== undefined ? ` activo=${active}` : ''}`,
    });
    return (await this.list()).items.find((r) => r.id === roleId);
  },
};
