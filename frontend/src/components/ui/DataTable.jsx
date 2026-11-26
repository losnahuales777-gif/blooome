import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ui } from './styles.js';

const normalize = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// Tabla profesional reutilizable: busqueda de texto, ordenamiento por columna (accesible con
// aria-sort) y estado vacio con indicacion.
// columns = [{ key, label, render?, sortValue?, sortable?, align?, searchable? }]
export default function DataTable({ columns, rows, rowKey = 'id', searchPlaceholder = 'Buscar', initialSort, emptyText, loading, toolbar }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(initialSort ?? null);

  const visible = useMemo(() => {
    const q = normalize(query);
    const searchable = columns.filter((c) => c.searchable !== false);
    let out = q ? rows.filter((r) => searchable.some((c) => normalize(c.sortValue ? c.sortValue(r) : r[c.key]).includes(q))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
      out = [...out].sort((a, b) => {
        const x = val(a);
        const y = val(b);
        if (x === y) return 0;
        if (x === null || x === undefined || x === '') return 1;
        if (y === null || y === undefined || y === '') return -1;
        return (x > y ? 1 : -1) * (sort.dir === 'asc' ? 1 : -1);
      });
    }
    return out;
  }, [rows, columns, query, sort]);

  const toggle = (key) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className={`${ui.card} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            className={`${ui.input} pl-9`}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={query}
            maxLength={80}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {toolbar}
        <span className="ml-auto text-sm text-muted">
          {visible.length} de {rows.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-tint">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`${ui.th} ${c.align === 'right' ? 'text-right' : ''}`}
                  >
                    {c.sortable === false ? (
                      c.label
                    ) : (
                      <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                        {c.label}
                        <Icon className={`size-3.5 ${active ? 'text-ink' : 'opacity-50'}`} aria-hidden="true" />
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((r) => (
              <tr key={r[rowKey]} className="hover:bg-tint">
                {columns.map((c) => (
                  <td key={c.key} className={`${ui.td} ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                    {c.render ? c.render(r) : (r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="p-6 text-sm text-muted">Cargando...</p>}
        {!loading && visible.length === 0 && <p className="p-6 text-center text-sm text-muted">{emptyText ?? 'Sin registros.'}</p>}
      </div>
    </div>
  );
}

// Insignia de estado con color semantico y texto (nunca solo color).
export function StatusBadge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-tint-strong text-ink',
    info: 'bg-info/12 text-info',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/12 text-danger',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}
