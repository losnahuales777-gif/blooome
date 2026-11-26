import { AlertTriangle, ArrowLeft, FlaskConical, Mail, Plus, Ruler, Salad, Target } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../business/auth/useAuth.js';
import { useResource } from '../business/hooks/useResource.js';
import { moduleEnabled, useSystemConfig } from '../business/system/useSystemConfig.js';
import { InviteForm, OneTimeCodeDrawer } from './PatientDirectoryPage.jsx';
import { GoalForm, LabForm, MeasurementForm } from '../components/analysis/AnalysisForms.jsx';
import { GoalsList, LabsTable } from '../components/analysis/ClinicalHistory.jsx';
import AlertsPanel from '../components/chart/AlertsPanel.jsx';
import ClinicalHistoryTab from '../components/chart/ClinicalHistoryTab.jsx';
import ClinicalTimeline from '../components/chart/ClinicalTimeline.jsx';
import DiagnosesTab from '../components/chart/DiagnosesTab.jsx';
import DocumentsTab from '../components/chart/DocumentsTab.jsx';
import SoapNotes from '../components/chart/SoapNotes.jsx';
import { ChartCard, KpiCard } from '../components/charts/ChartParts.jsx';
import Alert from '../components/ui/Alert.jsx';
import DataTable, { StatusBadge } from '../components/ui/DataTable.jsx';
import { ui } from '../components/ui/styles.js';
import { PERMISSIONS as P } from '../models/access.model.js';
import { fmt, formatResult, KINDS, latestByField, MEASUREMENT_FIELDS, rangeFromPreset } from '../models/analysis.model.js';
import { ALERT_PRIORITY, PATIENT_TABS, RECORD_STATUS, timelineTarget } from '../models/chart.model.js';
import { ageFrom, GOALS, SEXES } from '../models/patient.model.js';
import { analysisService } from '../services/analysis.service.js';
import { chartService } from '../services/chart.service.js';

const PatientAnalysisPage = lazy(() => import('./PatientAnalysisPage.jsx'));

// Ventana de datos de la ficha (antropometria, laboratorio y evaluaciones): ultimos 3 anos.
const CHART_RANGE = (() => {
  const r = rangeFromPreset('anio');
  return { ...r, from: new Date(Date.now() - 3 * 365 * 86400000).toISOString() };
})();

