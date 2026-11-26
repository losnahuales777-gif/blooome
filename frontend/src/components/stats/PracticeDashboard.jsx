import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useResource } from '../../business/hooks/useResource.js';
import { fmt, rangeFromPreset } from '../../models/analysis.model.js';
import { GOALS } from '../../models/patient.model.js';
import { statsService } from '../../services/analysis.service.js';
import { ChartCard, KpiCard } from '../charts/ChartParts.jsx';
import RangeFilter from '../charts/RangeFilter.jsx';
import { AgeBmiScatter, Donut, Heatmap, Histogram, MonthlyBars, MonthlyLine } from '../charts/StatsCharts.jsx';
import Alert from '../ui/Alert.jsx';
import { ui } from '../ui/styles.js';

function AlertList({ title, items, render, empty }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4 text-chart-3" aria-hidden="true" /> {title}
        <span className="text-muted">({items.length})</span>
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.slice(0, 8).map((i) => (
            <li key={`${i.patientId}-${i.scheduledAt ?? ''}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <Link to={`/pacientes/${i.patientId}`} className="font-medium hover:underline">
                {i.fullName}
              </Link>
              <span className="text-muted">{render(i)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Dashboard administrativo: cifras de los pacientes del nutriologo (o de todo el consultorio
// para el super usuario), agregadas en el servidor.
export default function PracticeDashboard() {
  const [preset, setPreset] = useState('anio');
  const [custom, setCustom] = useState({});
  const range = useMemo(() => rangeFromPreset(preset, custom), [preset, custom]);
  const { data: s, error, loading } = useResource(() => statsService.overview(range), [range.from, range.to]);
  const k = s?.kpis;
  const goalData = s ? GOALS.map((g) => ({ label: g.label, value: s.goals[g.code] ?? 0 })).filter((d) => d.value > 0) : [];

  return (
    <section aria-labelledby="practice-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="practice-title" className="text-2xl font-semibold">
            Indicadores del consultorio
          </h2>
          <p className="text-muted">
            {s?.scope === 'all' ? 'Todos los nutriologos.' : 'Tus pacientes.'} Consultas, seguimiento y resultados del periodo.
          </p>
        </div>
        <RangeFilter preset={preset} custom={custom} onPresetChange={setPreset} onCustomChange={setCustom} />
      </div>
      <Alert>{error}</Alert>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Pacientes activos" value={k?.activePatients} />
        <KpiCard label="Inactivos" value={k?.inactivePatients} />
        <KpiCard label="Nuevos" value={k?.newPatients} hint="en el periodo" />
        <KpiCard label="Citas proximas" value={k?.appointments.scheduled} />
        <KpiCard label="Consultas realizadas" value={k?.appointments.done} />
        <KpiCard label="Canceladas o no asistidas" value={k ? k.appointments.cancelled + k.appointments.missed : null} />
        <KpiCard label="Asistencia" value={fmt.number(k?.attendancePct)} unit="%" tone="accent" />
        <KpiCard label="Adherencia registrada" value={fmt.number(k?.adherencePct)} unit="%" tone="accent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Pacientes activos e inactivos" loading={loading && !s} empty={k && k.activePatients + k.inactivePatients === 0} emptyText="Aun no hay pacientes registrados.">
          {k && (
            <Donut
              data={[
                { label: 'Activos', value: k.activePatients },
                { label: 'Inactivos', value: k.inactivePatients },
              ]}
            />
          )}
        </ChartCard>
        <ChartCard title="Objetivos nutricionales" loading={loading && !s} empty={!goalData.length} emptyText="Sin pacientes con objetivo registrado.">
          <Donut data={goalData} />
        </ChartCard>
        <ChartCard title="Pacientes nuevos por mes" loading={loading && !s} empty={!s?.monthly.some((m) => m.newPatients)}>
          {s && <MonthlyBars data={s.monthly} series={[{ key: 'newPatients', label: 'Pacientes nuevos' }]} />}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Consultas por mes"
          description="Realizadas, canceladas, no asistidas (programadas vencidas sin registrar) y programadas."
          loading={loading && !s}
          empty={!s?.monthly.some((m) => m.done + m.cancelled + m.missed + m.scheduled)}
        >
          {s && (
            <MonthlyBars
              stack
              data={s.monthly}
              series={[
                { key: 'done', label: 'Realizadas' },
                { key: 'scheduled', label: 'Programadas' },
                { key: 'cancelled', label: 'Canceladas' },
                { key: 'missed', label: 'No asistidas' },
              ]}
            />
          )}
        </ChartCard>
        <ChartCard title="Horarios de consulta" description="Consultas por dia y hora." loading={loading && !s} empty={!s?.heatmap.length}>
          {s && <Heatmap cells={s.heatmap} />}
        </ChartCard>
        <ChartCard title="IMC promedio por mes" description="Promedio de las mediciones vigentes del mes." loading={loading && !s} empty={!s?.indicators.some((r) => Number.isFinite(r.avgBmi))}>
          {s && <MonthlyLine data={s.indicators} dataKey="avgBmi" label="IMC promedio" unit="kg/m²" />}
        </ChartCard>
        <ChartCard title="Adherencia registrada por mes" loading={loading && !s} empty={!s?.monthly.some((m) => Number.isFinite(m.adherencePct))}>
          {s && <MonthlyLine data={s.monthly} dataKey="adherencePct" label="Adherencia" unit="%" domain={[0, 100]} />}
        </ChartCard>
        <ChartCard title="Distribucion del IMC" description="Pacientes activos, ultima medicion." loading={loading && !s} empty={!s?.bmiHistogram.length}>
          {s && <Histogram bins={s.bmiHistogram} unit="kg/m²" />}
        </ChartCard>
        <ChartCard title="Edad e IMC" description="Un punto por paciente activo." loading={loading && !s} empty={!s?.ageBmi.length}>
          {s && <AgeBmiScatter points={s.ageBmi} />}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Alertas de seguimiento" loading={loading && !s}>
          {s && (
            <div className="space-y-5">
              <AlertList
                title="Citas vencidas sin registrar"
                items={s.alerts.overdueAppointments}
                render={(i) => fmt.dateTime(i.scheduledAt)}
                empty="Ninguna."
              />
              <AlertList
                title="Sin seguimiento (6 semanas o mas)"
                items={s.alerts.withoutFollowUp}
                render={(i) => (i.lastVisitAt ? `ultima consulta ${fmt.date(i.lastVisitAt)}` : 'sin consultas')}
                empty="Todos tienen seguimiento."
              />
              <AlertList
                title="Sin mediciones en 60 dias"
                items={s.alerts.withoutRecentMeasurements}
                render={(i) => (i.lastMeasurementAt ? `ultima ${fmt.date(i.lastMeasurementAt)}` : 'sin mediciones')}
                empty="Todos tienen mediciones recientes."
              />
            </div>
          )}
        </ChartCard>

        <ChartCard title="Estadisticas mensuales y anuales" loading={loading && !s}>
          {s && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line">
                <thead>
                  <tr>
                    <th className={ui.th}>Periodo</th>
                    <th className={`${ui.th} text-right`}>Nuevos</th>
                    <th className={`${ui.th} text-right`}>Realizadas</th>
                    <th className={`${ui.th} text-right`}>Canceladas</th>
                    <th className={`${ui.th} text-right`}>No asistidas</th>
                    <th className={`${ui.th} text-right`}>Adherencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...s.monthly].reverse().map((m) => (
                    <tr key={m.month}>
                      <td className={ui.td}>{fmt.month(m.month)}</td>
                      <td className={`${ui.td} text-right tabular-nums`}>{m.newPatients}</td>
                      <td className={`${ui.td} text-right tabular-nums`}>{m.done}</td>
                      <td className={`${ui.td} text-right tabular-nums`}>{m.cancelled}</td>
                      <td className={`${ui.td} text-right tabular-nums`}>{m.missed}</td>
                      <td className={`${ui.td} text-right tabular-nums`}>{Number.isFinite(m.adherencePct) ? `${fmt.number(m.adherencePct)}%` : '—'}</td>
                    </tr>
                  ))}
                  {s.yearly.map((y) => (
                    <tr key={y.year} className="bg-tint font-semibold">
                      <td className={ui.td}>Total {y.year}</td>
                      <td className={`${ui.td} text-right tabular-nums`}>{y.newPatients}</td>
                      <td className={`${ui.td} text-right tabular-nums`}>{y.done}</td>
                      <td className={`${ui.td} text-right tabular-nums`}>{y.cancelled}</td>
                      <td className={`${ui.td} text-right tabular-nums`}>{y.missed}</td>
                      <td className={ui.td} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
