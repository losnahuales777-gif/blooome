import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const OPTIONS = { algorithm: 'HS256', issuer: 'lanutria-api', audience: 'lanutria-web' };

// El token solo identifica al usuario; rol y permisos se consultan en la base en cada peticion.
// sid = sesion del servidor que respalda el token (se puede revocar antes de que caduque).
export function signAccessToken(user, sid) {
  return jwt.sign({ sub: String(user.id), sid }, env.JWT_SECRET, {
    ...OPTIONS,
    expiresIn: `${env.JWT_EXPIRES_MINUTES}m`,
  });
}

export function verifyAccessToken(token) {
  // Se fija el algoritmo para impedir ataques de "alg: none" o confusion de algoritmos.
  return jwt.verify(token, env.JWT_SECRET, { ...OPTIONS, algorithms: [OPTIONS.algorithm] });
}
