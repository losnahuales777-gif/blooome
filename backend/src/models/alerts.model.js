import { ObjectId } from 'mongodb';
import { collection, withSession } from '../config/database.js';
import { toObjectId } from './clinical.model.js';

// Reglas de alerta configurables y estado de revision de cada alerta.
// - reglasAlerta: la regla vigente (con version); cada cambio deja copia en reglasAlertaVersiones.
// - alertasRevision: una entrada por alerta (paciente + clave) con su estado y su historial.
const rules = () => collection('reglasAlerta');
const ruleVersions = () => collection('reglasAlertaVersiones');
const reviews = () => collection('alertasRevision');

export const AlertRuleModel = {
  async list() {
    return rules().find({}).sort({ kind: 1, type: 1, name: 1 }).toArray();
  },

  async listEnabled() {
    return rules().find({ enabled: true }).toArray();
  },

  async findById(id) {
    return rules().findOne({ _id: { $eq: toObjectId(id) } });
  },

  // Reglas administrativas por defecto: se crean una sola vez y luego se respetan los cambios del usuario.
  async ensureDefaults(defaults) {
    if (!defaults.length) return;
    await rules().bulkWrite(
      defaults.map((d) => ({
        updateOne: {
          filter: { type: d.type, system: true },
          update: {
            $setOnInsert: {
              ...d,
              system: true,
              version: 1,
              validation: null,
              createdBy: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      })),
    );
  },

  async insert(doc, session) {
    const _id = new ObjectId();
    const now = new Date();
    const full = { ...doc, _id, system: false, version: 1, createdAt: now, updatedAt: now };
    await rules().insertOne(full, withSession(session));
    await ruleVersions().insertOne({ ruleId: _id, version: 1, snapshot: full, savedAt: now }, withSession(session));
    return _id;
  },

  // Control de version optimista: solo actualiza si nadie la cambio desde que se leyo.
  async update(id, expectedVersion, changes, session) {
    const now = new Date();
    const r = await rules().findOneAndUpdate(
      { _id: { $eq: toObjectId(id) }, version: { $eq: expectedVersion } },
      { $set: { ...changes, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after', ...withSession(session) },
    );
    if (r) await ruleVersions().insertOne({ ruleId: r._id, version: r.version, snapshot: r, savedAt: now }, withSession(session));
    return r;
  },

  async listVersions(id) {
    return ruleVersions()
      .find({ ruleId: { $eq: toObjectId(id) } })
      .sort({ version: -1 })
      .limit(100)
      .toArray();
  },
};

export const AlertReviewModel = {
  async listByPatients(patientIds) {
    return reviews()
      .find({ patientId: { $in: patientIds } })
      .toArray();
  },

  async set(patientId, key, { status, note, by, ruleId, reason }) {
    const at = new Date();
    await reviews().updateOne(
      { patientId, key },
      {
        $set: { status, note, by, at, ruleId: ruleId ? toObjectId(ruleId) : null, reason },
        $push: { history: { status, note, by, at } },
        $setOnInsert: { createdAt: at },
      },
      { upsert: true },
    );
    return at;
  },

  async listByPatient(patientId, range = {}) {
    const match = { patientId: { $eq: patientId } };
    if (range.from || range.to) match.at = { ...(range.from && { $gte: range.from }), ...(range.to && { $lte: range.to }) };
    return reviews().find(match).sort({ at: -1 }).limit(300).toArray();
  },
};
