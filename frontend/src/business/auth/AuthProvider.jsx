import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeCredentials } from '../../models/auth.model.js';
import { authService } from '../../services/auth.service.js';
import { AuthContext } from './AuthContext.js';

const ANONYMOUS = { user: null, permissions: [] };

// Capa BUSINESS: estado de sesion y reglas de autorizacion del cliente.
// El JWT vive en una cookie HttpOnly; aqui solo se guarda el perfil publico y sus permisos.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(ANONYMOUS);
  const [status, setStatus] = useState('loading');

  const applySession = useCallback(({ user, permissions }) => {
    setSession({ user, permissions });
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let active = true;
    authService
      .me()
      .then((data) => active && applySession(data))
      .catch(() => active && setStatus('anonymous'));
    return () => {
      active = false;
    };
  }, [applySession]);

  // El servidor cerro la sesion (inactividad, cierre desde otro dispositivo o cuenta desactivada).
  useEffect(() => {
    const ended = () => {
      setSession(ANONYMOUS);
      setStatus('anonymous');
    };
    window.addEventListener('lanutria:session-ended', ended);
    return () => window.removeEventListener('lanutria:session-ended', ended);
  }, []);

  const login = useCallback(
    async (credentials) => applySession(await authService.login(normalizeCredentials(credentials))),
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setSession(ANONYMOUS);
      setStatus('anonymous');
    }
  }, []);

  const permissionSet = useMemo(() => new Set(session.permissions), [session.permissions]);
  const hasPermission = useCallback((code) => !code || permissionSet.has(code), [permissionSet]);

  const value = useMemo(
    () => ({
      user: session.user,
      permissions: session.permissions,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      logout,
      hasPermission,
    }),
    [session, status, login, logout, hasPermission],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
