import { Activity, BarChart3, CalendarDays, Salad, ScrollText, ServerCog, ShieldCheck, UserRound, Users } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../business/auth/useAuth.js';
import { isToday, needsFollowUp, usePatients } from '../business/patients/usePatients.js';
import AgeRuler from '../components/patients/AgeRuler.jsx';
import BmiBadge from '../components/patients/BmiMark.jsx';
import Alert from '../components/ui/Alert.jsx';
import RoleBadge from '../components/ui/RoleBadge.jsx';
import { ui } from '../components/ui/styles.js';
import { PERMISSIONS as P, ROLES } from '../models/access.model.js';
import { GOALS } from '../models/patient.model.js';

// Las graficas (Recharts) se cargan aparte para no pesar en la carga inicial.
const PracticeDashboard = lazy(() => import('../components/stats/PracticeDashboard.jsx'));

const timeFmt = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos dias' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function weeksSince(iso) {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 24 * 60 * 60 * 1000)) : null;
}

function NutritionDashboard({ firstName }) {
  const navigate = useNavigate();
  const { patients, loading, error } = usePatients();

  const today = patients.filter((p) => isToday(p.nextVisit)).sort((a, b) => a.nextVisit.localeCompare(b.nextVisit));
  const followUp = patients.filter((p) => needsFollowUp(p));
  const openPatient = (p) => navigate(`/pacientes?paciente=${p.id}`);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold sm:text-4xl">
          {greeting()}, {firstName}
        </h1>
        {!loading && (
          <p className="mt-2 max-w-2xl text-muted">
            Hoy tienes {today.length} {today.length === 1 ? 'consulta' : 'consultas'}.{' '}
            {followUp.length > 0
              ? `${followUp.length} ${followUp.length === 1 ? "paciente lleva" : "pacientes llevan"} mas de seis semanas sin revision ni cita.`
              : 'Todos tus pacientes tienen seguimiento al dia.'}
          </p>
        )}
      </header>

      <Alert>{error}</Alert>

      <section aria-labelledby="ruler-title" className="glass rounded-3xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ruler-title" className="text-xl font-semibold">
            {patients.length} pacientes entre 18 y 60 anos
          </h2>
          <Link to="/pacientes" className="text-sm font-bold text-highlight hover:underline">
            Ver la lista completa
          </Link>
        </div>
        {loading ? (
          <div className="h-48 animate-pulse rounded-xl bg-tint-strong" />
        ) : (
          <AgeRuler patients={patients} onSelect={openPatient} />
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-5">
        <section className="lg:col-span-3" aria-labelledby="today-title">
          <h2 id="today-title" className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="size-5 text-accent" aria-hidden="true" /> Consultas de hoy
          </h2>
          {today.length === 0 && !loading ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-muted">
              No hay consultas agendadas para hoy. Agenda la proxima desde la ficha de cada paciente.
            </p>
          ) : (
            <ol className="relative space-y-1 border-l-2 border-line pl-6">
              {today.map((p) => (
                <li key={p.id} className="relative">
                  <span className="absolute top-4 -left-[31px] size-3 rounded-full border-2 border-canvas bg-accent" />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-3 hover:bg-tint">
                    <time className="w-14 font-bold tabular-nums">{timeFmt.format(new Date(p.nextVisit))}</time>
                    <button type="button" onClick={() => openPatient(p)} className="min-w-40 flex-1 text-left">
                      <span className="block font-bold hover:underline">{p.fullName}</span>
                      <span className="text-sm text-muted">
                        {p.age} anos, {GOALS.find((g) => g.code === p.goal)?.label.toLowerCase()}
                      </span>
                    </button>
                    <BmiBadge category={p.bmiCategory} value={p.bmi} />
                    <Link
                      to={`/plan-alimenticio?paciente=${p.id}`}
                      className="inline-flex items-center gap-1 text-sm font-bold text-highlight hover:underline"
                    >
                      <Salad className="size-4" aria-hidden="true" /> Plan
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="lg:col-span-2" aria-labelledby="follow-title">
          <h2 id="follow-title" className="mb-4 text-xl font-semibold">
            Sin seguimiento
          </h2>
          <ul className={`${ui.card} divide-y divide-line`}>
            {followUp.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => openPatient(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-tint">
                  <span className="flex-1">
                    <span className="block font-bold">{p.fullName}</span>
                    <span className="text-sm text-muted">
                      Ultima consulta {p.lastVisit ? `${dateFmt.format(new Date(p.lastVisit))}, hace ${weeksSince(p.lastVisit)} semanas` : 'sin registro'}
                    </span>
                  </span>
                  <BmiBadge category={p.bmiCategory} />
                </button>
              </li>
            ))}
            {followUp.length === 0 && !loading && <li className="px-4 py-6 text-sm text-muted">Nadie pendiente.</li>}
          </ul>
        </section>
      </div>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-tint-strong" aria-label="Cargando indicadores" />}>
        <PracticeDashboard />
      </Suspense>
    </div>
  );
}

// Panel para perfiles sin acceso clinico: accesos directos segun sus permisos (el servidor vuelve a validar cada uno).
const ADMIN_LINKS = [
  { to: '/cuentas', label: 'Cuentas de usuario', hint: 'Cuentas del personal segun tu nivel', icon: Users, permission: P.USERS_VIEW },
  { to: '/admin/pacientes', label: 'Directorio de pacientes', hint: 'Datos basicos e invitaciones al portal', icon: UserRound, permission: P.PATIENTS_BASIC },
  { to: '/reportes', label: 'Reportes', hint: 'Indicadores agregados y anonimizados', icon: BarChart3, permission: P.REPORTS_VIEW },
  { to: '/actividad', label: 'Actividad de usuarios', hint: 'Accesos y volumen de acciones', icon: Activity, permission: P.ACTIVITY_VIEW },
  { to: '/sistema', label: 'Sistema', hint: 'Salud, errores y respaldos', icon: ServerCog, anyOf: [P.SYSTEM_HEALTH, P.SYSTEM_BACKUPS, P.SYSTEM_SETTINGS] },
  { to: '/roles', label: 'Roles', hint: 'Permisos por rol', icon: ShieldCheck, permission: P.ROLES_MANAGE },
  { to: '/auditoria', label: 'Auditoria', hint: 'Bitacora de acciones criticas', icon: ScrollText, permission: P.AUDIT_VIEW },
];

function ModulesDashboard({ user, hasPermission }) {
  const links = ADMIN_LINKS.filter((l) => (l.anyOf ? l.anyOf.some((p) => hasPermission(p)) : hasPermission(l.permission)));
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">
          {greeting()}, {user.fullName.split(' ')[0]}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-muted">
          <RoleBadge role={user.role} name={user.roleName} /> {ROLES[user.role]?.description}
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(({ to, label, hint, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className={`${ui.card} flex h-full items-start gap-3 p-5 hover:bg-tint`}>
              <Icon className="mt-0.5 size-5 text-highlight" aria-hidden="true" />
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="text-sm text-muted">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {links.length === 0 && <p className="text-muted">Tu rol aun no tiene modulos asignados. Contacta al superusuario.</p>}
    </section>
  );
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  // El paciente no tiene panel clinico: su inicio es el portal.
  if (hasPermission(P.PORTAL_SELF) && !hasPermission(P.DASHBOARD_VIEW)) return <Navigate to="/portal" replace />;
  return hasPermission(P.PATIENTS_VIEW) ? (
    <NutritionDashboard firstName={user.fullName.split(' ')[0]} />
  ) : (
    <ModulesDashboard user={user} hasPermission={hasPermission} />
  );
}
