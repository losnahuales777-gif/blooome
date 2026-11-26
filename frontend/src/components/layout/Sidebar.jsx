import { X } from 'lucide-react';
import { NavLink } from 'react-router';
import { useAuth } from '../../business/auth/useAuth.js';
import { moduleEnabled, useSystemConfig } from '../../business/system/useSystemConfig.js';
import { canSee, NAV_SECTIONS } from '../../models/navigation.model.js';
import { MascotBadge } from '../brand/Logo.jsx';

export default function Sidebar({ open, onClose }) {
  const { hasPermission, user } = useAuth();
  const config = useSystemConfig();
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => canSee(i, hasPermission, user) && moduleEnabled(config, i.module)) })).filter(
    (s) => s.items.length > 0,
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-overlay backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 glass flex w-64 flex-col rounded-none border-y-0 border-l-0 text-ink transition-transform print:hidden duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navegacion principal"
      >
        <div className="flex h-16 items-center gap-3 px-5">
          <MascotBadge className="size-9" />
          <span className="text-xl font-bold">
            Bloo<span className="text-highlight">me</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-muted hover:bg-tint-strong lg:hidden"
            aria-label="Cerrar menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
          {sections.map((section) => (
            <div key={section.label ?? 'principal'}>
              {section.label && <p className="mb-2 px-3 text-xs text-muted">{section.label}</p>}
              <ul className="space-y-1">
                {section.items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
                          isActive
                            ? 'bg-accent/15 font-semibold text-highlight before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r before:bg-accent'
                            : 'text-muted hover:bg-tint hover:text-ink'
                        }`
                      }
                    >
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <p className="px-6 py-4 text-xs text-muted/70">Consulta de adultos de 18 a 60 anos</p>
      </aside>
    </>
  );
}
