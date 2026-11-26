import rateLimit from 'express-rate-limit';

const message = (text) => ({ error: text });

// Limite general de la API (mitiga abuso / DoS a nivel de aplicacion).
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: message('Demasiadas solicitudes, intenta mas tarde'),
});

// Asistente de IA: cada sugerencia tiene costo; limite por usuario.
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `ia-${req.user?.id ?? 'anon'}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: message('Alcanzaste el limite de sugerencias por hora; intenta mas tarde'),
});

// Limite estricto para login (mitiga fuerza bruta y credential stuffing).
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: message('Demasiados intentos de inicio de sesion, intenta en 15 minutos'),
});
