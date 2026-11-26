import pino from 'pino';
import { env } from './env.js';

// Nunca se registran contrasenas, cookies ni tokens (OWASP A09 - Logging & Monitoring).
export const logger = pino({
  level: env.isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
});
