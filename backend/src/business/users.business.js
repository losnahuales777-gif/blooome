import { DuplicateKeyError } from '../config/database.js';
import { RoleModel } from '../models/role.model.js';
import { UserModel } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword } from '../utils/password.js';
import {
  assertCanAssignRole,
  assertNotLastSuperuser,
  assertNotSelf,
  getManageableUser,
  toUserDto,
  visibleMaxLevel,
} from './access.business.js';
import { SessionModel } from '../models/session.model.js';
import { AuditBusiness } from './audit.business.js';
import { generateCode, hashCode } from '../utils/oneTimeCode.js';
import { ROLES } from './access.business.js';

const RESET_MINUTES = 30;

async function findRole(code) {
  const role = await RoleModel.findByCode(code);
  if (!role) throw new AppError(400, 'Rol invalido');
  return role;
}

export const UsersBusiness = {
  async list(actor, { page, pageSize, q, role }) {
    const roleRow = role ? await findRole(role) : null;
    const { items, total } = await UserModel.list({ maxLevel: visibleMaxLevel(actor), page, pageSize, q, role: roleRow?.id });
    return { items: items.map(toUserDto), total, page, pageSize };
  },

  async create(actor, { email, fullName, password, role }, ctx) {
    const roleRow = await findRole(role);
    // Las cuentas de paciente se crean solo por invitacion desde su expediente (quedan vinculadas a el).
    if (roleRow.code === ROLES.PATIENT) throw new AppError(400, 'Las cuentas de paciente se crean con una invitacion desde el expediente');
    assertCanAssignRole(actor, roleRow);

    let id;
    try {
      id = await UserModel.create({
        email,
        fullName,
        passwordHash: await hashPassword(password),
        roleId: roleRow.id,
        createdBy: actor.id,
      });
    } catch (err) {
      if (err instanceof DuplicateKeyError) throw new AppError(409, 'Ese correo ya esta registrado');
      throw err;
    }

    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'USER_CREATED', details: `id=${id} rol=${role}` });
    return toUserDto(await UserModel.findById(id));
  },

  async update(actor, userId, { fullName }, ctx) {
    await getManageableUser(actor, userId);
    await UserModel.updateProfile(userId, { fullName });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'USER_UPDATED', details: `id=${userId}` });
    return toUserDto(await UserModel.findById(userId));
  },

  async setStatus(actor, userId, isActive, ctx) {
    assertNotSelf(actor, userId, 'No puedes cambiar el estado de tu propia cuenta');
    const target = await getManageableUser(actor, userId);
    if (!isActive) await assertNotLastSuperuser(target);

    await UserModel.setActive(userId, isActive);
    // Desactivar una cuenta cierra al instante todas sus sesiones.
    if (!isActive) await SessionModel.revokeAllForUser(userId, 'cuenta desactivada');
    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      details: `id=${userId}`,
    });
    return toUserDto(await UserModel.findById(userId));
  },

  async changeRole(actor, userId, role, ctx) {
    assertNotSelf(actor, userId, 'No puedes cambiar tu propio rol');
    const target = await getManageableUser(actor, userId);
    const roleRow = await findRole(role);
    assertCanAssignRole(actor, roleRow);
    // Un paciente esta vinculado a su expediente: no se convierte en otro tipo de usuario ni al reves.
    if (target.role === ROLES.PATIENT || roleRow.code === ROLES.PATIENT) {
      throw new AppError(400, 'El rol de paciente no se puede asignar ni retirar; usa una cuenta distinta');
    }
    if (role !== target.role) await assertNotLastSuperuser(target);

    await UserModel.setRole(userId, roleRow.id);
    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: 'USER_ROLE_CHANGED',
      details: `id=${userId} ${target.role}->${role}`,
    });
    return toUserDto(await UserModel.findById(userId));
  },

  // Baja logica (superusuario): la cuenta se conserva para la auditoria pero deja de existir para el sistema.
  async remove(actor, userId, ctx) {
    assertNotSelf(actor, userId, 'No puedes eliminar tu propia cuenta');
    const target = await getManageableUser(actor, userId);
    await assertNotLastSuperuser(target);
    await UserModel.softDelete(userId, actor.id);
    await SessionModel.revokeAllForUser(userId, 'cuenta eliminada');
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'USER_DELETED', details: `id=${userId} rol=${target.role}` });
    return { deleted: true };
  },

  // Restablecimiento seguro: codigo de un solo uso (30 min) que el administrador entrega al usuario por un
  // canal seguro. La contrasena anterior deja de servir hasta que se use el codigo y se cierran sus sesiones.
  async resetPassword(actor, userId, ctx) {
    assertNotSelf(actor, userId, 'Para cambiar tu contrasena usa Configuracion');
    const target = await getManageableUser(actor, userId);
    const code = generateCode();
    await UserModel.setOneTimeCode(userId, {
      codeHash: hashCode(code),
      purpose: 'reset',
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60000),
      clearPassword: true,
    });
    await SessionModel.revokeAllForUser(userId, 'restablecimiento de contrasena');
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'PASSWORD_RESET_ISSUED', details: `id=${userId}` });
    return { code, expiresInMinutes: RESET_MINUTES, email: target.email };
  },
};
