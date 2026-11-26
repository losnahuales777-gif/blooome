import { collection, nextId, withSession } from '../config/database.js';
import { decryptValue, encryptValue } from '../utils/crypto.js';
import { DERIVED_PATIENT_FIELDS } from './derived.pipeline.js';

// Campos cifrados en la aplicacion (etapa 6): telefono e identificacion ampliada (contacto, domicilio,
// motivo de consulta, contacto de emergencia).
export const PATIENT_ENC = Object.freeze({ phone: 'patient.phone', identification: 'patient.identification' });

// Pacientes: un documento por paciente. birthDate se guarda como texto 'AAAA-MM-DD' (fecha sin hora,
// sin desfases de zona horaria). Datos de salud = informacion sensible: nunca van a logs ni auditoria.
const patients = () => collection('patients');

// Tope de seguridad para el listado completo que usa el frontend (busqueda y filtros en cliente).
const LIST_LIMIT = 1000;

const withNutritionist = [
  {
    $lookup: {
      from: 'users',
      localField: 'nutritionistId',
      foreignField: '_id',
      as: 'nutritionist',
      pipeline: [{ $project: { fullName: 1 } }],
    },
  },
];

// Misma forma que consume la capa Business.
const toRow = (p) => ({
  id: p._id,
  nutritionist_id: p.nutritionistId,
  nutritionist_name: p.nutritionist?.[0]?.fullName ?? null,
  full_name: p.fullName,
  birth_date: p.birthDate,
  sex: p.sex,
  weight_kg: p.weightKg,
  height_cm: p.heightCm,
  waist_cm: p.waistCm ?? null,
  activity: p.activity,
  goal: p.goal,
  phone: decryptValue(p.phone, PATIENT_ENC.phone) ?? null,
  notes: p.notes ?? '',
  measured_at: p.measuredAt ?? null,
  last_visit_at: p.lastVisitAt ?? null,
  next_visit_at: p.nextVisitAt ?? null,
  target_weight_kg: p.targetWeightKg ?? null,
  protein_g_per_kg: p.proteinGPerKg ?? null,
  is_active: p.isActive !== false,
  record_status: p.recordStatus ?? (p.isActive === false ? 'inactivo' : 'activo'),
  intake_pending: Boolean(p.intakePending),
  identification: decryptValue(p.identification, PATIENT_ENC.identification) ?? null,
  created_at: p.createdAt,
});

// Datos generales del expediente. Las medidas (peso, estatura, cintura) y las fechas de visita NO se
// guardan aqui: se derivan de "mediciones" y "citas" (ver derived.pipeline.js).
const fields = (d) => ({
  fullName: d.fullName,
  birthDate: d.birthDate,
  sex: d.sex,
  activity: d.activity,
  goal: d.goal,
  phone: encryptValue(d.phone || null, PATIENT_ENC.phone),
  notes: d.notes,
  // Datos prescritos por el profesional (opcionales).
  targetWeightKg: d.targetWeightKg ?? null,
  proteinGPerKg: d.proteinGPerKg ?? null,
  isActive: d.isActive !== false,
  // Estado del expediente coherente con isActive ('alta' se conserva si el expediente ya estaba dado de alta).
  recordStatus: d.recordStatus ?? (d.isActive === false ? 'inactivo' : 'activo'),
});

export const PatientModel = {
  // nutritionistId null = todos los pacientes (solo para quien tiene patients.view_all).
  async list({ nutritionistId }) {
    const match = nutritionistId === null ? {} : { nutritionistId: { $eq: nutritionistId } };
    const docs = await patients()
      .aggregate([{ $match: match }, { $sort: { fullName: 1 } }, { $limit: LIST_LIMIT }, ...withNutritionist, ...DERIVED_PATIENT_FIELDS])
      .toArray();
    return docs.map(toRow);
  },

  async findById(id) {
    const [doc] = await patients()
      .aggregate([{ $match: { _id: { $eq: id } } }, ...withNutritionist, ...DERIVED_PATIENT_FIELDS])
      .toArray();
    return doc ? toRow(doc) : null;
  },

  async create(nutritionistId, d) {
    const id = await nextId('patients');
    const now = new Date();
    await patients().insertOne({
      _id: id,
      nutritionistId,
      ...fields(d),
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },

  async update(id, d) {
    await patients().updateOne({ _id: { $eq: id } }, { $set: { ...fields(d), updatedAt: new Date() } });
  },

  // Alta administrativa (Administrador nivel 2): solo datos basicos; la valoracion clinica queda pendiente
  // para el nutriologo asignado (intakePending), sin inventar medidas ni objetivos.
  async createBasic(nutritionistId, { fullName, birthDate, sex, phone }, createdBy) {
    const id = await nextId('patients');
    const now = new Date();
    await patients().insertOne({
      _id: id,
      nutritionistId,
      ...fields({ fullName, birthDate, sex, phone, activity: 'ligera', goal: 'mantener', notes: '', isActive: true }),
      intakePending: true,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },

  async updateBasic(id, { fullName, birthDate, sex, phone }) {
    await patients().updateOne(
      { _id: { $eq: id } },
      { $set: { fullName, birthDate, sex, phone: encryptValue(phone || null, PATIENT_ENC.phone), updatedAt: new Date() } },
    );
  },

  // Directorio administrativo: solo datos basicos (sin medidas, antecedentes ni notas).
  async directory({ q } = {}) {
    const filter = q ? { fullName: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
    return patients()
      .aggregate([
        { $match: filter },
        { $sort: { fullName: 1 } },
        { $limit: 1000 },
        ...withNutritionist,
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: 'patientId',
            as: 'acct',
            pipeline: [{ $project: { email: 1, isActive: 1, oneTimeCode: 1 } }],
          },
        },
        {
          $project: {
            fullName: 1,
            birthDate: 1,
            sex: 1,
            recordStatus: 1,
            isActive: 1,
            intakePending: 1,
            nutritionistId: 1,
            nutritionist: 1,
            acct: 1,
            createdAt: 1,
          },
        },
      ])
      .toArray();
  },

  // Identificacion ampliada y estado del expediente (endpoint propio: el formulario general no la toca).
  async setIdentification(id, identification, recordStatus) {
    await patients().updateOne(
      { _id: { $eq: id } },
      {
        $set: {
          identification: encryptValue(identification, PATIENT_ENC.identification),
          recordStatus,
          isActive: recordStatus === 'activo',
          updatedAt: new Date(),
        },
      },
    );
  },

  async transferOwnership(fromUserId, toUserId, session) {
    const result = await patients().updateMany(
      { nutritionistId: { $eq: fromUserId } },
      { $set: { nutritionistId: toUserId, updatedAt: new Date() } },
      withSession(session),
    );
    return result.modifiedCount;
  },
};
