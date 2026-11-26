import { collection, withSession } from '../config/database.js';

// Planes alimenticios versionados (etapa 2). Cada guardado crea una version nueva y marca la anterior
// como "reemplazada": ninguna prescripcion se sobrescribe ni se borra. Un indice unico
// (patientId, version) impide que dos guardados simultaneos creen la misma version.
const plans = () => collection('planesAlimenticios');
// Coleccion anterior (un documento por paciente); solo se lee si el paciente aun no fue migrado.
const legacy = () => collection('mealPlans');

const toItems = (items = []) =>
  items.map((i) => ({ meal: i.meal, name: i.name, portion: i.portion, protein_g: i.protein, carbs_g: i.carbs, fat_g: i.fat }));

const kcalOf = (items = []) => items.reduce((s, i) => s + i.protein * 4 + i.carbs * 4 + i.fat * 9, 0);

const summary = (d) => ({
  id: d._id.toString(),
  version: d.version,
  status: d.status,
  createdAt: d.createdAt,
  createdBy: d.createdBy,
  reason: d.reason ?? '',
  foods: d.items.length,
  kcal: Math.round(kcalOf(d.items)),
});

export const MealPlanModel = {
  async findCurrent(patientId, session) {
    return plans().findOne({ patientId: { $eq: patientId }, status: 'vigente' }, { sort: { version: -1 }, ...withSession(session) });
  },

  async findByPatient(patientId) {
    const doc = await this.findCurrent(patientId);
    if (doc)
      return {
        id: doc._id.toString(),
        version: doc.version,
        updatedAt: doc.createdAt,
        updatedBy: doc.createdBy,
        items: toItems(doc.items),
      };
    const old = await legacy().findOne({ _id: { $eq: patientId } });
    return {
      id: null,
      version: old ? 1 : 0,
      updatedAt: old?.updatedAt ?? null,
      updatedBy: old?.updatedBy ?? null,
      items: toItems(old?.items),
    };
  },

  // Guarda una version nueva. expectedVersion (la que el profesional tenia abierta) evita sobrescribir
  // el trabajo de otra persona: si no coincide con la vigente, se rechaza.
  async saveVersion(patientId, { items, userId, reason, expectedVersion }, session) {
    const current = await this.findCurrent(patientId, session);
    const legacyDoc = current ? null : await legacy().findOne({ _id: { $eq: patientId } }, withSession(session));
    const currentVersion = current?.version ?? (legacyDoc ? 1 : 0);
    if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== currentVersion) {
      throw new Error('VERSION_CONFLICT');
    }
    const now = new Date();
    // Paciente aun no migrado: su plan anterior se conserva como version 1 antes de crear la 2.
    let previousId = current?._id ?? null;
    if (legacyDoc) previousId = await this.importLegacy(patientId, legacyDoc, session);
    const { insertedId } = await plans().insertOne(
      {
        patientId,
        version: currentVersion + 1,
        status: 'vigente',
        items: items.map(({ meal, position, name, portion, protein, carbs, fat }) => ({
          meal,
          position,
          name,
          portion,
          protein,
          carbs,
          fat,
        })),
        reason: reason ?? '',
        supersedes: previousId,
        supersededBy: null,
        createdBy: userId,
        createdAt: now,
      },
      withSession(session),
    );
    if (previousId) {
      await plans().updateOne(
        { _id: previousId, status: 'vigente' },
        { $set: { status: 'reemplazado', supersededBy: insertedId, replacedAt: now } },
        withSession(session),
      );
    }
    return { id: insertedId, version: currentVersion + 1 };
  },

  // Copia el plan de la coleccion anterior como version 1 (idempotente por el indice unico).
  async importLegacy(patientId, doc, session) {
    const existing = await plans().findOne({ patientId: { $eq: patientId }, version: 1 }, withSession(session));
    if (existing) return existing._id;
    const { insertedId } = await plans().insertOne(
      {
        patientId,
        version: 1,
        status: 'vigente',
        items: doc.items ?? [],
        reason: 'Plan previo al versionado',
        source: 'migracion',
        supersedes: null,
        supersededBy: null,
        createdBy: doc.updatedBy ?? null,
        createdAt: doc.updatedAt ?? new Date(),
      },
      withSession(session),
    );
    return insertedId;
  },

  async listVersions(patientId) {
    const docs = await plans()
      .find({ patientId: { $eq: patientId } })
      .sort({ version: -1 })
      .limit(200)
      .toArray();
    return docs.map(summary);
  },

  async findVersion(patientId, version) {
    const doc = await plans().findOne({ patientId: { $eq: patientId }, version: { $eq: version } });
    return doc ? { ...summary(doc), items: toItems(doc.items) } : null;
  },
};
