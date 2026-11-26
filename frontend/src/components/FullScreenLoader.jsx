export default function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <div className="size-10 animate-spin rounded-full border-4 border-line border-t-accent" />
      <span className="sr-only">Cargando...</span>
    </div>
  );
}
