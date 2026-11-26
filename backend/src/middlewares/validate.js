import { AppError } from '../utils/AppError.js';

// Validacion de entrada con lista blanca (zod). Los datos validados quedan en req.valid.{body,params,query}.
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid = {};
    for (const [source, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(req[source] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
        return next(new AppError(400, 'Datos de entrada invalidos', details));
      }
      req.valid[source] = result.data;
    }
    next();
  };
}
