// Clases reutilizables de Tailwind para mantener un estilo uniforme (ver utilidades glass en index.css).
export const ui = {
  // Contenido clinico sobre superficie clara (sin vidrio); el vidrio queda para navegacion y paneles.
  card: 'surface rounded-2xl',
  input:
    'glass-field block w-full rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20 disabled:opacity-60',
  label: 'mb-1.5 block text-sm font-medium text-ink',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50',
  btnSecondary:
    'glass-field inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium text-ink transition hover:border-highlight/40 disabled:cursor-not-allowed disabled:opacity-50',
  btnDanger:
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50',
  th: 'px-4 py-3 text-left text-xs font-medium text-muted',
  td: 'px-4 py-3 text-sm text-ink',
  fieldError: 'mt-1 text-xs text-danger',
};
