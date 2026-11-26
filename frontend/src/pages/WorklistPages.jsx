import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useResource } from '../business/hooks/useResource.js';
import RangeFilter from '../components/charts/RangeFilter.jsx';
import Alert from '../components/ui/Alert.jsx';
import DataTable, { StatusBadge } from '../components/ui/DataTable.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ui } from '../components/ui/styles.js';
import { APPOINTMENT_STATUS, fmt, formatResult, rangeFromPreset } from '../models/analysis.model.js';
import { NOTE_STATUS, RECORD_STATUS } from '../models/chart.model.js';
import { ageFrom } from '../models/patient.model.js';
import { alertsService, worklistsService } from '../services/chart.service.js';
import { useAuth } from '../business/auth/useAuth.js';
import { AlertItem } from '../components/chart/AlertsPanel.jsx';
import { PERMISSIONS as P } from '../models/access.model.js';

const PracticeDashboard = lazy(() => import('../components/stats/PracticeDashboard.jsx'));

const time = (d) => (d ? new Date(d).getTime() : null);
const patientLink = (r, tab) => (
  <Link to={`/pacientes/${r.patientId ?? r.id}${tab ? `?tab=${tab}` : ''}`} className="font-medium text-ink hover:underline">
    {r.patientName ?? r.fullName ?? '—'}
  </Link>
);

function usePeriod(initial) {
  const [preset, setPreset] = useState(initial);
  const [custom, setCustom] = useState({});
  const range = useMemo(() => rangeFromPreset(preset, custom), [preset, custom]);
  return { range, filter: <RangeFilter preset={preset} custom={custom} onPresetChange={setPreset} onCustomChange={setCustom} /> };
}

