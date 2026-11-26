// Arranque comun de las pruebas de integracion: API real contra una base TEMPORAL en Atlas
// (MONGODB_URI de .env) que se elimina al terminar. Nunca toca la base de trabajo.
import { randomBytes } from 'node:crypto';

export async function startTestApi(prefix = 'lanutria_prueba') {
  process.env.MONGODB_DB = `${prefix}_${randomBytes(4).toString('hex')}`;
  process.env.NODE_ENV = 'test';

  const { app } = await import('../../src/app.js');
  const { closeDb, connectDb } = await import('../../src/config/database.js');
  const { bootstrapDatabase } = await import('../../src/config/bootstrap.js');
  const { UserModel } = await import('../../src/models/user.model.js');
  const { hashPassword } = await import('../../src/utils/password.js');

  const db = await connectDb();
  await bootstrapDatabase();
  // Contrasena de prueba generada al vuelo: solo existe en la base temporal y nunca se imprime.
  const password = `Pr#${randomBytes(9).toString('base64url')}9a`;
  const hash = await hashPassword(password);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function createUser(email, fullName, roleId) {
    return UserModel.create({ email, fullName, passwordHash: hash, roleId, createdBy: null });
  }

  async function session(email, pass = password) {
    const jar = {};
    const store = (res) =>
      (res.headers.getSetCookie?.() ?? []).forEach((c) => {
        const [k, v] = c.split(';')[0].split('=');
        jar[k] = v;
      });
    store(await fetch(`${base}/auth/csrf`));
    const call = async (method, path, body) => {
      const res = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': jar.csrf_token,
          Cookie: Object.entries(jar)
            .map(([k, v]) => `${k}=${v}`)
            .join('; '),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      store(res);
      return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
    };
    // Peticion sin JSON: cuerpos binarios y acceso a cabeceras de la respuesta.
    const raw = async (method, path, body, headers = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: {
          'X-CSRF-Token': jar.csrf_token,
          Cookie: Object.entries(jar)
            .map(([k, v]) => `${k}=${v}`)
            .join('; '),
          ...headers,
        },
        body,
      });
      store(res);
      return res;
    };
    const login = await call('POST', '/auth/login', { email, password: pass });
    return { call, raw, login };
  }

  async function stop() {
    server.close();
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) await db.collection(name).drop();
    await closeDb();
  }

  return { db, base, createUser, session, stop };
}
