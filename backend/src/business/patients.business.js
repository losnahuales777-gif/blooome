import { isDuplicateKey, withTransaction } from '../config/database.js';
import { AuditModel } from '../models/audit.model.js';
import { MeasurementModel } from '../models/clinical.model.js';
import { MealPlanModel } from '../models/mealPlan.model.js';
import { PatientModel } from '../models/patient.model.js';
import { AppError } from '../utils/AppError.js';
import { PERMISSIONS } from './access.business.js';
import { completeAppointment, syncScheduledAppointment } from './appointments.business.js';
import { AuditBusiness } from './audit.business.js';
import { notifyPatient } from './patientAccounts.business.js';

// La consulta solo atiende adultos de 18 a 60 anos.
export const AGE_RANGE = Object.freeze({ min: 18, max: 60 });
export const MEALS = Object.freeze(['desayuno', 'colacion1', 'comida', 'colacion2', 'cena']);

export function ageFrom(birthDate, today = new Date()) {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

function assertAgeRange(birthDate) {
  const age = ageFrom(birthDate);
  if (age < AGE_RANGE.min || age > AGE_RANGE.max) {
    throw new AppError(400, `La edad del paciente debe estar entre ${AGE_RANGE.min} y ${AGE_RANGE.max} anos`);
  }
}

function assertFutureVisit(nextVisitAt) {
  if (nextVisitAt && nextVisitAt.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new AppError(400, 'La proxima cita debe ser una fecha futura');
  }
}

function toPatientDto(p) {
  return {
    id: p.id,
    nutritionistId: p.nutritionist_id,
    nutritionistName: p.nutritionist_name,
    fullName: p.full_name,
    birthDate: p.birth_date,
    sex: p.sex,
    weightKg: p.weight_kg,
    heightCm: p.height_cm,
    waistCm: p.waist_cm,
    activity: p.activity,
    goal: p.goal,
    phone: p.phone ?? '',
    notes: p.notes,
    measuredAt: p.measured_at,
    lastVisit: p.last_visit_at,
    nextVisit: p.next_visit_at,
    targetWeightKg: p.target_weight_kg,
    proteinGPerKg: p.protein_g_per_kg,
    isActive: p.is_active,
    createdAt: p.created_at,
  };
}

const canViewAll = (actor) => actor.permissions.has(PERMISSIONS.PATIENTS_VIEW_ALL);

// Cada nutriologo solo accede a sus pacientes (evita IDOR, OWASP A01). Responde 404 para no
// revelar si existe un paciente de otro profesional.
export async function getAccessible(actor, patientId) {
  const patient = await PatientModel.findById(patientId);
  if (!patient || (!canViewAll(actor) && patient.nutritionist_id !== actor.id)) {
    throw new AppError(404, 'Paciente no encontrado');
  }
  return patient;
}

const toDate = (iso) => (iso ? new Date(iso) : null);

// La auditoria guarda solo identificadores: los datos de salud nunca van a la bitacora.
export const PatientsBusiness = {
  async list(actor) {
    const rows = await PatientModel.list({ nutritionistId: canViewAll(actor) ? null : actor.id });
    return { items: rows.map(toPatientDto), scope: canViewAll(actor) ? 'all' : 'own' };
  },

  async get(actor, patientId) {
    return toPatientDto(await getAccessible(actor, patientId));
  },

  async create(actor, data, ctx) {
    assertAgeRange(data.birthDate);
    const nextVisitAt = toDate(data.nextVisit);
    assertFutureVisit(nextVisitAt);

    const id = await PatientModel.create(actor.id, data);
    // Primera medicion del historico: los datos capturados en el alta, como "registro inicial".
    await MeasurementModel.insert({
      patientId: id,
      takenAt: new Date(),
      values: { weightKg: data.weightKg, heightCm: data.heightCm, waistCm: data.waistCm ?? null },
      method: 'registro inicial',
      recordedBy: actor.id,
    });
    await syncScheduledAppointment({ patientId: id, nutritionistId: actor.id, nextVisitAt, actorId: actor.id });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'PATIENT_CREATED', details: `id=${id}` });
    return toPatientDto(await PatientModel.findById(id));
  },

  // Editar el expediente corrige datos generales. Las medidas no se editan aqui: un cambio de peso o
  // cintura es una medicion nueva (o una correccion con motivo) en el historico.
  async update(actor, patientId, data, ctx) {
    const patient = await getAccessible(actor, patientId);
    assertAgeRange(data.birthDate);

    const nextVisitAt = toDate(data.nextVisit);
    const recordStatus = data.isActive === false ? (patient.record_status === 'alta' ? 'alta' : 'inactivo') : 'activo';
    await PatientModel.update(patientId, { ...data, recordStatus });
    await syncScheduledAppointment({ patientId, nutritionistId: patient.nutritionist_id, nextVisitAt, actorId: actor.id });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'PATIENT_UPDATED', details: `id=${patientId}` });
    return toPatientDto(await PatientModel.findById(patientId));
  },

  // Consulta atendida: en una transaccion registra la medicion vinculada a la consulta (cita
  // realizada), cierra la cita y agenda la siguiente. La estatura no se copia: se toma de la ultima
  // medicion que la registro.
  async recordVisit(actor, patientId, { weightKg, waistCm, hipCm, bodyFatPct, muscleMassKg, method, nextVisit }, ctx) {
    const patient = await getAccessible(actor, patientId);
    const nextVisitAt = toDate(nextVisit);
    assertFutureVisit(nextVisitAt);

    const consultation = await withTransaction(async (session) => {
      const appointmentId = await completeAppointment(
        { patientId, nutritionistId: patient.nutritionist_id, nextVisitAt, actorId: actor.id },
        session,
      );
      const measurementId = await MeasurementModel.insert(
        {
          patientId,
          appointmentId,
          takenAt: new Date(),
          values: { weightKg, waistCm, hipCm, bodyFatPct, muscleMassKg },
          method,
          recordedBy: actor.id,
        },
        session,
      );
      await AuditModel.log({ ...ctx, userId: actor.id, event: 'VISIT_RECORDED', details: `id=${patientId}` }, session);
      return { appointmentId: appointmentId.toString(), measurementId: measurementId.toString() };
    });
    if (nextVisitAt) {
      await notifyPatient(patientId, { type: 'cita', title: 'Tienes una proxima cita', body: nextVisitAt.toISOString() });
    }
    return { patient: toPatientDto(await PatientModel.findById(patientId)), consultation };
  },

  async getMealPlan(actor, patientId) {
    await getAccessible(actor, patientId);
    const { id, version, updatedAt, updatedBy, items } = await MealPlanModel.findByPatient(patientId);
    const meals = Object.fromEntries(MEALS.map((m) => [m, []]));
    for (const i of items) {
      meals[i.meal].push({ name: i.name, portion: i.portion, protein: i.protein_g, carbs: i.carbs_g, fat: i.fat_g });
    }
    return { id, version, meals, updatedAt, updatedBy };
  },

  // Cada guardado es una version nueva del plan; la anterior queda como "reemplazada".
  async saveMealPlan(actor, patientId, { meals, reason, expectedVersion }, ctx) {
    await getAccessible(actor, patientId);
    const items = MEALS.flatMap((meal) => (meals[meal] ?? []).map((food, position) => ({ ...food, meal, position })));

    try {
      await withTransaction(async (session) => {
        const saved = await MealPlanModel.saveVersion(patientId, { items, userId: actor.id, reason, expectedVersion }, session);
        await AuditModel.log(
          {
            ...ctx,
            userId: actor.id,
            event: 'MEAL_PLAN_UPDATED',
            details: `paciente=${patientId} version=${saved.version} alimentos=${items.length}`,
          },
          session,
        );
      });
    } catch (err) {
      if (err.message === 'VERSION_CONFLICT' || isDuplicateKey(err)) {
        throw new AppError(409, 'El plan cambio desde que lo abriste; recargalo antes de guardar');
      }
      throw err;
    }
    await notifyPatient(patientId, { type: 'plan', title: 'Tu plan alimenticio se actualizo' });
    return this.getMealPlan(actor, patientId);
  },

  async mealPlanVersions(actor, patientId) {
    await getAccessible(actor, patientId);
    return { items: await MealPlanModel.listVersions(patientId) };
  },

  async mealPlanVersion(actor, patientId, version) {
    await getAccessible(actor, patientId);
    const plan = await MealPlanModel.findVersion(patientId, version);
    if (!plan) throw new AppError(404, 'Version no encontrada');
    const meals = Object.fromEntries(MEALS.map((m) => [m, []]));
    for (const i of plan.items)
      meals[i.meal].push({ name: i.name, portion: i.portion, protein: i.protein_g, carbs: i.carbs_g, fat: i.fat_g });
    return { ...plan, items: undefined, meals };
  },
};
