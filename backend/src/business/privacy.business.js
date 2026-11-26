import { collection } from '../config/database.js';
import { env } from '../config/env.js';
import { toObjectId } from '../models/clinical.model.js';
import { DERIVED_PATIENT_FIELDS } from '../models/derived.pipeline.js';
import { AppError } from '../utils/AppError.js';
import { PERMISSIONS } from './access.business.js';
import { AuditBusiness } from './audit.business.js';
import { getAccessible } from './patients.business.js';

// Consentimiento y conservacion (etapa 6).
//
// - Consentimientos: cada otorgamiento o revocacion es un registro nuevo (nunca se edita ni se borra);
//   el estado vigente de cada tipo es el registro mas reciente. Puede vincularse al documento firmado
//   (adjunto del expediente) como evidencia.
// - Conservacion: se calcula hasta cuando debe conservarse cada expediente a partir de su ultima
//   actividad. La aplicacion solo informa: nunca borra expedientes.
//
// Los tipos, plazos y textos legales deben confirmarse con asesoria juridica antes de usarse en produccion.

export const CONSENT_TYPES = Object.freeze({
  aviso_privacidad: { label: 'Aviso de privacidad entregado y aceptado', required: true },
  datos_sensibles: { label: 'Consentimiento expreso para tratar datos de salud', required: true },
  comunicaciones: { label: 'Recordatorios y comunicaciones', required: false },
  // Envio de datos sin identificar a un proveedor de IA (Anthropic) para sugerir planes alimenticios.
  ia_asistente: { label: 'Uso de asistente de IA con datos sin identificar', required: false },
});

const consents = () => collection('consentimientos');
const oid = (v) => (v ? v.toString() : null);

const dto = (c) => ({
  id: oid(c._id),
  type: c.type,
  status: c.status,
  noticeVersion: c.noticeVersion,
  method: c.method,
  evidenceDocumentId: oid(c.evidenceDocumentId),
  notes: c.notes ?? '',
  recordedBy: c.recordedBy,
  recordedAt: c.recordedAt,
});

export async function currentConsents(patientIds) {
  const rows = await consents()
    .aggregate([
      { $match: { patientId: { $in: patientIds } } },
      { $sort: { recordedAt: -1 } },
      { $group: { _id: { p: '$patientId', t: '$type' }, doc: { $first: '$$ROOT' } } },
      { $replaceWith: '$doc' },
    ])
    .toArray();
  const map = new Map(patientIds.map((id) => [id, {}]));
  for (const r of rows) map.get(r.patientId)[r.type] = r;
  return map;
}

// Tipos obligatorios sin consentimiento vigente (para la regla de alerta y la ficha).
export function missingConsents(current = {}) {
  return Object.entries(CONSENT_TYPES)
    .filter(([type, def]) => def.required && current[type]?.status !== 'otorgado')
    .map(([type]) => type);
}

export const PrivacyBusiness = {
  async list(actor, patientId) {
    await getAccessible(actor, patientId);
    const history = await consents()
      .find({ patientId: { $eq: patientId } })
      .sort({ recordedAt: -1 })
      .limit(200)
      .toArray();
    const current = Object.fromEntries(Object.keys(CONSENT_TYPES).map((t) => [t, history.find((h) => h.type === t) ?? null]));
    return {
      types: CONSENT_TYPES,
      current: Object.fromEntries(Object.entries(current).map(([t, c]) => [t, c && dto(c)])),
      missing: missingConsents(current),
      history: history.map(dto),
    };
  },

  async record(actor, patientId, data, ctx) {
    await getAccessible(actor, patientId);
    let evidence = null;
    if (data.evidenceDocumentId) {
      evidence = await collection('documentos').findOne(
        { _id: { $eq: toObjectId(data.evidenceDocumentId) } },
        { projection: { patientId: 1 } },
      );
      if (!evidence || evidence.patientId !== patientId) throw new AppError(400, 'El documento de evidencia no pertenece a este paciente');
    }
    if (
      data.status === 'otorgado' &&
      CONSENT_TYPES[data.type].required &&
      !data.evidenceDocumentId &&
      data.method !== 'firma_electronica'
    ) {
      throw new AppError(400, 'Vincula el documento firmado como evidencia del consentimiento');
    }
    const doc = {
      patientId,
      type: data.type,
      status: data.status,
      noticeVersion: data.noticeVersion,
      method: data.method,
      evidenceDocumentId: evidence?._id ?? null,
      notes: data.notes,
      recordedBy: actor.id,
      recordedAt: new Date(),
    };
    const { insertedId } = await consents().insertOne(doc);
    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: 'CONSENT_RECORDED',
      details: `paciente=${patientId} tipo=${data.type} estado=${data.status}`,
    });
    return dto({ ...doc, _id: insertedId });
  },

  // Plazo de conservacion por expediente a partir de su ultima actividad registrada.
  async retention(actor) {
    const all = actor.permissions.has(PERMISSIONS.PATIENTS_VIEW_ALL);
    const rows = await collection('patients')
      .aggregate([
        { $match: all ? {} : { nutritionistId: actor.id } },
        { $limit: 5000 },
        ...DERIVED_PATIENT_FIELDS,
        {
          $lookup: {
            from: 'notasClinicas',
            localField: '_id',
            foreignField: 'patientId',
            as: 'n',
            pipeline: [{ $sort: { updatedAt: -1 } }, { $limit: 1 }, { $project: { updatedAt: 1 } }],
          },
        },
        {
          $project: {
            fullName: 1,
            recordStatus: 1,
            isActive: 1,
            createdAt: 1,
            lastVisitAt: 1,
            measuredAt: 1,
            lastNote: { $first: '$n.updatedAt' },
          },
        },
      ])
      .toArray();
    const consentMap = await currentConsents(rows.map((r) => r._id));
    const years = env.RETENTION_YEARS;
    const now = new Date();
    const items = rows.map((r) => {
      const lastActivity = [r.lastVisitAt, r.measuredAt, r.lastNote, r.createdAt].filter(Boolean).reduce((a, b) => (a > b ? a : b));
      const retainUntil = new Date(lastActivity);
      retainUntil.setFullYear(retainUntil.getFullYear() + years);
      return {
        patientId: r._id,
        fullName: r.fullName,
        recordStatus: r.recordStatus ?? (r.isActive === false ? 'inactivo' : 'activo'),
        lastActivity,
        retainUntil,
        retentionDue: retainUntil < now,
        missingConsents: missingConsents(consentMap.get(r._id)),
      };
    });
    return { years, items };
  },
};
