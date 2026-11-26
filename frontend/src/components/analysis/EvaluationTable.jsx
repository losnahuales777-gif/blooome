import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { formatResult, KINDS } from '../../models/analysis.model.js';
import { ui } from '../ui/styles.js';

const INPUT_LABELS = {
  weightKg: 'peso',
  heightCm: 'estatura',
  waistCm: 'cintura',
  hipCm: 'cadera',
  bodyFatPct: '% de grasa',
  ageYears: 'edad',
  sex: 'sexo',
  restingKcal: 'tasa metabolica',
  activityFactor: 'factor de actividad',
  expenditureKcal: 'gasto energetico',
  goal: 'objetivo',
  intakeKcal: 'consumo registrado',
  initialKg: 'peso inicial',
  currentKg: 'peso actual',
  targetKg: 'peso objetivo',
  kcal: 'objetivo energetico',
  gPerKg: 'g de proteina por kg (prescripcion)',
  achieved: 'objetivos',
  total: 'objetivos',
  registros: 'registros de consumo',
  mealsFollowed: 'registros de adherencia',
  mealsPlanned: 'registros de adherencia',
};

export function KindBadge({ kind }) {
  const k = KINDS[kind];
  if (!k) return null;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${k.className}`}>{k.label}</span>;
}

function Row({ r, canEdit, onAdjust }) {
  const [open, setOpen] = useState(false);
  const missing = [...new Set(r.missing.map((m) => INPUT_LABELS[m] ?? m))];
  return (
    <>
      <tr className="align-top">
        <td className={ui.td}>
          <button type="button" className="text-left font-medium hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {r.label}
          </button>
        </td>
        <td className={`${ui.td} tabular-nums`}>
          <span className="font-semibold">{formatResult(r.effectiveValue, r.unit)}</span>
          {r.override && (
            <span className="block text-xs text-muted">Calculado: {formatResult(r.override.calculatedValue, r.unit)}</span>
          )}
          {r.value === null && !r.override && (
            <span className="block text-xs text-muted">{r.error ?? (missing.length ? `Falta: ${missing.join(', ')}` : 'Sin datos')}</span>
          )}
        </td>
        <td className={ui.td}>
          <div className="flex flex-wrap gap-1">
            <KindBadge kind={r.kind} />
            {r.override && <KindBadge kind="ajustado" />}
          </div>
        </td>
        <td className={`${ui.td} text-xs text-muted`}>v{r.version}</td>
        <td className={`${ui.td} text-right`}>
          {canEdit && typeof r.value !== 'object' && (
            <button type="button" className={ui.btnSecondary} onClick={() => onAdjust(r)} aria-label={`Ajustar ${r.label}`}>
              <SlidersHorizontal className="size-4" aria-hidden="true" /> Ajustar
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-tint px-4 pb-3 text-xs text-muted">
            <p>{r.reference}</p>
            {r.note && <p className="mt-1">{r.note}</p>}
            {r.override && (
              <p className="mt-1 text-ink">
                Ajuste profesional: {r.override.reason} ({new Date(r.override.adjustedAt).toLocaleDateString('es-MX')})
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// Resultados del motor de calculos con su origen (medido, calculado, estimado, prescrito),
// version de formula y, si existe, el ajuste del profesional junto al valor calculado.
export default function EvaluationTable({ evaluation, canEdit, onAdjust }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-line">
        <thead>
          <tr>
            <th className={ui.th}>Indicador</th>
            <th className={ui.th}>Resultado</th>
            <th className={ui.th}>Origen</th>
            <th className={ui.th}>Formula</th>
            <th className={ui.th}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {evaluation.map((r) => (
            <Row key={r.formula} r={r} canEdit={canEdit} onAdjust={onAdjust} />
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">
        Los valores estimados son orientativos y no constituyen un diagnostico. Selecciona un indicador para ver su referencia
        tecnica.
      </p>
    </div>
  );
}
