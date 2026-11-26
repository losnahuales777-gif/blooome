import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

export const ThemeContext = createContext(null);

const STORAGE_KEY = 'lanutria-theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function readPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

// Capa BUSINESS: preferencia de tema ('light' | 'dark' | 'system') y tema efectivo.
// El script de index.html aplica el tema guardado antes de pintar para evitar parpadeos.
export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);

  useEffect(() => {
    const query = darkQuery();
    const onChange = (e) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const setPreference = useCallback((next) => {
    const root = document.documentElement;
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Almacenamiento bloqueado: la preferencia dura solo esta sesion.
    }
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    setPreferenceState(next);
  }, []);

  const theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  const toggle = useCallback(() => setPreference(theme === 'dark' ? 'light' : 'dark'), [theme, setPreference]);

  const value = useMemo(() => ({ theme, preference, setPreference, toggle }), [theme, preference, setPreference, toggle]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}
