import { RANGE_PRESETS } from '../../models/analysis.model.js';
import { ui } from '../ui/styles.js';

// Filtro de periodo: semana, mes, trimestre, semestre, ano o fechas personalizadas.
export default function RangeFilter({ preset, custom, onPresetChange, onCustomChange }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div role="radiogroup" aria-label="Periodo" className="glass-field flex flex-wrap rounded-xl p-1">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.code}
            type="button"
            role="radio"
            aria-checked={preset === p.code}
            onClick={() => onPresetChange(p.code)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              preset === p.code ? 'bg-accent font-semibold text-on-accent' : 'text-muted hover:bg-tint-strong hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'personalizado' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-muted">
            Desde
            <input
              type="date"
              className={`${ui.input} mt-1 w-auto`}
              value={custom.from ?? ''}
              max={custom.to || undefined}
              onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
            />
          </label>
          <label className="text-sm text-muted">
            Hasta
            <input
              type="date"
              className={`${ui.input} mt-1 w-auto`}
              value={custom.to ?? ''}
              min={custom.from || undefined}
              onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
