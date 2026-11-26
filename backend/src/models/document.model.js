import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { bucket, collection } from '../config/database.js';
import { decryptBuffer, encryptBuffer } from '../utils/crypto.js';
import { toObjectId } from './clinical.model.js';

export const DOCUMENT_ENC = 'document.file';

// Documentos del expediente: reportes PDF generados y archivos adjuntos. Son inmutables: el archivo
// se guarda en GridFS con su huella SHA-256 y nunca se modifica ni se borra desde la aplicacion.
const docs = () => collection('documentos');
const files = () => bucket('archivos');

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function upload(buffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    const stream = files().openUploadStream(filename, { metadata: { contentType } });
    Readable.from(buffer)
      .pipe(stream)
      .on('error', reject)
      .on('finish', () => resolve(stream.id));
  });
}

export const DocumentModel = {
  // Siguiente version por paciente y tipo; el indice unico evita versiones repetidas en paralelo.
  async nextVersion(patientId, reportType) {
    const last = await docs().findOne(
      { patientId: { $eq: patientId }, reportType: { $eq: reportType } },
      { sort: { version: -1 }, projection: { version: 1 } },
    );
    return (last?.version ?? 0) + 1;
  },

  async store(meta, buffer) {
    // El archivo se guarda cifrado; la huella SHA-256 corresponde al contenido original.
    const fileId = await upload(encryptBuffer(buffer, DOCUMENT_ENC), meta.filename, meta.contentType);
    const doc = { ...meta, fileId, sizeBytes: buffer.length, sha256: sha256(buffer), createdAt: new Date() };
    try {
      const { insertedId } = await docs().insertOne(doc);
      return { ...doc, _id: insertedId };
    } catch (err) {
      await files()
        .delete(fileId)
        .catch(() => {});
      throw err;
    }
  },

  async listByPatient(patientId) {
    return docs()
      .find({ patientId: { $eq: patientId } })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
  },

  async findById(id) {
    return docs().findOne({ _id: { $eq: toObjectId(id) } });
  },

  async readFile(fileId) {
    const chunks = [];
    for await (const c of files().openDownloadStream(fileId)) chunks.push(c);
    return decryptBuffer(Buffer.concat(chunks), DOCUMENT_ENC);
  },
};
