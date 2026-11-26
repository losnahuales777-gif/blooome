import { AuthBusiness } from '../business/auth.business.js';
import { SettingsBusiness } from '../business/settings.business.js';
import { SessionModel } from '../models/session.model.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

export const ACCESS_COOKIE = 'access_token';

// El JWT viaja en una cookie HttpOnly: inaccesible desde JavaScript (mitiga robo por XSS).
export async function authenticate(req, _res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return next(new AppError(401, 'No autenticado'));

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new AppError(401, 'Sesion expirada o invalida'));
  }

  // Sesion del servidor: debe existir, no estar revocada y no superar el tiempo de inactividad.
  const session = await SessionModel.findActive(payload.sid);
  if (!session || session.userId !== Number(payload.sub)) return next(new AppError(401, 'Sesion expirada o invalida'));
  const idleMs = Date.now() - session.lastSeenAt.getTime();
  const { security } = await SettingsBusiness.get();
  if (idleMs > security.sessionIdleMinutes * 60000) {
    await SessionModel.revoke(session._id, 'inactividad');
    return next(new AppError(401, 'La sesion se cerro por inactividad'));
  }
  // Se registra la actividad como maximo una vez por minuto (evita una escritura por peticion).
  if (idleMs > 60000) await SessionModel.touch(session._id);

  // Cuenta desactivada o eliminada => la sesion deja de ser valida de inmediato.
  const { user, permissions } = await AuthBusiness.resolveSession(Number(payload.sub));
  req.user = {
    id: user.id,
    role: user.role,
    level: user.role_level,
    family: user.role_family,
    patientId: user.patient_id ?? null,
    permissions,
    sid: session._id,
  };
  next();
}

// Exige AL MENOS UNO de los permisos indicados (p. ej. reportes: clinico o administrativo).
export function requireAnyPermission(...codes) {
  return (req, _res, next) => {
    if (!req.user || !codes.some((code) => req.user.permissions.has(code))) {
      return next(new AppError(403, 'No tienes permisos para esta accion'));
    }
    next();
  };
}

// Control de acceso por permiso (OWASP A01 - Broken Access Control). Exige TODOS los indicados.
export function requirePermission(...codes) {
  return (req, _res, next) => {
    if (!req.user || !codes.every((code) => req.user.permissions.has(code))) {
      return next(new AppError(403, 'No tienes permisos para esta accion'));
    }
    next();
  };
}
