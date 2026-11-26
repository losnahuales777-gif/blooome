import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// En desarrollo, el servidor de Vite enciende tambien la API (backend) y la vuelve a levantar si se cae.
// Asi la aplicacion nunca queda con el frontend abierto y la API apagada (el "Error inesperado" al
// volver a entrar). Si la API ya esta corriendo por otro lado (p. ej. `npm start` en backend), no la duplica.
const BACKEND_DIR = fileURLToPath(new URL('../backend/', import.meta.url));
const HEALTH_URL = 'http://localhost:3000/api/health';
const MAX_RESTARTS = 5; // por minuto; evita un ciclo infinito si la API falla al arrancar (p. ej. .env invalido)

// Cualquier respuesta HTTP cuenta: un 503 significa que la API esta viva esperando a la base de datos.
async function apiIsUp() {
  try {
    await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

export default function backendApi() {
  let child = null;
  let stopping = false;
  let restarts = [];

  const log = (msg) => console.log(`\x1b[36m[api]\x1b[0m ${msg}`);

  function start() {
    child = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/server.js'], {
      cwd: BACKEND_DIR,
      // PORT fijo: el lanzador del frontend define PORT=5173 y la API no debe heredarlo (el proxy apunta a 3000).
      env: { ...process.env, NODE_ENV: 'development', PORT: '3000' },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', async (code) => {
      child = null;
      if (stopping) return;
      // Otro proceso ya ocupa el puerto con una API sana: no hay nada que reiniciar.
      if (await apiIsUp()) return;
      const now = Date.now();
      restarts = restarts.filter((t) => now - t < 60_000);
      if (restarts.length >= MAX_RESTARTS) {
        log(`la API se detuvo ${MAX_RESTARTS} veces en un minuto (codigo ${code}). Revisa el error de arriba y backend/.env.`);
        return;
      }
      restarts.push(now);
      log(`la API se detuvo (codigo ${code}); reiniciando...`);
      setTimeout(() => !stopping && start(), 2000);
    });
  }

  function stop() {
    stopping = true;
    if (child) child.kill();
  }

  return {
    name: 'bloome-backend-api',
    apply: 'serve',
    async configureServer(server) {
      if (await apiIsUp()) {
        log('API ya en marcha en http://localhost:3000');
      } else {
        log('encendiendo la API...');
        start();
      }
      server.httpServer?.once('close', stop);
      process.once('exit', stop);
      for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => (stop(), process.exit()));
    },
  };
}
