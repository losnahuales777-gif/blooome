import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-6xl font-bold text-accent">404</p>
      <p className="text-muted">La pagina que buscas no existe.</p>
      <Link to="/" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-hover">
        Volver al inicio
      </Link>
    </div>
  );
}
