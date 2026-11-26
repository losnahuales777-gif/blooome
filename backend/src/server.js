import { createServer } from 'node:http';
import { app } from './app.js';
import { bootstrapDatabase } from './config/bootstrap.js';
import { closeDb, connectDb } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

// La API arranca aunque la base no responda (p. ej. Atlas bloquea la IP actual). Mientras tanto contesta
// 503 con un mensaje claro y reintenta la conexion; antes se apagaba y el usuario solo veia "Error inesperado".
const RETRY_MS = 10_000;
let ready = false;

const UNAVAILABLE = JSON.stringify({
  error: 'No hay conexion con la base de datos. Si tu IP cambio, agregala en MongoDB Atlas (Network Access) y espera unos segundos.',
});

const server = createServer((req, res) => {
  if (ready) return app(req, res);
  res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(RETRY_MS / 1000) });
  res.end(UNAVAILABLE);
});

async function connectWithRetry() {
  try {
    await connectDb();
    await bootstrapDatabase();
    ready = true;
    logger.info('Conexion con MongoDB lista');
  } catch (err) {
    // Mensaje sin la cadena de conexion (contiene credenciales).
    logger.error({ errName: err.name, errMessage: err.message }, `No se pudo conectar a MongoDB; reintento en ${RETRY_MS / 1000} s`);
    await closeDb().catch(() => {});
    setTimeout(connectWithRetry, RETRY_MS);
  }
}

server.listen(env.PORT, () => {
  logger.info(`API escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
  connectWithRetry();
});

function shutdown(signal) {
  logger.info(`${signal} recibido, cerrando servidor...`);
  server.close(async () => {
    await closeDb().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
