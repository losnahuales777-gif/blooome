import { ShieldX } from 'lucide-react';
import { Link } from 'react-router';

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <ShieldX className="size-12 text-muted" aria-hidden="true" />
      <h2 className="text-xl font-semibold text-ink">Acceso restringido</h2>
      <p className="text-sm text-muted">Tu rol no tiene permiso para ver este modulo.</p>
      <Link to="/" className="text-sm font-medium text-highlight hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}
