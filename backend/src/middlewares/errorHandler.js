import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { collection } from '../config/database.js';

// Registro tecnico para Sistemas: metodo, ruta con identificadores reemplazados y tipo de error. No se guarda
// el mensaje (puede contener datos) ni el cuerpo de la peticion. Se purga solo a los 90 dias (indice TTL).
function recordSystemError(req, err) {
  try {
    const route = req.originalUrl
      .split('?')[0]
      .replace(/\/[a-f0-9]{24}/gi, '/:id')
      .replace(/\/\d+/g, '/:n');
    collection('erroresSistema')
      .insertOne({
        at: new Date(),
        method: req.method,
        route: route.slice(0, 200),
        errorName: String(err?.name ?? 'Error').slice(0, 80),
        code: err?.code ?? null,
      })
      .catch(() => {});
  } catch {
    // Sin base de datos no hay registro tecnico; el log del servidor ya tiene el detalle.
  }
}

export function notFound(_req, _res, next) {
  next(new AppError(404, 'Recurso no encontrado'));
}

// Nunca se exponen trazas ni mensajes internos al cliente (OWASP A05 - Security Misconfiguration).
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, ...(err.details && { details: err.details }) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON mal formado' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Solicitud demasiado grande' });
  }

  logger.error({ err, path: req.path, method: req.method }, 'Error no controlado');
  recordSystemError(req, err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
