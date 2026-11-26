import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/AppError.js';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function generateCsrfToken() {
  return randomBytes(32).toString('base64url');
}

// Patron "double submit cookie": el cliente debe reenviar en una cabecera el valor de la cookie.
// Un sitio externo no puede leer la cookie, asi que no puede falsificar la cabecera.
export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken) return next(new AppError(403, 'Token CSRF ausente'));

  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return next(new AppError(403, 'Token CSRF invalido'));
  }
  next();
}
