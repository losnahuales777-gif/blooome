// Migracion de la etapa 6: cifra los datos sensibles guardados antes de activar el cifrado.
//   - Pacientes: telefono e identificacion ampliada.
//   - Notas: SOAP, adendas y versiones de las notas.
//   - Documentos y adjuntos de GridFS.
// Es idempotente: lo ya cifrado se deja igual. Haz un respaldo (npm run backup) antes de aplicarla.
//
// Uso:  npm run migrate:stage6            (simulacion: cuenta lo que cifraria)
//       npm run migrate:stage6 -- --apply (cifra)
import { Readable } from 'node:stream';
import { bucket, closeDb, collection, connectDb } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { AuditModel } from '../src/models/audit.model.js';
import { NOTE_ENC } from '../src/models/chart.model.js';
import { DOCUMENT_ENC } from '../src/models/document.model.js';
import { PATIENT_ENC } from '../src/models/patient.model.js';
import { encryptBuffer, encryptValue, isEncrypted, isEncryptedBuffer } from '../src/utils/crypto.js';

const APPLY = process.argv.includes('--apply');
const counts = { pacientes: 0, notas: 0, versiones: 0, archivos: 0 };
const plain = (v) => v !== null && v !== undefined && v !== '' && !isEncrypted(v);

try {
  await connectDb();
  console.log(`Base "${env.MONGODB_DB}" — ${APPLY ? 'APLICANDO cifrado' : 'SIMULACION (sin escribir)'}`);

  for (const p of await collection('patients')
    .find({}, { projection: { phone: 1, identification: 1 } })
    .toArray()) {
    const set = {};
    if (plain(p.phone)) set.phone = encryptValue(p.phone, PATIENT_ENC.phone);
    if (plain(p.identification)) set.identification = encryptValue(p.identification, PATIENT_ENC.identification);
    if (Object.keys(set).length) {
      counts.pacientes += 1;
      if (APPLY) await collection('patients').updateOne({ _id: p._id }, { $set: set });
    }
  }

  for (const n of await collection('notasClinicas')
    .find({}, { projection: { soap: 1, addenda: 1 } })
    .toArray()) {
    const set = {};
    if (plain(n.soap)) set.soap = encryptValue(n.soap, NOTE_ENC.soap);
    if ((n.addenda ?? []).some((a) => plain(a.text))) {
      set.addenda = n.addenda.map((a) => (plain(a.text) ? { ...a, text: encryptValue(a.text, NOTE_ENC.addendum) } : a));
    }
    if (Object.keys(set).length) {
      counts.notas += 1;
      if (APPLY) await collection('notasClinicas').updateOne({ _id: n._id }, { $set: set });
    }
  }

  for (const v of await collection('notasVersiones')
    .find({}, { projection: { soap: 1 } })
    .toArray()) {
    if (plain(v.soap)) {
      counts.versiones += 1;
      if (APPLY) await collection('notasVersiones').updateOne({ _id: v._id }, { $set: { soap: encryptValue(v.soap, NOTE_ENC.soap) } });
    }
  }

  // Archivos: se sube la version cifrada, se apunta el documento a ella y se elimina la original.
  const files = bucket('archivos');
  for (const d of await collection('documentos')
    .find({}, { projection: { fileId: 1, filename: 1, contentType: 1 } })
    .toArray()) {
    const chunks = [];
    for await (const c of files.openDownloadStream(d.fileId)) chunks.push(c);
    const buf = Buffer.concat(chunks);
    if (isEncryptedBuffer(buf)) continue;
    counts.archivos += 1;
    if (!APPLY) continue;
    const upload = files.openUploadStream(d.filename, { metadata: { contentType: d.contentType } });
    await new Promise((resolve, reject) =>
      Readable.from(encryptBuffer(buf, DOCUMENT_ENC)).pipe(upload).on('error', reject).on('finish', resolve),
    );
    await collection('documentos').updateOne({ _id: d._id }, { $set: { fileId: upload.id } });
    await files.delete(d.fileId);
  }

  if (APPLY)
    await AuditModel.log({
      event: 'MIGRATION_STAGE6',
      details: Object.entries(counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(' '),
    });
  console.log(
    `Por cifrar: ${counts.pacientes} pacientes, ${counts.notas} notas, ${counts.versiones} versiones de notas, ${counts.archivos} archivos.`,
  );
  if (!APPLY) console.log('Nada se escribio. Ejecuta con --apply para cifrar (haz antes un respaldo).');
} catch (err) {
  console.error(`Migracion detenida: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
