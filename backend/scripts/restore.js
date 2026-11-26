// Restaura un respaldo cifrado (.lnbak) en una base NUEVA y verifica que todo coincida.
//
// Por seguridad nunca escribe sobre una base con datos: la base destino debe estar vacia. Despues de
// revisar la base restaurada, cambia MONGODB_DB en .env para usarla.
//
// Uso: npm run restore -- --file backups/<archivo>.lnbak --target <base_nueva>
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { BSON, MongoClient } from 'mongodb';
import { env } from '../src/config/env.js';
import { decryptBuffer } from '../src/utils/crypto.js';

const BACKUP_CONTEXT = 'lanutria.backup.v1';
const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const client = new MongoClient(env.MONGODB_URI, { appName: 'lanutria-restore', serverSelectionTimeoutMS: 10_000 });
try {
  const file = arg('file');
  const target = arg('target');
  if (!file) throw new Error('Indica --file');
  if (!target || !/^[A-Za-z0-9_-]{1,63}$/.test(target)) throw new Error('Indica --target con un nombre de base valido');

  // Descifra y valida la integridad antes de tocar la base.
  const payload = gunzipSync(decryptBuffer(await readFile(file), BACKUP_CONTEXT));
  const data = JSON.parse(payload.toString('utf8'));
  if (data.format !== 1) throw new Error('Formato de respaldo no reconocido');
  const checksum = createHash('sha256').update(payload).digest('hex');

  await client.connect();
  const db = client.db(target);
  const existing = await db.listCollections({}, { nameOnly: true }).toArray();
  if (existing.length) throw new Error(`La base "${target}" no esta vacia; elige otra base de destino`);

  for (const [name, docs] of Object.entries(data.collections)) {
    const rows = BSON.EJSON.deserialize(docs, { relaxed: false });
    if (rows.length) await db.collection(name).insertMany(rows, { ordered: true });
    else await db.createCollection(name);
  }

  // Verificacion: mismos documentos por coleccion que el respaldo.
  const mismatches = [];
  for (const [name, expected] of Object.entries(data.counts)) {
    const got = await db.collection(name).countDocuments();
    if (got !== expected) mismatches.push(`${name}: ${got} de ${expected}`);
  }
  if (mismatches.length) throw new Error(`La verificacion fallo: ${mismatches.join(', ')}`);

  console.log(`Restaurado en "${target}" desde el respaldo de "${data.database}" (${data.createdAt}).`);
  console.log(`  ${Object.keys(data.counts).length} colecciones verificadas. Huella del contenido: ${checksum}`);
  console.log('  Los indices se crean al iniciar la API con MONGODB_DB apuntando a esta base.');
} catch (err) {
  console.error(`Restauracion detenida: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