function Select({ label, value, onChange, options }) {
  return (
    <select aria-label={label} className={`${ui.input} w-auto!`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

// ------------------------------------------------------------------ Expedientes clinicos
export function RecordsPage() {
  const { data, error, loading } = useResource(() => worklistsService.records(), []);
  const [status, setStatus] = useState('');
  const rows = (data?.items ?? []).filter((r) => !status || r.recordStatus === status);
  const columns = [
    { key: 'recordNumber', label: 'Expediente', render: (r) => <span className="font-mono text-sm">{r.recordNumber}</span> },
    { key: 'fullName', label: 'Paciente', render: (r) => patientLink(r) },
    { key: 'age', label: 'Edad', align: 'right', sortValue: (r) => ageFrom(r.birthDate), render: (r) => ageFrom(r.birthDate), searchable: false },
    { key: 'recordStatus', label: 'Estado', render: (r) => <StatusBadge tone={RECORD_STATUS[r.recordStatus]?.tone}>{RECORD_STATUS[r.recordStatus]?.label}</StatusBadge> },
    { key: 'nutritionistName', label: 'Responsable' },
    { key: 'admissionDate', label: 'Ingreso', sortValue: (r) => time(r.admissionDate), render: (r) => fmt.date(r.admissionDate), searchable: false },
    { key: 'lastVisitAt', label: 'Ultima consulta', sortValue: (r) => time(r.lastVisitAt), render: (r) => fmt.date(r.lastVisitAt), searchable: false },
    {
      key: 'drafts',
      label: 'Notas',
      searchable: false,
      render: (r) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge tone="success">{r.signedNotes} firmadas</StatusBadge>
          {r.drafts > 0 && <StatusBadge tone="warning">{r.drafts} borrador</StatusBadge>}
        </span>
      ),
    },
  ];
  return (
    <section>
      <PageHeader title="Expedientes clinicos" description="Expediente integral de cada paciente: identificacion, antecedentes, notas y diagnosticos." />
      <Alert>{error}</Alert>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        initialSort={{ key: 'fullName', dir: 'asc' }}
        searchPlaceholder="Buscar paciente o expediente"
        emptyText="No hay expedientes con ese criterio."
        toolbar={
          <Select
            label="Estado del expediente"
            value={status}
            onChange={setStatus}
            options={[['', 'Todos los estados'], ...Object.entries(RECORD_STATUS).map(([k, v]) => [k, v.label])]}
          />
        }
      />
    </section>
  );
}

// ------------------------------------------------------------------ Consultas (notas SOAP)
export function ConsultationsPage() {
  const { range, filter } = usePeriod('trimestre');
  const [status, setStatus] = useState('');
  const { data, error, loading } = useResource(() => worklistsService.notes({ ...range, status: status || undefined }), [range.from, range.to, status]);
  const columns = [
    { key: 'consultationAt', label: 'Consulta', sortValue: (r) => time(r.consultationAt), render: (r) => fmt.dateTime(r.consultationAt), searchable: false },
    { key: 'patientName', label: 'Paciente', render: (r) => patientLink(r, 'consultas') },
    { key: 'authorName', label: 'Profesional' },
    { key: 'status', label: 'Estado', render: (r) => <StatusBadge tone={NOTE_STATUS[r.status]?.tone}>{NOTE_STATUS[r.status]?.label}</StatusBadge> },
    { key: 'signedAt', label: 'Firma', sortValue: (r) => time(r.signedAt), render: (r) => fmt.dateTime(r.signedAt), searchable: false },
    { key: 'addenda', label: 'Adendas', align: 'right', searchable: false },
  ];
  return (
    <section className="space-y-4">
      <PageHeader title="Consultas" description="Notas clinicas SOAP por consulta. Las notas firmadas solo admiten adendas." />
      {filter}
      <Alert>{error}</Alert>
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        initialSort={{ key: 'consultationAt', dir: 'desc' }}
        searchPlaceholder="Buscar paciente o profesional"
        emptyText="No hay notas en el periodo. Crea una desde la ficha del paciente."
        toolbar={<Select label="Estado de la nota" value={status} onChange={setStatus} options={[['', 'Todas'], ['borrador', 'Borradores'], ['firmada', 'Firmadas']]} />}
      />
    </section>
  );
}

// ------------------------------------------------------------------ Evaluaciones nutricionales
export function EvaluationsPage() {
  const { range, filter } = usePeriod('semestre');
  const { data, error, loading } = useResource(() => worklistsService.evaluations(range), [range.from, range.to]);
  const columns = [
    { key: 'computedAt', label: 'Fecha', sortValue: (r) => time(r.computedAt), render: (r) => fmt.dateTime(r.computedAt), searchable: false },
    { key: 'patientName', label: 'Paciente', render: (r) => patientLink(r, 'evolucion') },
    { key: 'bmi', label: 'IMC', align: 'right', searchable: false, render: (r) => formatResult(r.bmi, 'kg/m2') },
    { key: 'weightChangePct', label: 'Cambio de peso', align: 'right', searchable: false, render: (r) => formatResult(r.weightChangePct, '%') },
    { key: 'energyKcal', label: 'Gasto energetico', align: 'right', searchable: false, render: (r) => formatResult(r.energyKcal, 'kcal/dia') },
    { key: 'adherencePct', label: 'Adherencia', align: 'right', searchable: false, render: (r) => formatResult(r.adherencePct, '%') },
    { key: 'versions', label: 'Formulas', sortable: false, searchable: false, render: (r) => <span className="text-xs text-muted">v{r.versions.join(', v')}</span> },
  ];
  return (
    <section className="space-y-4">
      <PageHeader title="Evaluaciones nutricionales" description="Evaluaciones guardadas con la version de formula usada. Los valores ausentes no se estiman." />
      {filter}
      <Alert>{error}</Alert>
      <DataTable columns={columns} rows={data?.items ?? []} loading={loading} initialSort={{ key: 'computedAt', dir: 'desc' }} searchPlaceholder="Buscar paciente" emptyText="Sin evaluaciones en el periodo." />
    </section>
  );
}

// ------------------------------------------------------------------ Estudios de laboratorio
export function LabsPage() {
  const { range, filter } = usePeriod('anio');
  const { data, error, loading } = useResource(() => worklistsService.labs(range), [range.from, range.to]);
  const columns = [
    { key: 'takenAt', label: 'Toma', sortValue: (r) => time(r.takenAt), render: (r) => fmt.date(r.takenAt), searchable: false },
    { key: 'patientName', label: 'Paciente', render: (r) => patientLink(r, 'laboratorios') },
    { key: 'analyte', label: 'Estudio' },
    { key: 'value', label: 'Resultado', align: 'right', searchable: false, render: (r) => `${fmt.number(r.value, 2)} ${r.unit}` },
    { key: 'referenceRange', label: 'Referencia del laboratorio', render: (r) => r.referenceRange || '—' },
    { key: 'laboratory', label: 'Laboratorio', render: (r) => r.laboratory || '—' },
  ];
  return (
    <section className="space-y-4">
      <PageHeader title="Estudios de laboratorio" description="Resultados capturados con el rango de referencia reportado por cada laboratorio." />
      {filter}
      <Alert>{error}</Alert>
      <DataTable columns={columns} rows={data?.items ?? []} loading={loading} initialSort={{ key: 'takenAt', dir: 'desc' }} searchPlaceholder="Buscar paciente o estudio" emptyText="Sin resultados en el periodo." />
    </section>
  );
}

// ------------------------------------------------------------------ Agenda
export function AgendaPage() {
  const [status, setStatus] = useState('');
  const { data, error, loading } = useResource(() => worklistsService.agenda(), []);
  const now = Date.now();
  const rows = (data?.items ?? []).filter((r) => !status || r.status === status);
  const columns = [
    { key: 'scheduledAt', label: 'Fecha y hora', sortValue: (r) => time(r.scheduledAt), render: (r) => fmt.dateTime(r.scheduledAt), searchable: false },
    { key: 'patientName', label: 'Paciente', render: (r) => patientLink(r, 'consultas') },
    {
      key: 'status',
      label: 'Estado',
      render: (r) => {
        const overdue = r.status === 'programada' && time(r.scheduledAt) < now - 86400000;
        return overdue ? <StatusBadge tone="warning">Vencida sin registrar</StatusBadge> : <StatusBadge tone={r.status === 'realizada' ? 'success' : r.status === 'cancelada' ? 'neutral' : 'info'}>{APPOINTMENT_STATUS[r.status] ?? r.status}</StatusBadge>;
      },
    },
    { key: 'cancelReason', label: 'Observaciones', render: (r) => r.cancelReason ?? '—' },
  ];
  return (
    <section className="space-y-4">
      <PageHeader title="Agenda" description="Citas de los ultimos 7 dias y de los proximos 30." />
      <Alert>{error}</Alert>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        initialSort={{ key: 'scheduledAt', dir: 'asc' }}
        searchPlaceholder="Buscar paciente"
        emptyText="No hay citas en este intervalo."
        toolbar={<Select label="Estado de la cita" value={status} onChange={setStatus} options={[['', 'Todas'], ...Object.entries(APPOINTMENT_STATUS)]} />}
      />
    </section>
  );
}

// ------------------------------------------------------------------ Seguimiento y evolucion
// Alertas de todos los pacientes activos segun las reglas configuradas (Administracion > Reglas de alertas).
export function FollowUpPage() {
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState('pendiente');
  const [priority, setPriority] = useState('');
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useResource(() => alertsService.worklist(status), [status, tick]);
  const items = (data?.items ?? []).filter((a) => !priority || a.priority === priority);
  const review = async (alert, newStatus, note) => {
    await alertsService.review(alert.patientId, alert.key, newStatus, note);
    setTick((t) => t + 1);
  };
  return (
    <section className="space-y-4">
      <PageHeader
        title="Seguimiento y evolucion"
        description="Alertas de los pacientes activos segun las reglas configuradas. Revisa cada una o abre la ficha para ver su evolucion."
      />
      <Alert variant="info">Las alertas senalan registros que conviene revisar; no son diagnosticos ni indican gravedad clinica.</Alert>
      <div className="flex flex-wrap gap-3">
        <Select label="Estado" value={status} onChange={setStatus} options={[['pendiente', 'Pendientes'], ['revisada', 'Revisadas'], ['descartada', 'Descartadas'], ['todas', 'Todas']]} />
        <Select label="Prioridad" value={priority} onChange={setPriority} options={[['', 'Todas las prioridades'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']]} />
        <span className="self-center text-sm text-muted">{items.length} alertas</span>
      </div>
      <Alert>{error}</Alert>
      <div className={`${ui.card} px-6`}>
        {loading && !data && <p className="py-6 text-sm text-muted">Cargando...</p>}
        {data && items.length === 0 && <p className="py-6 text-center text-sm text-muted">Sin alertas con estos filtros.</p>}
        <ul className="divide-y divide-line">
          {items.map((a) => (
            <AlertItem key={`${a.patientId}-${a.key}`} alert={a} showPatient canReview={hasPermission(P.PATIENTS_MANAGE)} onReview={review} />
          ))}
        </ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Reportes
export function ReportsPage() {
  return (
    <section className="space-y-6">
      <PageHeader title="Reportes" description="Indicadores de la consulta. La exportacion de reportes en PDF llegara en una etapa posterior." />
      <Suspense fallback={<p className="text-sm text-muted">Cargando...</p>}>
        <PracticeDashboard />
      </Suspense>
    </section>
  );
}
