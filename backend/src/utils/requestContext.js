// Datos de la peticion que se guardan en la bitacora de auditoria.
export function requestContext(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}
