import { MODULES, SettingsBusiness } from '../business/settings.business.js';
import { AppError } from '../utils/AppError.js';

// Bloquea las rutas de un modulo desactivado por el superusuario (el servidor decide, no la interfaz).
export function requireModule(name) {
  if (!MODULES[name]) throw new Error(`Modulo desconocido: ${name}`);
  return async (_req, _res, next) => {
    if (!(await SettingsBusiness.isModuleEnabled(name))) return next(new AppError(403, `El modulo "${MODULES[name]}" esta desactivado`));
    next();
  };
}
