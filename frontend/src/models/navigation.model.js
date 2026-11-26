import {
  Activity,
  BarChart3,
  ContactRound,
  HeartPulse,
  ServerCog,
  ShieldEllipsis,
  BellRing,
  CalendarDays,
  ClipboardCheck,
  FlaskConical,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  Salad,
  ScrollText,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react';
import { PERMISSIONS as P } from './access.model.js';

// Navegacion por rol. Cada entrada declara el permiso que la habilita (permission) o una lista de permisos
// alternativos (anyOf), y opcionalmente el modulo del que depende. El menu y las rutas se filtran con esto;
// es solo interfaz: la API valida los mismos permisos en cada endpoint.
export const NAV_SECTIONS = Object.freeze([
  {
    label: 'Mi portal',
    items: [{ to: '/portal', label: 'Mi salud', icon: HeartPulse, permission: P.PORTAL_SELF, module: 'portal_pacientes', patientOnly: true }],
  },
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard general', icon: LayoutDashboard, permission: P.DASHBOARD_VIEW },
      { to: '/pacientes', label: 'Pacientes', icon: Users, permission: P.PATIENTS_VIEW },
      { to: '/expedientes', label: 'Expedientes clinicos', icon: FolderOpen, permission: P.PATIENTS_VIEW },
      { to: '/consultas', label: 'Consultas', icon: Stethoscope, permission: P.PATIENTS_VIEW },
      { to: '/evaluaciones', label: 'Evaluaciones nutricionales', icon: ClipboardCheck, permission: P.PATIENTS_VIEW },
      { to: '/plan-alimenticio', label: 'Planes alimenticios', icon: Salad, permission: P.PATIENTS_VIEW },
      { to: '/seguimiento', label: 'Seguimiento y evolucion', icon: TrendingUp, permission: P.PATIENTS_VIEW },
      { to: '/laboratorios', label: 'Estudios de laboratorio', icon: FlaskConical, permission: P.PATIENTS_VIEW },
      { to: '/agenda', label: 'Agenda', icon: CalendarDays, permission: P.PATIENTS_VIEW },
      { to: '/reportes', label: 'Reportes', icon: BarChart3, anyOf: [P.PATIENTS_VIEW, P.REPORTS_VIEW] },
    ],
  },
  {
    label: 'Administracion',
    items: [
      { to: '/cuentas', label: 'Cuentas', icon: UserCog, permission: P.USERS_VIEW },
      { to: '/admin/pacientes', label: 'Registro de pacientes', icon: ContactRound, permission: P.PATIENTS_BASIC },
      { to: '/actividad', label: 'Actividad de usuarios', icon: Activity, permission: P.ACTIVITY_VIEW },
      { to: '/roles', label: 'Roles', icon: ShieldEllipsis, permission: P.ROLES_MANAGE },
      { to: '/accesos', label: 'Permisos y accesos', icon: KeyRound, permission: P.PERMISSIONS_MANAGE },
      { to: '/alertas/reglas', label: 'Reglas de alertas', icon: BellRing, permission: P.ALERTS_CONFIGURE, module: 'alertas' },
      {
        to: '/sistema',
        label: 'Sistema',
        icon: ServerCog,
        anyOf: [P.SYSTEM_HEALTH, P.SYSTEM_SETTINGS, P.SYSTEM_BACKUPS, P.MODULES_MANAGE, P.SECURITY_SETTINGS],
      },
      { to: '/privacidad', label: 'Privacidad y conservacion', icon: ShieldCheck, permission: P.AUDIT_VIEW },
      { to: '/auditoria', label: 'Auditoria', icon: ScrollText, permission: P.AUDIT_VIEW },
    ],
  },
]);

export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

// Una entrada es visible si el usuario tiene el permiso (o alguno de los alternativos).
// El portal solo aplica a cuentas vinculadas a un expediente (el superusuario tiene el permiso pero no es paciente).
export const canSee = (item, hasPermission, user = null) =>
  (!item.patientOnly || Boolean(user?.patientId)) && (item.anyOf ? item.anyOf.some((p) => hasPermission(p)) : hasPermission(item.permission));
