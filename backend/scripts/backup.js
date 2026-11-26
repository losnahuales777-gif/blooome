// Respaldo completo y cifrado de la base (todas las colecciones, incluidos los archivos de GridFS).
//
// El archivo resultante (backups/<base>_<fecha>.lnbak) va comprimido y cifrado con AES-256-GCM usando
// DATA_ENCRYPTION_KEY: sin esa llave no se puede leer. Guarda una copia del respaldo y otra de la llave
// en lugares distintos y fuera de este equipo.
//
// Uso: npm run backup            (respalda la base de MONGODB_DB)
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { BSON } from 'mongodb';
import { closeDb, connectDb } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { encryptBuffer } from '../src/utils/crypto.js';

export const BACKUP_CONTEXT = 'lanutria.backup.v1';

try {
  const db = await connectDb();
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'))
    .sort();
  const collections = {};
  const counts = {};
  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    collections[name] = BSON.EJSON.serialize(docs, { relaxed: false });
    counts[name] = docs.length;
  }
  const createdAt = new Date().toISOString();
  const payload = Buffer.from(JSON.stringify({ format: 1, database: env.MONGODB_DB, createdAt, counts, collections }));
  const checksum = createHash('sha256').update(payload).digest('hex');
  const file = encryptBuffer(gzipSync(payload), BACKUP_CONTEXT);

  await mkdir(new URL('../backups/', import.meta.url), { recursive: true });
  const name = `${env.MONGODB_DB}_${createdAt.replace(/[:.]/g, '-')}.lnbak`;
  await writeFile(new URL(`../backups/${name}`, import.meta.url), file, { mode: 0o600 });
  await writeFile(
    new URL(`../backups/${name}.json`, import.meta.url),
    JSON.stringify({ file: name, database: env.MONGODB_DB, createdAt, counts, sha256: checksum }, null, 2),
  );

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  console.log(`Respaldo creado: backups/${name}`);
  console.log(`  ${names.length} colecciones, ${total} documentos, ${(file.length / 1024).toFixed(1)} KB cifrados`);
  console.log(`  Huella del contenido (SHA-256): ${checksum}`);
} catch (err) {
  console.error(`Respaldo fallido: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
