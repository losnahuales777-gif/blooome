import { collection } from '../config/database.js';

// Catalogos clinicos autorizados (medicamentos, diagnosticos). La aplicacion NO trae contenido
// clinico propio: los terminos se importan desde una fuente autorizada con su origen y version
// (scripts/import-catalog.js). Si no hay catalogo cargado, los formularios aceptan texto libre.
const catalogs = () => collection('catalogos');

export const CATALOG_TYPES = Object.freeze({
  medicamento: 'Medicamentos',
  diagnostico: 'Diagnosticos',
});

// Texto normalizado para buscar sin distinguir mayusculas ni acentos.
export const normalize = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

// Escapa la entrada del usuario: la busqueda nunca interpreta expresiones regulares (evita ReDoS e inyeccion).
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const CatalogModel = {
  async upsertMany(entries) {
    if (!entries.length) return { upserted: 0, modified: 0 };
    const now = new Date();
    const r = await catalogs().bulkWrite(
      entries.map((e) => ({
        updateOne: {
          filter: { type: e.type, source: e.source, code: e.code },
          update: {
            $set: { name: e.name, search: normalize(`${e.code} ${e.name}`), version: e.version, active: true, updatedAt: now },
            $setOnInsert: { createdAt: now },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return { upserted: r.upsertedCount, modified: r.modifiedCount };
  },

  // Desactiva (no borra) los terminos de una fuente que ya no vienen en la version importada.
  async deactivateMissing(type, source, version) {
    const r = await catalogs().updateMany(
      { type, source, version: { $ne: version }, active: true },
      { $set: { active: false, updatedAt: new Date() } },
    );
    return r.modifiedCount;
  },

  async search(type, q, limit = 20) {
    const term = normalize(q).slice(0, 60);
    if (term.length < 2) return [];
    const docs = await catalogs()
      .find(
        { type: { $eq: type }, active: true, search: { $regex: escapeRegex(term) } },
        { projection: { _id: 0, code: 1, name: 1, source: 1, version: 1 } },
      )
      .sort({ name: 1 })
      .limit(limit)
      .toArray();
    return docs;
  },

  async summary() {
    return catalogs()
      .aggregate([
        { $match: { active: true } },
        { $group: { _id: { type: '$type', source: '$source', version: '$version' }, terms: { $sum: 1 } } },
        { $project: { _id: 0, type: '$_id.type', source: '$_id.source', version: '$_id.version', terms: 1 } },
      ])
      .toArray();
  },
};
