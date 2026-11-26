// Entrada de la API en Vercel (funcion serverless). Reutiliza la misma app de Express que src/server.js.
// La conexion a MongoDB se abre una vez por instancia y se reutiliza entre peticiones.
import { app } from '../backend/src/app.js';
import { bootstrapDatabase } from '../backend/src/config/bootstrap.js';
import { closeDb, connectDb } from '../backend/src/config/database.js';
import { logger } from '../backend/src/config/logger.js';

let ready = null;

function ensureDb() {
  ready ??= (async () => {
    await connectDb();
    await bootstrapDatabase();
  })().catch(async (err) => {
    ready = null; // la siguiente peticion vuelve a intentar
    await closeDb().catch(() => {});
    throw err;
  });
  return ready;
}

export default async function handler(req, res) {
  try {
    await ensureDb();
  } catch (err) {
    // Sin la cadena de conexion en el registro (contiene credenciales).
    logger.error({ errName: err.name, errMessage: err.message }, 'No se pudo conectar a MongoDB');
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(
      JSON.stringify({ error: 'No hay conexion con la base de datos. Revisa MONGODB_URI y el acceso de red en MongoDB Atlas.' }),
    );
  }
  return app(req, res);
}
