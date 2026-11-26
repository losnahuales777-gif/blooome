import { ObjectId } from 'mongodb';
import { collection, withSession } from '../config/database.js';
import { decryptValue, encryptValue } from '../utils/crypto.js';
import { toObjectId } from './clinical.model.js';

// Contenido de las notas cifrado en la aplicacion (etapa 6): SOAP, versiones y adendas.
export const NOTE_ENC = Object.freeze({ soap: 'note.soap', addendum: 'note.addendum' });
const encSoap = (soap) => encryptValue(soap, NOTE_ENC.soap);
const decNote = (n) =>
  n && {
    ...n,
    soap: decryptValue(n.soap, NOTE_ENC.soap),
    addenda: (n.addenda ?? []).map((a) => ({ ...a, text: decryptValue(a.text, NOTE_ENC.addendum) })),
  };

// Capa MODEL del expediente clinico (etapa 1). Todo es de solo agregar:
// - Antecedentes: cada actualizacion crea una version nueva ligada por rootId; la anterior queda
//   marcada como sustituida. La "ficha vigente" son las versiones no sustituidas.
// - Notas SOAP: el borrador se edita con control de version optimista y cada guardado deja una copia
//   en notasVersiones; una nota firmada es inmutable y solo admite adendas.
// - Diagnosticos: se resuelven cambiando su estado (con historial), nunca se borran.

// ---------------------------------------------------------------- antecedentes
const history = () => collection('antecedentes');

export const HistoryModel = {
  async insert(doc, session) {
    const _id = new ObjectId();
    await history().insertOne(
      { ...doc, _id, rootId: _id, version: 1, supersedes: null, supersededBy: null, recordedAt: new Date() },
      withSession(session),
    );
    return _id;
  },

  async findById(id) {
    return history().findOne({ _id: { $eq: toObjectId(id) } });
  },

  // Nueva version: hereda rootId e incrementa version; marca la anterior como sustituida.
  async insertVersion(previous, doc, session) {
    const _id = new ObjectId();
    await history().insertOne(
      {
        ...doc,
        _id,
        patientId: previous.patientId,
        rootId: previous.rootId,
        version: previous.version + 1,
        supersedes: previous._id,
        supersededBy: null,
        recordedAt: new Date(),
      },
      withSession(session),
    );
    const r = await history().updateOne({ _id: previous._id, supersededBy: null }, { $set: { supersededBy: _id } }, withSession(session));
    if (r.modifiedCount !== 1) throw new Error('VERSION_CONFLICT');
    return _id;
  },

  // Confirma en consulta que los antecedentes siguen vigentes sin crear version nueva (no cambio el dato).
  async verify(patientId, ids, { by, appointmentId }) {
    const at = new Date();
    const r = await history().updateMany(
      { _id: { $in: ids.map(toObjectId) }, patientId: { $eq: patientId }, supersededBy: null },
      {
        $set: { lastVerifiedAt: at, lastVerifiedBy: by },
        $push: { verifications: { at, by, appointmentId: appointmentId ? toObjectId(appointmentId) : null } },
      },
    );
    return r.modifiedCount;
  },

  async listCurrent(patientId) {
    return history()
      .find({ patientId: { $eq: patientId }, supersededBy: null })
      .sort({ category: 1, recordedAt: -1 })
      .toArray();
  },

  async listVersions(rootId) {
    return history()
      .find({ rootId: { $eq: toObjectId(rootId) } })
      .sort({ version: -1 })
      .toArray();
  },

  async listAll(patientId) {
    return history()
      .find({ patientId: { $eq: patientId } })
      .sort({ recordedAt: -1 })
      .limit(500)
      .toArray();
  },
};

// ---------------------------------------------------------------- notas clinicas SOAP
const notes = () => collection('notasClinicas');
const noteVersions = () => collection('notasVersiones');

const withAuthor = {
  $lookup: { from: 'users', localField: 'authorId', foreignField: '_id', as: 'u', pipeline: [{ $project: { fullName: 1 } }] },
};

