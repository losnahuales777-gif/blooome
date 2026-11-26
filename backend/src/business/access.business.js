import { PermissionModel } from '../models/permission.model.js';
import { UserModel } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';

// Nucleo del modelo RBAC jerarquico (catalogo en config/rbac.catalog.js).
// La jerarquia se ordena por "level": nadie gestiona ni asigna un rol de su nivel o superior, salvo el superusuario.
export const ROLES = Object.freeze({
  USER: 'user',
  NUTRITIONIST: 'user',
  ADMIN: 'admin',
  ADMIN_ADMINISTRATIVE: 'admin_administrativo',
  ADMIN_SYSTEMS: 'admin_sistemas',
  PATIENT: 'paciente',
  SUPERUSER: 'superuser',
});

export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard.view',
  RECORDS_VIEW: 'records.view',
  RECORDS_CREATE: 'records.create',
  RECORDS_VIEW_ALL: 'records.view_all',
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  AUDIT_VIEW: 'audit.view',
  PATIENTS_VIEW: 'patients.view',
  PATIENTS_VIEW_ALL: 'patients.view_all',
  PATIENTS_MANAGE: 'patients.manage',
  MEAL_PLANS_MANAGE: 'meal_plans.manage',
  ROLES_ASSIGN: 'roles.assign',
  PERMISSIONS_MANAGE: 'permissions.manage',
  SYSTEMS_TRANSFER: 'systems.transfer',
  ALERTS_CONFIGURE: 'alerts.configure',
  REPORTS_VIEW: 'reports.view',
  ACTIVITY_VIEW: 'activity.view',
  USERS_RESET_PASSWORD: 'users.reset_password',
  USERS_DELETE: 'users.delete',
  PATIENTS_BASIC: 'patients.basic',
  PATIENTS_INVITE: 'patients.invite',
  PORTAL_SELF: 'portal.self',
  SYSTEM_HEALTH: 'system.health',
  SYSTEM_SETTINGS: 'system.settings',
  SYSTEM_BACKUPS: 'system.backups',
  SECURITY_SETTINGS: 'security.settings',
  MODULES_MANAGE: 'modules.manage',
  ROLES_MANAGE: 'roles.manage',
});

const isSuperuser = (subject) => subject.role === ROLES.SUPERUSER;

// El super usuario tiene siempre todos los permisos, incluidos los que se agreguen en el futuro.
export async function resolvePermissions(user) {
  const codes = isSuperuser(user) ? await PermissionModel.allCodes() : await PermissionModel.effectiveCodes(user.id);
  return new Set(codes);
}

// Un actor solo ve usuarios de nivel inferior al suyo; el super usuario ve a todos.
export function visibleMaxLevel(actor) {
  return isSuperuser(actor) ? actor.level : actor.level - 1;
}

export function canManage(actor, target) {
  return isSuperuser(actor) || target.role_level < actor.level;
}

// Devuelve el usuario si el actor puede gestionarlo. Responde 404 (no 403) para no revelar
// la existencia de cuentas de mayor jerarquia.
export async function getManageableUser(actor, userId) {
  const target = await UserModel.findById(userId);
  if (!target || !canManage(actor, target)) throw new AppError(404, 'Usuario no encontrado');
  return target;
}

// Nadie puede otorgar un rol de su mismo nivel o superior, salvo el super usuario. Un rol desactivado no se asigna.
export function assertCanAssignRole(actor, role) {
  if (!isSuperuser(actor) && role.level >= actor.level) {
    throw new AppError(403, 'No puedes asignar un rol igual o superior al tuyo');
  }
  if (!role.active) throw new AppError(400, 'Ese rol esta desactivado');
  if (role.code === ROLES.SUPERUSER && !isSuperuser(actor)) throw new AppError(403, 'Solo un superusuario puede crear superusuarios');
}

export function assertNotSelf(actor, userId, message) {
  if (actor.id === userId) throw new AppError(400, message);
}

// Evita dejar la plataforma sin ningun super usuario activo.
export async function assertNotLastSuperuser(target) {
  if (target.role !== ROLES.SUPERUSER || !target.is_active) return;
  if ((await UserModel.countActiveByRole(ROLES.SUPERUSER)) <= 1) {
    throw new AppError(409, 'Debe existir al menos un super usuario activo');
  }
}

export function toUserDto(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    roleName: user.role_name,
    roleFamily: user.role_family ?? null,
    patientId: user.patient_id ?? null,
    isActive: Boolean(user.is_active),
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  };
}
