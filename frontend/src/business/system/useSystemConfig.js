import { useEffect, useState } from 'react';
import { systemService } from '../../services/admin.service.js';

// Configuracion publica del sistema (modulos activos y aviso de mantenimiento) para la sesion actual.
// Solo sirve para ocultar opciones en la interfaz: el servidor bloquea igual los modulos desactivados.
let cached = null;
let pending = null;

export function invalidateSystemConfig() {
  cached = null;
}

export function useSystemConfig() {
  const [config, setConfig] = useState(cached);
  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    pending ??= systemService
      .public()
      .then((c) => (cached = c))
      .catch(() => (cached = { modules: {}, maintenanceMessage: '' }))
      .finally(() => (pending = null));
    pending.then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config ?? { modules: {}, maintenanceMessage: '' };
}

export const moduleEnabled = (config, name) => !name || config.modules?.[name] !== false;
