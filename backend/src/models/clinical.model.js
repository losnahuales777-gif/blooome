import { ObjectId } from 'mongodb';
import { collection, withSession } from '../config/database.js';

// Capa MODEL del expediente clinico. Reglas comunes:
// - Los historicos son de solo agregar: una correccion crea un documento nuevo y marca el anterior
//   como sustituido (supersededBy); nunca se sobrescribe ni se borra un registro.
// - Cada registro guarda fecha, unidades (en el nombre del campo), metodo, origen y responsable.
// - Filtros con $eq y valores ya validados por zod (prevencion de inyeccion NoSQL).

export const toObjectId = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));

function dateRange(field, { from, to }) {
  if (!from && !to) return {};
  return { [field]: { ...(from && { $gte: from }), ...(to && { $lte: to }) } };
}

// ---------------------------------------------------------------- mediciones (antropometria)
const measurements = () => collection('mediciones');

export const MeasurementModel = {
  async insert(doc, session) {
    const { insertedId } = await measurements().insertOne(
      { ...doc, source: 'medido', supersedes: doc.supersedes ?? null, supersededBy: null, recordedAt: new Date() },
      withSession(session),
    );
    return insertedId;
  },

  async findById(id) {
    return measurements().findOne({ _id: { $eq: toObjectId(id) } });
  },

  // Solo las versiones vigentes (no sustituidas), en orden cronologico.
  async listByAppointment(appointmentId) {
    return measurements()
      .find({ appointmentId: { $eq: toObjectId(appointmentId) }, supersededBy: null })
      .sort({ takenAt: 1 })
      .toArray();
  },

  async listCurrent(patientId, range = {}) {
    return measurements()
      .find({ patientId: { $eq: patientId }, supersededBy: null, ...dateRange('takenAt', range) })
      .sort({ takenAt: 1, recordedAt: 1 })
      .toArray();
  },

  async markSuperseded(id, newId, session) {
    await measurements().updateOne({ _id: { $eq: id }, supersededBy: null }, { $set: { supersededBy: newId } }, withSession(session));
  },
};

// ---------------------------------------------------------------- citas
const appointments = () => collection('citas');

export const AppointmentModel = {
  async insert(doc, session) {
    const { insertedId } = await appointments().insertOne({ ...doc, createdAt: new Date() }, withSession(session));
    return insertedId;
  },

  // Consulta (realizada o programada) mas cercana a una fecha, dentro de una ventana en horas.
  async findNear(patientId, at, hours) {
    const window = hours * 3600000;
    const from = new Date(at.getTime() - window);
    const to = new Date(at.getTime() + window);
    const candidates = await appointments()
      .find({
        patientId: { $eq: patientId },
        status: { $in: ['realizada', 'programada'] },
        $or: [{ completedAt: { $gte: from, $lte: to } }, { scheduledAt: { $gte: from, $lte: to } }],
      })
      .limit(20)
      .toArray();
    const eff = (a) => (a.completedAt ?? a.scheduledAt).getTime();
    return candidates.sort((a, b) => Math.abs(eff(a) - at.getTime()) - Math.abs(eff(b) - at.getTime()))[0] ?? null;
  },

  async findPending(patientId, session) {
    return appointments().findOne(
      { patientId: { $eq: patientId }, status: 'programada' },
      { sort: { scheduledAt: 1 }, ...withSession(session) },
    );
  },

  async findById(id) {
    return appointments().findOne({ _id: { $eq: toObjectId(id) } });
  },

  async update(id, changes, session) {
    await appointments().updateOne({ _id: { $eq: id } }, { $set: { ...changes, updatedAt: new Date() } }, withSession(session));
  },

  async listByPatient(patientId, range = {}) {
    return appointments()
      .find({ patientId: { $eq: patientId }, ...dateRange('scheduledAt', range) })
      .sort({ scheduledAt: -1 })
      .limit(200)
      .toArray();
  },

  async transferOwnership(fromUserId, toUserId, session) {
    const r = await appointments().updateMany(
      { nutritionistId: { $eq: fromUserId }, status: 'programada' },
      { $set: { nutritionistId: toUserId, updatedAt: new Date() } },
      withSession(session),
    );
    return r.modifiedCount;
  },
};

