import { ChevronDown, LogOut, Moon, Settings } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useAuth } from '../../business/auth/useAuth.js';
import { useTheme } from '../../business/theme/useTheme.js';
import { ROLES } from '../../models/access.model.js';

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

const itemClass =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink outline-none transition hover:bg-tint-strong focus-visible:bg-tint-strong';

// Boton de usuario (esquina superior derecha, en el topbar) con menu: tema, configuracion y salir.
// Accesible con teclado: Enter/Espacio abre, flechas recorren, Esc cierra y devuelve el foco.
export default function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const [position, setPosition] = useState({ top: 0, right: 0 });

  const items = () => [...(menuRef.current?.querySelectorAll('[role^="menuitem"]') ?? [])];

  // El menu se pinta en <body> (portal) y no dentro del topbar: un vidrio dentro de otro vidrio
  // no desenfoca lo que hay detras y el menu se veria transparente. Se posiciona bajo el boton.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onMenuKeyDown(e) {
    const list = items();
    const index = list.indexOf(document.activeElement);
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') list[(index + 1) % list.length]?.focus();
    else if (e.key === 'ArrowUp') list[(index - 1 + list.length) % list.length]?.focus();
    else if (e.key === 'Tab') setOpen(false);
    else return;
    if (e.key !== 'Tab') e.preventDefault();
  }

  async function handleLogout() {
    setLeaving(true);
    await logout();
    navigate('/login', { replace: true });
  }

  const isDark = theme === 'dark';

  return (
    <div ref={rootRef} className="relative print:hidden">
      {open &&
        createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Menu de usuario"
          onKeyDown={onMenuKeyDown}
          className="glass-strong fixed z-50 w-72 origin-top-right rounded-2xl p-2 print:hidden"
          style={{ top: position.top, right: position.right }}
        >
          <div className="mb-1 border-b border-line px-3 pt-2 pb-3">
            <p className="truncate font-semibold">{user?.fullName}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
            <p className="mt-1 text-xs text-highlight">{ROLES[user?.role]?.label ?? user?.roleName ?? user?.role}</p>
          </div>

          <button type="button" role="menuitemcheckbox" aria-checked={isDark} onClick={toggle} className={itemClass}>
            <Moon className="size-[18px] text-muted" aria-hidden="true" />
            <span className="flex-1">Tema oscuro</span>
            <span
              aria-hidden="true"
              className={`relative h-5 w-9 rounded-full transition-colors ${isDark ? 'bg-accent' : 'bg-tint-strong'}`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                  isDark ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/configuracion');
            }}
            className={itemClass}
          >
            <Settings className="size-[18px] text-muted" aria-hidden="true" />
            Configuracion
          </button>

          <div className="my-1 border-t border-line" />

          <button type="button" role="menuitem" onClick={handleLogout} disabled={leaving} className={`${itemClass} text-danger`}>
            <LogOut className="size-[18px]" aria-hidden="true" />
            {leaving ? 'Saliendo...' : 'Salir'}
          </button>
        </div>,
          document.body,
        )}

      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu de ${user?.fullName ?? 'usuario'}`}
        onClick={() => setOpen((v) => !v)}
        className="glass-field flex items-center gap-2.5 rounded-full py-1 pr-3 pl-1 transition hover:border-highlight/50"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent">
          {initials(user?.fullName)}
        </span>
        <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{user?.fullName}</span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
    </div>
  );
}
