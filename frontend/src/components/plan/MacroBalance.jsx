import { MACROS } from '../../models/mealPlan.model.js';

// Barra de avance contra la meta. El tramo gris es la meta; el color, lo planeado.
function Bar({ label, value, target, unit, color }) {
  const pct = target > 0 ? value / target : 0;
  const fill = Math.min(pct, 1) * 100;
  const over = pct > 1.1;
  const under = pct < 0.9;
  return (
    <div title={`${label}: ${Math.round(value)} de ${target} ${unit}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-bold">
          <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
          {label}
        </span>
        <span className="tabular-nums">
          <span className="font-bold">{Math.round(value).toLocaleString('es-MX')}</span>
          <span className="text-muted">
            {' '}
            / {target.toLocaleString('es-MX')} {unit}
          </span>
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-tint-strong"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(value)}
      >
        <div className="h-full rounded-full" style={{ width: `${fill}%`, background: color }} />
      </div>
      {(over || under) && value > 0 && (
        <p className="mt-1 text-xs text-muted">
          {over ? `${Math.round((pct - 1) * 100)}% por encima de la meta` : `Faltan ${Math.round(target - value)} ${unit}`}
        </p>
      )}
    </div>
  );
}

export default function MacroBalance({ totals, kcalTarget, targets }) {
  return (
    <div className="space-y-5">
      <Bar label="Energia" value={totals.kcal} target={kcalTarget} unit="kcal" color="var(--c-accent)" />
      {MACROS.map((m) => (
        <Bar key={m.code} label={m.label} value={totals[m.code]} target={targets[m.code]} unit="g" color={m.color} />
      ))}
    </div>
  );
}