// Ficha del paciente: encabezado clinico, indicadores, pestanas y linea de tiempo.
export default function PatientChartPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = PATIENT_TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'resumen';
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(P.PATIENTS_MANAGE);
  const systemConfig = useSystemConfig();
  const canInvite = hasPermission(P.PATIENTS_INVITE) && moduleEnabled(systemConfig, 'portal_pacientes');
  const [invite, setInvite] = useState(null);
  const [version, setVersion] = useState(0);
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState('');

  const chart = useResource(() => chartService.get(id), [id, version]);
  const analysis = useResource(() => analysisService.get(id, CHART_RANGE), [id, version]);
  const reload = () => setVersion((v) => v + 1);
  const c = chart.data;
  const a = analysis.data;

  const saved = (fn, text) => async (payload) => {
    await fn(payload);
    setPanel(null);
    setNotice(text);
    reload();
  };

  if (chart.error) {
    return (
      <section className="space-y-4">
        <Link to="/pacientes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" /> Pacientes
        </Link>
        <Alert>{chart.error}</Alert>
      </section>
    );
  }
  if (!c) return <p className="text-sm text-muted">Cargando expediente...</p>;

  const p = c.patient;
  const latest = latestByField(a?.measurements);
  const result = (f) => a?.evaluation.find((r) => r.formula === f);
  const kindOf = (r) => r && (r.override ? KINDS.ajustado.label : KINDS[r.kind]?.label);
  const bmi = result('imc');
  const energy = result('gasto_energetico_total');
  const adherence = result('adherencia_plan');
  const goals = a?.goals ?? [];
  const delta = (f, unit) => {
    const l = latest[f];
    if (!l?.previous) return l ? `${fmt.date(l.takenAt)} · ${l.method}` : 'sin medicion';
    const d = l.value - l.previous.value;
    return `${d > 0 ? '+' : ''}${fmt.number(d)} ${unit} vs ${fmt.date(l.previous.takenAt)} · ${l.method}`;
  };
  const openEvent = (ref) => {
    const target = timelineTarget(ref);
    if (target) setParams(Object.fromEntries(Object.entries(target).filter(([, v]) => v)), { replace: false });
  };
  const status = RECORD_STATUS[p.recordStatus] ?? RECORD_STATUS.activo;

  return (
    <section className="space-y-6">
      {/* Encabezado clinico */}
      <header className={`${ui.card} p-6`}>
        <Link to="/pacientes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden="true" /> Pacientes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{p.fullName}</h1>
            <p className="mt-1 text-sm text-muted">
              <span className="font-mono">{p.recordNumber}</span> · {ageFrom(p.birthDate)} anos · {SEXES.find((s) => s.code === p.sex)?.label ?? p.sex} ·{' '}
              {GOALS.find((g) => g.code === p.goal)?.label}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={status.tone}>Expediente {status.label.toLowerCase()}</StatusBadge>
            {canInvite && (
              <button type="button" className={ui.btnSecondary} onClick={() => setInvite({ step: 'form' })}>
                <Mail className="size-4" aria-hidden="true" /> Invitar al portal
              </button>
            )}
          </div>
        </div>
        {invite?.step === 'form' && <InviteForm patient={p} onClose={() => setInvite(null)} onDone={(result) => setInvite({ step: 'code', result })} />}
        {invite?.step === 'code' && <OneTimeCodeDrawer title="Invitacion al portal" result={invite.result} onClose={() => setInvite(null)} />}
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">Ultima consulta</dt>
            <dd className="font-medium">{fmt.dateTime(c.lastConsultationAt)}</dd>
          </div>
          <div>
            <dt className="text-muted">Proxima consulta</dt>
            <dd className="font-medium">{c.nextAppointment ? fmt.dateTime(c.nextAppointment.scheduledAt) : 'Sin programar'}</dd>
          </div>
          <div>
            <dt className="text-muted">Profesional responsable</dt>
            <dd className="font-medium">{p.nutritionistName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Notas</dt>
            <dd className="font-medium">
              {c.notes.filter((n) => n.status === 'firmada').length} firmadas, {c.notes.filter((n) => n.status === 'borrador').length} en borrador
            </dd>
          </div>
        </dl>
        {c.alerts.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Avisos del expediente">
            {c.alerts.map((al, i) => (
              <li key={i} className="inline-flex items-center gap-1.5" title={`${al.origin}${al.at ? ` · ${fmt.dateTime(al.at)}` : ''}`}>
                <StatusBadge tone={ALERT_PRIORITY[al.priority]?.tone}>
                  <AlertTriangle className="mr-1 size-3.5" aria-hidden="true" />
                  {al.reason}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* Indicadores principales: valor, unidad, fecha y origen del dato */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Peso" value={fmt.number(latest.weightKg?.value ?? null)} unit="kg" kind={latest.weightKg && KINDS.medido.label} hint={delta('weightKg', 'kg')} />
        <KpiCard
          label="IMC"
          value={formatResult(bmi?.effectiveValue, 'kg/m2')}
          kind={kindOf(bmi)}
          hint={bmi?.value != null && latest.weightKg ? `calculado con la medicion del ${fmt.date(latest.weightKg.takenAt)} · v${bmi.version}` : null}
        />
        <KpiCard label="Cintura" value={fmt.number(latest.waistCm?.value ?? null)} unit="cm" kind={latest.waistCm && KINDS.medido.label} hint={delta('waistCm', 'cm')} />
        <KpiCard
          label="Grasa corporal"
          value={fmt.number(latest.bodyFatPct?.value ?? null)}
          unit="%"
          kind={latest.bodyFatPct && KINDS.medido.label}
          hint={latest.bodyFatPct ? delta('bodyFatPct', '%') : 'sin medicion de composicion corporal'}
        />
        <KpiCard
          label="Requerimiento energetico"
          value={formatResult(energy?.effectiveValue, 'kcal/dia')}
          kind={kindOf(energy)}
          hint={energy?.reference ? `${energy.reference} · v${energy.version}` : energy?.version && `formula v${energy.version}`}
        />
        <KpiCard label="Adherencia registrada" value={formatResult(adherence?.effectiveValue, '%')} kind={kindOf(adherence)} hint="comidas seguidas / planificadas" />
        <KpiCard
          label="Objetivos"
          value={goals.length ? `${goals.filter((g) => g.status === 'cumplido').length} de ${goals.length}` : null}
          kind={goals.length ? 'Registrado' : null}
          hint={goals.length ? `${goals.filter((g) => g.status === 'pendiente').length} pendientes` : 'sin objetivos'}
        />
        <KpiCard label="Peso objetivo" value={fmt.number(p.targetWeightKg ?? null)} unit="kg" kind={p.targetWeightKg ? KINDS.prescrito.label : null} tone="accent" />
      </div>

      {/* Pestanas */}
      <nav aria-label="Secciones del expediente">
        <ul role="tablist" className="flex flex-wrap gap-1 border-b border-line">
          {PATIENT_TABS.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setParams(t.key === 'resumen' ? {} : { tab: t.key }, { replace: true })}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition ${
                  tab === t.key ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <Alert variant="success">{notice}</Alert>
      <Alert>{analysis.error}</Alert>

      <div role="tabpanel">
        {tab === 'resumen' && (
          <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
            <div className="space-y-6">
              <AlertsPanel patientId={p.id} canReview={canEdit} version={version} onChanged={reload} />
              <ChartCard title="Datos faltantes" description="Completa estos datos en la Historia clinica.">
                {c.missing.length === 0 ? (
                  <p className="text-sm text-muted">Expediente completo en los campos basicos.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {c.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
              </ChartCard>
              <ChartCard title="Problemas y tratamientos vigentes">
                <ul className="space-y-2 text-sm">
                  {c.diagnoses
                    .filter((d) => d.status === 'activo')
                    .map((d) => (
                      <li key={d.id}>
                        <span className="font-medium">Diagnostico:</span> {d.problem}
                      </li>
                    ))}
                  {c.history
                    .filter((h) => ['alergia', 'medicamento', 'suplemento', 'enfermedad'].includes(h.category) && h.status === 'activo')
                    .map((h) => (
                      <li key={h.id}>
                        <span className="font-medium">{c.categories[h.category]}:</span> {h.description}
                        {h.dose && ` (${h.dose}${h.frequency ? `, ${h.frequency}` : ''})`}
                      </li>
                    ))}
                  {!c.diagnoses.some((d) => d.status === 'activo') && !c.history.some((h) => h.status === 'activo') && <li className="text-muted">Sin registros vigentes.</li>}
                </ul>
              </ChartCard>
            </div>
            <ClinicalTimeline patientId={p.id} version={version} onOpen={openEvent} />
          </div>
        )}

        {tab === 'historia' && <ClinicalHistoryTab chart={c} canEdit={canEdit} onChanged={reload} />}

        {tab === 'consultas' && (
          <SoapNotes
            key={params.get('nota') ?? 'notas'}
            patientId={p.id}
            notes={c.notes}
            history={c.history}
            categories={c.categories}
            initialNoteId={params.get('nota')}
            canEdit={canEdit}
            onChanged={reload}
          />
        )}

        {tab === 'antropometria' && (
          <div className="space-y-3">
            {canEdit && (
              <button type="button" className={ui.btnPrimary} onClick={() => setPanel('measurement')}>
                <Ruler className="size-4" aria-hidden="true" /> Nueva medicion
              </button>
            )}
            <DataTable
              loading={analysis.loading && !a}
              rows={[...(a?.measurements ?? [])].reverse()}
              initialSort={{ key: 'takenAt', dir: 'desc' }}
              searchPlaceholder="Buscar metodo"
              emptyText="Sin mediciones registradas."
              columns={[
                { key: 'takenAt', label: 'Fecha', sortValue: (m) => new Date(m.takenAt).getTime(), render: (m) => fmt.dateTime(m.takenAt), searchable: false },
                ...MEASUREMENT_FIELDS.filter((f) => ['weightKg', 'waistCm', 'hipCm', 'bodyFatPct', 'muscleMassKg'].includes(f.key)).map((f) => ({
                  key: f.key,
                  label: `${f.label}${f.unit ? ` (${f.unit})` : ''}`,
                  align: 'right',
                  searchable: false,
                  sortValue: (m) => m.values[f.key] ?? null,
                  render: (m) => fmt.number(m.values[f.key] ?? null),
                })),
                { key: 'method', label: 'Metodo' },
                { key: 'source', label: 'Origen', render: (m) => (m.supersedes ? 'Correccion' : 'Medido'), searchable: false },
              ]}
            />
          </div>
        )}

        {tab === 'laboratorios' && (
          <ChartCard
            title="Estudios de laboratorio"
            description="Ultimos 3 anos, con la referencia reportada por el laboratorio."
            loading={analysis.loading && !a}
            actions={
              canEdit && (
                <button type="button" className={ui.btnPrimary} onClick={() => setPanel('lab')}>
                  <FlaskConical className="size-4" aria-hidden="true" /> Registrar resultado
                </button>
              )
            }
          >
            {a && <LabsTable labs={a.labs} />}
          </ChartCard>
        )}

        {tab === 'diagnosticos' && (
          <DiagnosesTab patientId={p.id} diagnoses={c.diagnoses} evaluations={[...(a?.evaluations ?? [])].reverse()} notes={c.notes} canEdit={canEdit} onChanged={reload} />
        )}

        {tab === 'plan' && (
          <ChartCard title="Plan nutricional" description="La prescripcion se edita en el modulo de planes alimenticios.">
            <div className="space-y-3 text-sm">
              <p>
                Energia prescrita: <span className="font-semibold">{formatResult(a?.targets.kcal, 'kcal/dia')}</span>
              </p>
              <p>Macronutrientes: {formatResult(a?.targets.macros, '')}</p>
              <Link to={`/plan-alimenticio?paciente=${p.id}`} className={ui.btnPrimary}>
                <Salad className="size-4" aria-hidden="true" /> Abrir plan alimenticio
              </Link>
            </div>
          </ChartCard>
        )}

        {tab === 'objetivos' && (
          <ChartCard
            title="Objetivos"
            description="Pueden vincularse a un diagnostico para medir su resolucion."
            loading={analysis.loading && !a}
            actions={
              canEdit && (
                <button type="button" className={ui.btnPrimary} onClick={() => setPanel('goal')}>
                  <Target className="size-4" aria-hidden="true" /> <Plus className="-ml-1 size-3" aria-hidden="true" /> Objetivo
                </button>
              )
            }
          >
            {a && (
              <GoalsList
                goals={a.goals}
                canEdit={canEdit}
                onStatus={async (g, s) => {
                  await analysisService.setGoalStatus(p.id, g.id, s);
                  reload();
                }}
              />
            )}
          </ChartCard>
        )}

        {tab === 'evolucion' && (
          <Suspense fallback={<p className="text-sm text-muted">Cargando...</p>}>
            <PatientAnalysisPage embedded patientId={p.id} />
          </Suspense>
        )}

        {tab === 'documentos' && <DocumentsTab patientId={p.id} notes={c.notes} canEdit={canEdit} />}
      </div>

      {panel === 'measurement' && <MeasurementForm previous={latest} onClose={() => setPanel(null)} onSave={saved((d) => analysisService.addMeasurement(p.id, d), 'Medicion registrada.')} />}
      {panel === 'lab' && <LabForm onClose={() => setPanel(null)} onSave={saved((d) => analysisService.addLab(p.id, d), 'Resultado registrado.')} />}
      {panel === 'goal' && <GoalForm diagnoses={c.diagnoses.filter((d) => d.status === 'activo')} onClose={() => setPanel(null)} onSave={saved((d) => analysisService.addGoal(p.id, d), 'Objetivo agregado.')} />}
    </section>
  );
}
