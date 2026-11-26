import { ui } from './styles.js';

export default function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
      <span>
        {total} resultado{total === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={ui.btnSecondary} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </button>
        <span>
          {page} / {pages}
        </span>
        <button type="button" className={ui.btnSecondary} disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
