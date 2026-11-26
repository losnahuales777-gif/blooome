import { Menu, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../business/auth/useAuth.js';
import { PERMISSIONS as P } from '../../models/access.model.js';
import UserMenu from './UserMenu.jsx';

const todayLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(
  new Date(),
);

// El usuario, el tema y la salida viven en el menu de usuario, en la esquina superior derecha.
export default function Topbar({ onMenuClick }) {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function handleSearch(event) {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/pacientes?q=${encodeURIComponent(q)}` : '/pacientes');
  }

  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 rounded-none border-x-0 border-t-0 px-4 sm:px-6 print:hidden">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-muted hover:bg-tint-strong lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="size-5" />
      </button>

      {hasPermission(P.PATIENTS_VIEW) && (
        <form onSubmit={handleSearch} role="search" className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={80}
            placeholder="Buscar paciente por nombre"
            aria-label="Buscar paciente"
            className="glass-field w-full rounded-full py-2 pr-4 pl-9 text-sm text-ink outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </form>
      )}

      <p className="ml-auto hidden text-sm whitespace-nowrap text-muted capitalize md:block">{todayLabel}</p>
      <div className="ml-auto md:ml-2">
        <UserMenu />
      </div>
    </header>
  );
}
