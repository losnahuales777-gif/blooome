import { useMemo, useState } from 'react';
import { useAuth } from '../../business/auth/useAuth.js';
import { useResource } from '../../business/hooks/useResource.js';
import { fmt, rangeFromPreset } from '../../models/analysis.model.js';
import { TIMELINE_TYPES, timelineTarget } from '../../models/chart.model.js';
import { chartService } from '../../services/chart.service.js';
import RangeFilter from '../charts/RangeFilter.jsx';
import Alert from '../ui/Alert.jsx';
import { ui } from '../ui/styles.js';

// Linea de tiempo clinica: todos los eventos del expediente en orden cronologico, filtrables por
// tipo, periodo y autor. Muestra unicamente registros reales; no rellena huecos.
export default function ClinicalTimeline({ patientId, version, onOpen }) {
  const { user } = useAuth();
  const [preset, setPreset] = useState('anio');
  const [custom, setCustom] = useState({});
  const [types, setTypes] = useState([]);
  const [mine, setMine] = useState(false);
  const range = useMemo(() => rangeFromPreset(preset, custom), [preset, custom]);
  const query = { ...range, types: types.join(',') || undefined, authorId: mine ? user?.id : undefined };
  const { data, error, loading } = useResource(() => chartService.timeline(patientId, query), [patientId, range.from, range.to, types.join(), mine, version]);

  const toggle = (t) => setTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  return (
    <section className={`${ui.card} space-y-4 p-6`} aria-label="Linea de tiempo clinica">
      <h3 className="text-xl font-semibold">Linea de tiempo</h3>
      <RangeFilter preset={preset} custom={custom} onPresetChange={setPreset} onCustomChange={setCustom} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Tipos de evento</legend>
        {Object.entries(TIMELINE_TYPES).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={types.includes(k)}
            onClick={() => toggle(k)}
            className={`rounded-full border px-3 py-1 text-xs transition ${types.includes(k) ? 'border-accent bg-accent/15 font-semibold text-ink' : 'border-line text-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Solo mis registros
        </label>
      </fieldset>
      <Alert>{error}</Alert>
      {loading && !data && <p className="text-sm text-muted">Cargando...</p>}
      {data && data.events.length === 0 && <p className="text-sm text-muted">Sin eventos con estos filtros.</p>}
      {data && (
        <ol className="relative space-y-4 border-l border-line pl-6">
          {data.events.map((e, i) => (
            <li key={`${e.ref?.kind}-${e.ref?.id}-${e.type}-${i}`} className="relative">
              <span className="absolute top-1.5 -left-[1.9rem] size-3 rounded-full border-2 border-surface bg-accent" aria-hidden="true" />
              <p className="text-xs text-muted">
                {fmt.dateTime(e.at)} · {TIMELINE_TYPES[e.type] ?? e.type}
              </p>
              {onOpen && timelineTarget(e.ref) ? (
                <button type="button" onClick={() => onOpen(e.ref)} className="text-left text-sm font-medium text-ink underline-offset-2 hover:underline">
                  {e.title}
                </button>
              ) : (
                <p className="text-sm font-medium">{e.title}</p>
              )}
              {e.detail && <p className="text-sm text-muted">{e.detail}</p>}
            </li>
          ))}
        </ol>
      )}
      {data && data.total > data.events.length && <p className="text-xs text-muted">Mostrando {data.events.length} de {data.total}; acota el periodo para ver el resto.</p>}
    </section>
  );
}
