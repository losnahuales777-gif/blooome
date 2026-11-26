import { ui } from '../ui/styles.js';

// Contenedor de grafica: titulo, descripcion, estado de carga y estado vacio con indicacion.
export function ChartCard({ title, description, loading, empty, emptyText, actions, children, className = '' }) {
  return (
    <section className={`${ui.card} flex min-w-0 flex-col p-6 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </header>
      {loading ? (
        <div className="h-56 animate-pulse rounded-xl bg-tint-strong" aria-label="Cargando" />
      ) : empty ? (
        <p className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line px-4 text-center text-sm text-muted">
          {emptyText ?? 'Sin registros en el periodo seleccionado.'}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

// Cifra clave con etiqueta, origen del dato y contexto.
export function KpiCard({ label, value, unit, hint, kind, tone }) {
  return (
    <div className={`${ui.card} min-w-0 p-4`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'accent' ? 'text-highlight' : 'text-ink'}`}>
        {value ?? '—'}
        {value !== null && value !== undefined && value !== '—' && unit && <span className="ml-1 text-base font-medium text-muted">{unit}</span>}
      </p>
      {(hint || kind) && (
        <p className="mt-1 text-xs text-muted">
          {kind && <span className="mr-1.5 font-medium">{kind}</span>}
          {hint}
        </p>
      )}
    </div>
  );
}

// Tooltip con el estilo del sistema (vidrio, texto con tokens de tinta, color solo en la muestra).
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-sm text-ink">
      <p className="mb-1 font-semibold">{labelFormatter ? labelFormatter(label, payload) : label}</p>
      <ul className="space-y-0.5">
        {payload
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => (
            <li key={p.dataKey ?? p.name} className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ background: p.color ?? p.payload?.fill }} aria-hidden="true" />
              <span className="text-muted">{p.name}</span>
              <span className="ml-auto font-semibold tabular-nums">{valueFormatter ? valueFormatter(p.value, p) : p.value}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

// Leyenda accesible: identidad por color + texto (nunca solo color).
export function Legend({ items }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            className={`inline-block ${i.dashed ? 'h-0 w-4 border-t-2 border-dashed' : 'size-2.5 rounded-sm'}`}
            style={i.dashed ? { borderColor: i.color } : { background: i.color }}
            aria-hidden="true"
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
