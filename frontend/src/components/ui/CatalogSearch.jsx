import { BookCheck, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { catalogService } from '../../services/chart.service.js';
import { ui } from './styles.js';

// Campo de texto con busqueda en un catalogo autorizado (combobox accesible, WAI-ARIA).
// Si el profesional elige un termino se guarda su codigo, fuente y version; si no hay catalogo
// cargado o no encuentra el termino, puede escribir texto libre.
// value = { text, catalog: { code, source, version } | null }
export default function CatalogSearch({ id, type, label, value, onChange, maxLength = 300, invalid }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [available, setAvailable] = useState(null);
  const listId = useId();
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    catalogService
      .summary()
      .then((r) => alive && setAvailable(r.items.filter((i) => i.type === type)))
      .catch(() => alive && setAvailable([]));
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [type]);

  const hasCatalog = available?.length > 0;

  function handleInput(text) {
    onChange({ text, catalog: null });
    clearTimeout(timer.current);
    if (!hasCatalog || text.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const r = await catalogService.search(type, text.trim());
        setResults(r.items);
        setOpen(true);
        setActive(-1);
      } catch {
        setResults([]);
      }
    }, 250);
  }

  function pick(item) {
    onChange({ text: item.name, catalog: { code: item.code, source: item.source, version: item.version } });
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={invalid || undefined}
          className={`${ui.input} pl-9`}
          maxLength={maxLength}
          value={value.text}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
        />
        {open && (
          <ul id={listId} role="listbox" className="glass-strong absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl py-1 text-sm">
            {results.length === 0 && <li className="px-3 py-2 text-muted">Sin coincidencias: se guardara como texto libre.</li>}
            {results.map((r, i) => (
              <li
                key={`${r.source}-${r.code}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
                className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-accent/15' : 'hover:bg-tint'}`}
              >
                <span className="font-medium">{r.name}</span> <span className="font-mono text-xs text-muted">{r.code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        {value.catalog ? (
          <span className="inline-flex items-center gap-1 text-success">
            <BookCheck className="size-3.5" aria-hidden="true" /> {value.catalog.code} · {value.catalog.source} ({value.catalog.version})
          </span>
        ) : available === null ? (
          ' '
        ) : hasCatalog ? (
          'Escribe para buscar en el catalogo o deja texto libre.'
        ) : (
          'Sin catalogo autorizado cargado: se registra como texto libre.'
        )}
      </p>
    </div>
  );
}
