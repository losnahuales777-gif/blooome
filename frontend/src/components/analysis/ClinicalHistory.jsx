import { Ban, CalendarCheck, CalendarClock, FlaskConical, Pencil, Ruler } from 'lucide-react';
import { APPOINTMENT_STATUS, fmt, GOAL_STATUS, MEASUREMENT_FIELDS } from '../../models/analysis.model.js';
import { ui } from '../ui/styles.js';
import { KindBadge } from './EvaluationTable.jsx';

const summary = (values) =>
  MEASUREMENT_FIELDS.filter((f) => Number.isFinite(values?.[f.key]))
    .map((f) => `${f.label.toLowerCase()} ${fmt.number(values[f.key], 1)} ${f.unit}`)
    .join(', ');

// Historial cronologico (mas reciente primero) de consultas, mediciones y estudios.
export function Timeline({ analysis, canEdit, onCorrect, onCancel }) {
  const items = [
    ...analysis.appointments.map((a) => ({
      at: a.status === 'realizada' ? a.completedAt ?? a.scheduledAt : a.status === 'cancelada' ? a.cancelledAt ?? a.scheduledAt : a.scheduledAt,
      type: 'cita',
      a,
    })),
    ...analysis.measurements.map((m) => ({ at: m.takenAt, type: 'medicion', m })),
    ...analysis.labs.map((l) => ({ at: l.takenAt, type: 'lab', l })),
  ].sort((x, y) => new Date(y.at) - new Date(x.at));

  if (items.length === 0) return <p className="text-sm text-muted">Sin consultas ni evaluaciones registradas.</p>;

  return (
    <ol className="space-y-1 border-l-2 border-line pl-5">
      {items.slice(0, 60).map((i, idx) => {
        const Icon =
          i.type === 'medicion' ? Ruler : i.type === 'lab' ? FlaskConical : i.a.status === 'realizada' ? CalendarCheck : i.a.status === 'cancelada' ? Ban : CalendarClock;
        return (
          <li key={`${i.type}-${idx}`} className="relative py-2">
            <span className="absolute top-3 -left-[31px] flex size-5 items-center justify-center rounded-full bg-canvas ring-2 ring-line">
              <Icon className="size-3 text-muted" aria-hidden="true" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <time className="text-sm font-semibold tabular-nums">{fmt.dateTime(i.at)}</time>
              {i.type === 'cita' && (
                <>
                  <span className="text-sm">Consulta {APPOINTMENT_STATUS[i.a.status]?.toLowerCase()}</span>
                  {i.a.cancelReason && <span className="text-xs text-muted">({i.a.cancelReason})</span>}
                  {canEdit && i.a.status === 'programada' && (
                    <button type="button" className="ml-auto text-sm font-medium text-highlight hover:underline" onClick={() => onCancel(i.a)}>
                      Cancelar cita
                    </button>
                  )}
                </>
              )}
              {i.type === 'medicion' && (
                <>
                  <span className="text-sm">
                    Medicion ({i.m.method}){i.m.supersedes && <span className="text-muted"> (corregida: {i.m.correctionReason})</span>}
                  </span>
                  <KindBadge kind="medido" />
                  {canEdit && (
                    <button type="button" className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-highlight hover:underline" onClick={() => onCorrect(i.m)}>
                      <Pencil className="size-3.5" aria-hidden="true" /> Corregir
                    </button>
                  )}
                  <p className="w-full text-sm text-muted">{summary(i.m.values)}</p>
                </>
              )}
              {i.type === 'lab' && (
                <span className="text-sm">
                  {i.l.analyte}: <span className="font-semibold">{fmt.number(i.l.value, 2)} {i.l.unit}</span>
                  {i.l.referenceRange && <span className="text-muted"> (referencia {i.l.referenceRange})</span>}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LabsTable({ labs }) {
  if (labs.length === 0) return <p className="text-sm text-muted">Sin resultados de laboratorio en el periodo.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-line">
        <thead>
          <tr>
            <th className={ui.th}>Fecha</th>
            <th className={ui.th}>Estudio</th>
            <th className={`${ui.th} text-right`}>Valor</th>
            <th className={ui.th}>Referencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {labs.map((l) => (
            <tr key={l.id}>
              <td className={`${ui.td} whitespace-nowrap`}>{fmt.date(l.takenAt)}</td>
              <td className={ui.td}>{l.analyte}</td>
              <td className={`${ui.td} text-right font-semibold tabular-nums`}>
                {fmt.number(l.value, 2)} <span className="font-normal text-muted">{l.unit}</span>
              </td>
              <td className={`${ui.td} text-muted`}>{l.referenceRange || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GoalsList({ goals, canEdit, onStatus }) {
  if (goals.length === 0) return <p className="text-sm text-muted">Sin objetivos registrados. Agrega el primero para medir su cumplimiento.</p>;
  return (
    <ul className="divide-y divide-line">
      {goals.map((g) => (
        <li key={g.id} className="flex flex-wrap items-center gap-3 py-2.5">
          <span className="min-w-40 flex-1 text-sm">
            {g.description}
            {g.indicator && (
              <span className="block text-xs text-muted">
                Indicador: {g.indicator.formula.replace('_', ' ')} → {g.indicator.targetValue} {g.indicator.unit}
              </span>
            )}
            {(g.periodStart || g.targetDate) && (
              <span className="block text-xs text-muted">
                {g.periodStart && `Desde ${fmt.date(`${g.periodStart}T12:00:00`)}`}
                {g.periodStart && g.targetDate && ' · '}
                {g.targetDate && `Meta: ${fmt.date(`${g.targetDate}T12:00:00`)}`}
              </span>
            )}
          </span>
          {canEdit ? (
            <select
              aria-label={`Estado de ${g.description}`}
              className={`${ui.input} w-auto py-1.5`}
              value={g.status}
              onChange={(e) => onStatus(g, e.target.value)}
            >
              {Object.entries(GOAL_STATUS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-muted">{GOAL_STATUS[g.status]}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
