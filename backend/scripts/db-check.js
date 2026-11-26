// Verifica la conexion con MongoDB Atlas sin modificar datos de negocio:
// conecta, crea indices/catalogo si faltan y muestra cuantos documentos tiene cada coleccion.
// Uso: npm run db:check
import { bootstrapDatabase } from '../src/config/bootstrap.js';
import { closeDb, connectDb } from '../src/config/database.js';
import { env } from '../src/config/env.js';

try {
  const db = await connectDb();
  console.log(`Conectado a la base "${env.MONGODB_DB}".`);
  await bootstrapDatabase();
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  for (const name of names) {
    console.log(`  ${name.padEnd(18)} ${await db.collection(name).estimatedDocumentCount()} documentos`);
  }
} catch (err) {
  console.error(`No se pudo conectar: ${err.name}: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
