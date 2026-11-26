// Espejo del catalogo RBAC del backend (database/schema.sql). La autorizacion real se aplica
// en la API; aqui solo se usa para mostrar u ocultar elementos de la interfaz.
export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard.view',
  RECORDS_VIEW: 'records.view',
  RECORDS_CREATE: 'records.create',
  RECORDS_VIEW_ALL: 'records.view_all',
  PATIENTS_VIEW: 'patients.view',
  PATIENTS_VIEW_ALL: 'patients.view_all',
  PATIENTS_MANAGE: 'patients.manage',
  MEAL_PLANS_MANAGE: 'meal_plans.manage',
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  AUDIT_VIEW: 'audit.view',
  ROLES_ASSIGN: 'roles.assign',
  PERMISSIONS_MANAGE: 'permissions.manage',
  SYSTEMS_TRANSFER: 'systems.transfer',
  ALERTS_CONFIGURE: 'alerts.configure',
  USERS_DELETE: 'users.delete',
  USERS_RESET_PASSWORD: 'users.reset_password',
  PATIENTS_BASIC: 'patients.basic',
  PATIENTS_INVITE: 'patients.invite',
  PORTAL_SELF: 'portal.self',
  REPORTS_VIEW: 'reports.view',
  ACTIVITY_VIEW: 'activity.view',
  ROLES_MANAGE: 'roles.manage',
  SECURITY_SETTINGS: 'security.settings',
  MODULES_MANAGE: 'modules.manage',
  SYSTEM_HEALTH: 'system.health',
  SYSTEM_SETTINGS: 'system.settings',
  SYSTEM_BACKUPS: 'system.backups',
});

// Roles del sistema (espejo de backend/src/config/rbac.catalog.js). Los roles personalizados que cree el
// superusuario llegan del catalogo de la API; aqui solo se definen etiquetas y colores.
export const ROLES = Object.freeze({
  superuser: { label: 'Superusuario', level: 100, family: 'superusuario', badge: 'bg-highlight/15 text-highlight', description: 'Acceso total: roles, permisos, seguridad, modulos y auditoria.' },
  admin_administrativo: { label: 'Admin. nivel 1 - Administrativo', level: 80, family: 'admin_nivel_1', badge: 'bg-info/15 text-info', description: 'Procesos administrativos, reportes agregados y supervision operativa.' },
  admin_sistemas: { label: 'Admin. nivel 1 - Sistemas', level: 80, family: 'admin_nivel_1', badge: 'bg-info/15 text-info', description: 'Configuracion tecnica, salud del sistema, errores y respaldos.' },
  admin: { label: 'Admin. nivel 2 - Usuarios', level: 60, family: 'admin_nivel_2', badge: 'bg-warning/15 text-warning', description: 'Cuentas de usuario y datos basicos de pacientes.' },
  user: { label: 'Nutriologo', level: 40, family: 'clinico', badge: 'bg-success/15 text-success', description: 'Atencion clinica de sus pacientes.' },
  paciente: { label: 'Paciente', level: 10, family: 'paciente', badge: 'bg-tint-strong text-muted', description: 'Portal personal.' },
});

// Roles que un actor puede asignar: el superusuario cualquiera; el resto solo de nivel inferior.
// Las cuentas de paciente no se crean aqui (se crean con una invitacion desde el expediente).
export function assignableRoles(actorRole, catalogRoles = null) {
  const list = catalogRoles
    ? catalogRoles.filter((r) => r.active !== false).map((r) => ({ code: r.code, label: ROLES[r.code]?.label ?? r.name, level: r.level }))
    : Object.entries(ROLES).map(([code, r]) => ({ code, ...r }));
  const actorLevel = ROLES[actorRole]?.level ?? list.find((r) => r.code === actorRole)?.level ?? 0;
  return list
    .filter((r) => r.code !== 'paciente')
    .filter((r) => actorRole === 'superuser' || r.level < actorLevel)
    .sort((a, b) => b.level - a.level);
}
