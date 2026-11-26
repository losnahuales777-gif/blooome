// Catalogo RBAC de Bloome (version 2). Fuente unica de roles del sistema y permisos.
//
// Cada permiso: [codigo, descripcion, modulo, accion, delegable, clinico]
//  - delegable = false: permiso de gobierno, exclusivo del superusuario (no se otorga a otros).
//  - clinico = true: da acceso a informacion clinica; otorgarlo a un rol no clinico exige justificacion
//    y fecha de expiracion (acceso de emergencia, ISO 27001 A.8.2).
export const RBAC_VERSION = 2;

export const PERMISSIONS = [
  // Panel y reportes
  ['dashboard.view', 'Ver el panel principal', 'panel', 'ver', true, false],
  ['reports.view', 'Consultar reportes y estadisticas agregadas (sin datos identificativos)', 'reportes', 'ver', true, false],
  ['activity.view', 'Supervisar la actividad operativa de los usuarios', 'reportes', 'ver', true, false],
  // Registros generales (modulo original)
  ['records.view', 'Ver sus propios registros', 'registros', 'ver', true, false],
  ['records.create', 'Capturar registros', 'registros', 'crear', true, false],
  ['records.view_all', 'Ver los registros de todos los usuarios', 'registros', 'ver', true, false],
  // Cuentas de usuario
  ['users.view', 'Consultar usuarios registrados', 'usuarios', 'ver', true, false],
  ['users.create', 'Dar de alta usuarios', 'usuarios', 'crear', true, false],
  ['users.update', 'Editar, activar y desactivar cuentas', 'usuarios', 'editar', true, false],
  ['users.reset_password', 'Generar codigos de restablecimiento de contrasena', 'usuarios', 'editar', true, false],
  ['users.delete', 'Eliminar usuarios (baja logica)', 'usuarios', 'eliminar', false, false],
  // Pacientes
  ['patients.basic', 'Registrar pacientes y gestionar su informacion basica (sin datos clinicos)', 'pacientes', 'editar', true, false],
  ['patients.invite', 'Invitar pacientes al portal', 'pacientes', 'crear', true, false],
  ['patients.view', 'Ver sus pacientes (expediente clinico)', 'clinico', 'ver', true, true],
  ['patients.view_all', 'Ver los pacientes de todos los nutriologos', 'clinico', 'ver', true, true],
  ['patients.manage', 'Registrar y editar pacientes y consultas', 'clinico', 'editar', true, true],
  ['meal_plans.manage', 'Elaborar planes alimenticios', 'clinico', 'editar', true, true],
  ['alerts.configure', 'Configurar las reglas de alertas clinicas', 'clinico', 'configurar', true, true],
  // Portal del paciente
  ['portal.self', 'Consultar y actualizar su propia informacion como paciente', 'portal', 'ver', false, false],
  // Auditoria y sistema
  ['audit.view', 'Consultar la bitacora de auditoria', 'auditoria', 'ver', true, false],
  ['system.health', 'Supervisar el funcionamiento y los errores tecnicos', 'sistema', 'ver', true, false],
  ['system.settings', 'Gestionar parametros tecnicos del sistema', 'sistema', 'configurar', true, false],
  ['system.backups', 'Gestionar respaldos y mantenimiento', 'sistema', 'configurar', true, false],
  // Gobierno (solo superusuario)
  ['security.settings', 'Gestionar configuraciones de seguridad', 'seguridad', 'configurar', false, false],
  ['modules.manage', 'Activar o desactivar modulos del aplicativo', 'seguridad', 'configurar', false, false],
  ['roles.manage', 'Crear roles y editar sus permisos', 'seguridad', 'configurar', false, false],
  ['roles.assign', 'Cambiar el rol de un usuario', 'seguridad', 'editar', false, false],
  ['permissions.manage', 'Otorgar o revocar permisos directos', 'seguridad', 'editar', false, false],
  ['systems.transfer', 'Heredar sistemas (pacientes, registros y permisos) a otro usuario', 'seguridad', 'editar', false, false],
];

const ALL = PERMISSIONS.map(([code]) => code);
const CLINICAL = ['patients.view', 'patients.manage', 'meal_plans.manage'];

// Roles del sistema. "level" ordena la jerarquia: nadie gestiona a un usuario de su nivel o superior
// (salvo el superusuario). Los ids 1-3 se conservan de la version 1 para no tocar a los usuarios existentes.
export const ROLES = [
  {
    _id: 3,
    code: 'superuser',
    name: 'Superusuario',
    description: 'Acceso total: roles, permisos, seguridad, modulos y auditoria.',
    level: 100,
    family: 'superusuario',
    permissions: ALL,
  },
  {
    _id: 4,
    code: 'admin_administrativo',
    name: 'Administrador nivel 1 - Administrativo',
    description: 'Procesos administrativos, reportes agregados y supervision operativa. Sin datos clinicos.',
    level: 80,
    family: 'admin_nivel_1',
    permissions: ['dashboard.view', 'reports.view', 'activity.view', 'users.view'],
  },
  {
    _id: 5,
    code: 'admin_sistemas',
    name: 'Administrador nivel 1 - Sistemas',
    description: 'Configuracion tecnica, salud del sistema, errores y respaldos. Sin datos clinicos salvo autorizacion temporal.',
    level: 80,
    family: 'admin_nivel_1',
    permissions: ['dashboard.view', 'system.health', 'system.settings', 'system.backups'],
  },
  {
    _id: 2,
    code: 'admin',
    name: 'Administrador nivel 2 - Usuarios',
    description: 'Cuentas de usuario, restablecimiento de contrasenas y datos basicos de pacientes. Sin historial clinico.',
    level: 60,
    family: 'admin_nivel_2',
    permissions: [
      'dashboard.view',
      'users.view',
      'users.create',
      'users.update',
      'users.reset_password',
      'patients.basic',
      'patients.invite',
    ],
  },
  {
    _id: 1,
    code: 'user',
    name: 'Nutriologo',
    description: 'Atencion clinica: expedientes, consultas, notas SOAP, planes y seguimiento de sus pacientes.',
    level: 40,
    family: 'clinico',
    permissions: ['dashboard.view', 'records.view', 'records.create', ...CLINICAL, 'patients.invite'],
  },
  {
    _id: 6,
    code: 'paciente',
    name: 'Paciente',
    description: 'Portal personal: su perfil, citas, plan, mediciones, objetivos, documentos compartidos y notificaciones.',
    level: 10,
    family: 'paciente',
    permissions: ['portal.self'],
  },
];

export const CLINICAL_PERMISSIONS = new Set(PERMISSIONS.filter((p) => p[5]).map(([code]) => code));
export const CLINICAL_FAMILIES = new Set(['clinico', 'superusuario']);
