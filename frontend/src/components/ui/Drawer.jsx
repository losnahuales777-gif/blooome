import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

// Panel lateral modal: se cierra con Esc o clic fuera y devuelve el foco al cerrarse.
export default function Drawer({ title, onClose, children, footer }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-strong relative flex h-full w-full max-w-lg flex-col rounded-l-3xl border-r-0 outline-none"
      >
        <header className="flex items-center gap-3 border-b border-line px-6 py-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 text-muted hover:bg-tint-strong"
            aria-label="Cerrar panel"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap gap-2 border-t border-line px-6 py-4">{footer}</footer>}
      </section>
    </div>
  );
}