// ---------------------------------------------------------------- consumos (registro diario)
const intakes = () => collection('consumos');

export const IntakeModel = {
  async insert(doc) {
    const { insertedId } = await intakes().insertOne({ ...doc, source: 'registrado', recordedAt: new Date() });
    return insertedId;
  },

  // Si un dia tiene varios registros se usa el mas reciente; los anteriores se conservan.
  async listLatestPerDay(patientId, { from, to } = {}) {
    const match = { patientId: { $eq: patientId } };
    if (from || to) match.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
    return intakes()
      .aggregate([
        { $match: match },
        { $sort: { date: 1, recordedAt: -1 } },
        { $group: { _id: '$date', doc: { $first: '$$ROOT' } } },
        { $replaceWith: '$doc' },
        { $sort: { date: 1 } },
      ])
      .toArray();
  },
};

// ---------------------------------------------------------------- laboratorio
const labs = () => collection('laboratorios');

export const LabModel = {
  async insert(doc) {
    const { insertedId } = await labs().insertOne({ ...doc, source: 'medido', recordedAt: new Date() });
    return insertedId;
  },

  async listByPatient(patientId, range = {}) {
    return labs()
      .find({ patientId: { $eq: patientId }, ...dateRange('takenAt', range) })
      .sort({ takenAt: -1 })
      .limit(300)
      .toArray();
  },
};

// ---------------------------------------------------------------- objetivos
const goals = () => collection('objetivos');

export const GoalModel = {
  async insert(doc) {
    const now = new Date();
    const { insertedId } = await goals().insertOne({
      ...doc,
      status: 'pendiente',
      statusHistory: [{ status: 'pendiente', at: now, by: doc.createdBy }],
      createdAt: now,
    });
    return insertedId;
  },

  async findById(id) {
    return goals().findOne({ _id: { $eq: toObjectId(id) } });
  },

  // El estado actual cambia, pero cada cambio queda en statusHistory.
  async setStatus(id, status, by) {
    const at = new Date();
    await goals().updateOne({ _id: { $eq: id } }, { $set: { status, updatedAt: at }, $push: { statusHistory: { status, at, by } } });
  },

  async listByPatient(patientId) {
    return goals()
      .find({ patientId: { $eq: patientId } })
      .sort({ createdAt: -1 })
      .toArray();
  },
};

// ---------------------------------------------------------------- ajustes clinicos del profesional
const overrides = () => collection('ajustesClinicos');

export const OverrideModel = {
  async insert(doc) {
    const { insertedId } = await overrides().insertOne({ ...doc, adjustedAt: new Date() });
    return insertedId;
  },

  // Ajuste vigente por formula = el mas reciente. Los anteriores se conservan como historial.
  async latestByFormula(patientId) {
    const rows = await overrides()
      .aggregate([
        { $match: { patientId: { $eq: patientId } } },
        { $sort: { adjustedAt: -1 } },
        { $group: { _id: '$formula', doc: { $first: '$$ROOT' } } },
        { $replaceWith: '$doc' },
      ])
      .toArray();
    return new Map(rows.map((r) => [r.formula, r]));
  },
};

// ---------------------------------------------------------------- evaluaciones (instantaneas)
const evaluations = () => collection('evaluaciones');

export const EvaluationModel = {
  async insert(doc, session) {
    const { insertedId } = await evaluations().insertOne({ ...doc, computedAt: new Date() }, withSession(session));
    return insertedId;
  },

  async listByPatient(patientId, range = {}) {
    return evaluations()
      .find({ patientId: { $eq: patientId }, ...dateRange('computedAt', range) }, { projection: { results: 0 } })
      .sort({ computedAt: -1 })
      .limit(100)
      .toArray();
  },
};