export const NoteModel = {
  async insert(doc) {
    const now = new Date();
    const soap = encSoap(doc.soap);
    const { insertedId } = await notes().insertOne({
      ...doc,
      soap,
      status: 'borrador',
      version: 1,
      addenda: [],
      createdAt: now,
      updatedAt: now,
    });
    await noteVersions().insertOne({
      noteId: insertedId,
      version: 1,
      soap,
      savedBy: doc.authorId,
      savedAt: now,
      kind: 'creacion',
    });
    return insertedId;
  },

  // Incluye el nombre del autor (u[0].fullName) para mostrar quien redacto la nota.
  async findById(id) {
    const [doc] = await notes()
      .aggregate([{ $match: { _id: { $eq: toObjectId(id) } } }, withAuthor])
      .toArray();
    return decNote(doc) ?? null;
  },

  // Guarda el borrador solo si sigue en borrador, es del autor y nadie lo cambio desde que se cargo.
  async saveDraft(id, { authorId, expectedVersion, soap: plain, consultationAt }) {
    const now = new Date();
    const soap = encSoap(plain);
    const r = await notes().findOneAndUpdate(
      { _id: { $eq: id }, status: 'borrador', authorId: { $eq: authorId }, version: { $eq: expectedVersion } },
      { $set: { soap, consultationAt, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (r) await noteVersions().insertOne({ noteId: id, version: r.version, soap, savedBy: authorId, savedAt: now, kind: 'borrador' });
    return decNote(r);
  },

  async sign(id, { authorId, contentHash, session }) {
    const now = new Date();
    const r = await notes().findOneAndUpdate(
      { _id: { $eq: id }, status: 'borrador', authorId: { $eq: authorId } },
      { $set: { status: 'firmada', signedAt: now, signedBy: authorId, contentHash, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after', ...withSession(session) },
    );
    if (r) {
      await noteVersions().insertOne(
        { noteId: id, version: r.version, soap: r.soap, savedBy: authorId, savedAt: now, kind: 'firma', contentHash },
        withSession(session),
      );
    }
    return decNote(r);
  },

  async addAddendum(id, addendum) {
    const r = await notes().updateOne(
      { _id: { $eq: id }, status: 'firmada' },
      { $push: { addenda: { ...addendum, text: encryptValue(addendum.text, NOTE_ENC.addendum) } }, $set: { updatedAt: new Date() } },
    );
    return r.modifiedCount === 1;
  },

  async listByPatient(patientId, range = {}) {
    const match = { patientId: { $eq: patientId } };
    if (range.from || range.to) match.consultationAt = { ...(range.from && { $gte: range.from }), ...(range.to && { $lte: range.to }) };
    return notes()
      .aggregate([{ $match: match }, { $sort: { consultationAt: -1 } }, { $limit: 200 }, withAuthor])
      .toArray()
      .then((rows) => rows.map(decNote));
  },

  async listVersions(noteId) {
    return noteVersions()
      .find({ noteId: { $eq: toObjectId(noteId) } })
      .sort({ version: -1 })
      .toArray()
      .then((rows) => rows.map((v) => ({ ...v, soap: decryptValue(v.soap, NOTE_ENC.soap) })));
  },

  // Bandeja de notas de los pacientes indicados (para la seccion Consultas).
  async worklist(patientIds, { status, from, to }) {
    const match = { patientId: { $in: patientIds } };
    if (status) match.status = status;
    if (from || to) match.consultationAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
    return notes()
      .aggregate([
        { $match: match },
        { $sort: { consultationAt: -1 } },
        { $limit: 300 },
        { $lookup: { from: 'patients', localField: 'patientId', foreignField: '_id', as: 'p', pipeline: [{ $project: { fullName: 1 } }] } },
        { $lookup: { from: 'users', localField: 'authorId', foreignField: '_id', as: 'u', pipeline: [{ $project: { fullName: 1 } }] } },
        { $project: { soap: 0 } },
      ])
      .toArray();
  },
};

// ---------------------------------------------------------------- diagnosticos nutricionales
const diagnoses = () => collection('diagnosticos');

export const DiagnosisModel = {
  async insert(doc) {
    const now = new Date();
    const { insertedId } = await diagnoses().insertOne({
      ...doc,
      status: 'activo',
      statusHistory: [{ status: 'activo', at: now, by: doc.recordedBy }],
      recordedAt: now,
    });
    return insertedId;
  },

  async findById(id) {
    return diagnoses().findOne({ _id: { $eq: toObjectId(id) } });
  },

  async setStatus(id, status, by, note) {
    const at = new Date();
    await diagnoses().updateOne(
      { _id: { $eq: id } },
      {
        $set: { status, ...(status === 'resuelto' && { resolvedAt: at, resolvedBy: by }) },
        $push: { statusHistory: { status, at, by, note } },
      },
    );
  },

  async listByPatient(patientId) {
    return diagnoses()
      .find({ patientId: { $eq: patientId } })
      .sort({ recordedAt: -1 })
      .toArray();
  },
};

// ---------------------------------------------------------------- evaluaciones (busqueda puntual)
export const EvaluationLookup = {
  async findById(id) {
    return collection('evaluaciones').findOne({ _id: { $eq: toObjectId(id) } });
  },

  async latest(patientId) {
    return collection('evaluaciones').findOne({ patientId: { $eq: patientId } }, { sort: { computedAt: -1 } });
  },

  // Evaluacion vigente en una fecha y la inmediata anterior (comparacion entre consultas).
  async aroundDate(patientId, at) {
    const docs = await collection('evaluaciones')
      .find({ patientId: { $eq: patientId }, computedAt: { $lte: at } })
      .sort({ computedAt: -1 })
      .limit(2)
      .toArray();
    return { current: docs[0] ?? null, previous: docs[1] ?? null };
  },

  async worklist(patientIds, { from, to }) {
    const match = { patientId: { $in: patientIds } };
    if (from || to) match.computedAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
    return collection('evaluaciones')
      .aggregate([
        { $match: match },
        { $sort: { computedAt: -1 } },
        { $limit: 300 },
        { $lookup: { from: 'patients', localField: 'patientId', foreignField: '_id', as: 'p', pipeline: [{ $project: { fullName: 1 } }] } },
      ])
      .toArray();
  },
};
