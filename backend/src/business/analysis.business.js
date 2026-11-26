import {
  ACTIVITY_FACTORS,
  CalculationError,
  FORMULAS,
  ageFromBirthDate,
  averageCaloricIntake,
  bmi,
  energyBalance,
  energyTarget,
  fatFreeMass,
  fatMass,
  goalCompliance,
  hydrationEstimate,
  macroDistribution,
  periodVariation,
  planAdherence,
  proteinRequirement,
  restingEnergyMifflin,
  totalEnergyExpenditure,
  waistHeightRatio,
  waistHipRatio,
  weightChangePercent,
  weightProgressToGoal,
} from '../../../calculations/src/index.js';
import { collection, withTransaction } from '../config/database.js';
import { AuditModel } from '../models/audit.model.js';
import {
  AppointmentModel,
  EvaluationModel,
  GoalModel,
  IntakeModel,
  LabModel,
  MeasurementModel,
  OverrideModel,
  toObjectId,
} from '../models/clinical.model.js';
import { PatientModel } from '../models/patient.model.js';
import { AppError } from '../utils/AppError.js';
import { AuditBusiness } from './audit.business.js';
import { getAccessible } from './patients.business.js';

// Capa BUSINESS del analisis nutricional. Aplica el motor de calculos (paquete calculations) a los
// datos del expediente. No emite diagnosticos ni prescripciones automaticas: las estimaciones van
// marcadas como tales y el profesional puede sustituir cualquier resultado con un ajuste justificado.

// Reparto de macronutrientes de referencia de la aplicacion (el mismo del plan alimenticio).
export const MACRO_SPLIT = Object.freeze({ proteinPct: 25, carbsPct: 50, fatPct: 25 });

const FIELDS = ['weightKg', 'heightCm', 'waistCm', 'hipCm', 'bodyFatPct', 'muscleMassKg'];

export const LABELS = {
  imc: 'Indice de masa corporal',
  tmr_mifflin_st_jeor: 'Tasa metabolica en reposo',
  gasto_energetico_total: 'Gasto energetico total',
  objetivo_energetico: 'Objetivo energetico',
  promedio_consumo_calorico: 'Consumo calorico promedio',
  balance_energetico: 'Balance energetico',
  cambio_peso_pct: 'Cambio de peso',
  progreso_peso_objetivo: 'Avance al peso objetivo',
  indice_cintura_cadera: 'Indice cintura-cadera',
  indice_cintura_estatura: 'Indice cintura-estatura',
  masa_grasa: 'Masa grasa',
  masa_libre_grasa: 'Masa libre de grasa',
  distribucion_macronutrientes: 'Distribucion de macronutrientes',
  requerimiento_proteico: 'Requerimiento proteico',
  hidratacion_orientativa: 'Hidratacion orientativa',
  cumplimiento_objetivos: 'Cumplimiento de objetivos',
  adherencia_plan: 'Adherencia al plan',
};

export const ADJUSTABLE_FORMULAS = Object.freeze(Object.keys(LABELS));

// Ultimo valor no nulo de cada campo, con la fecha en que se midio.
function latestValues(measurements) {
  const out = {};
  for (const m of measurements) {
    for (const f of FIELDS) {
      const v = m.values?.[f];
      if (Number.isFinite(v)) out[f] = { value: v, takenAt: m.takenAt };
    }
  }
  return out;
}

function firstValue(measurements, field) {
  const m = measurements.find((x) => Number.isFinite(x.values?.[field]));
  return m ? { value: m.values[field], takenAt: m.takenAt } : null;
}

// Ejecuta una formula sin que un dato invalido rompa toda la evaluacion.
function safe(fn, args, meta) {
  try {
    return fn(args);
  } catch (err) {
    return {
      formula: meta.id,
      version: meta.version,
      kind: meta.kind,
      unit: meta.unit,
      value: null,
      missing: [],
      error: err instanceof CalculationError || err instanceof Error ? err.message : 'Dato invalido',
    };
  }
}

// Calcula todos los indicadores. Los ajustes vigentes del profesional sustituyen el valor "efectivo"
// sin borrar el calculado, y los resultados que dependen de ellos usan el valor efectivo.
export function computeEvaluation({ patient, measurements, intakes, goals, overrides = new Map(), at = new Date() }) {
  const current = latestValues(measurements);
  const initialWeight = firstValue(measurements, 'weightKg');
  const weightKg = current.weightKg?.value ?? null;
  const heightCm = current.heightCm?.value ?? patient.height_cm ?? null;
  const ageYears = patient.birth_date ? ageFromBirthDate(patient.birth_date, at) : null;

  const results = [];
  const effective = (r) => {
    const o = overrides.get(r.formula);
    return o ? o.adjustedValue : r.value;
  };
  const push = (r, inputs) => {
    const o = overrides.get(r.formula);
    const row = {
      ...r,
      label: LABELS[r.formula] ?? r.formula,
      reference: Object.values(FORMULAS).find((f) => f.id === r.formula)?.reference ?? null,
      inputs,
      override: o
        ? { value: o.adjustedValue, reason: o.reason, adjustedBy: o.adjustedBy, adjustedAt: o.adjustedAt, calculatedValue: r.value }
        : null,
      effectiveValue: o ? o.adjustedValue : r.value,
    };
    results.push(row);
    return row;
  };

  push(safe(bmi, { weightKg, heightCm }, FORMULAS.imc), { weightKg, heightCm });

  const tmr = push(safe(restingEnergyMifflin, { weightKg, heightCm, ageYears, sex: patient.sex }, FORMULAS.tmrMifflin), {
    weightKg,
    heightCm,
    ageYears,
    sex: patient.sex,
  });
  const activityFactor = ACTIVITY_FACTORS[patient.activity] ?? null;
  const get = push(safe(totalEnergyExpenditure, { restingKcal: effective(tmr), activityFactor }, FORMULAS.get), {
    restingKcal: effective(tmr),
    activityFactor,
    activity: patient.activity,
  });
  const target = push(safe(energyTarget, { expenditureKcal: effective(get), goal: patient.goal }, FORMULAS.energyTarget), {
    expenditureKcal: effective(get),
    goal: patient.goal,
  });

  const avg = averageCaloricIntake(intakes);
  push(avg, { diasRegistrados: avg.daysCounted });
  push(safe(energyBalance, { intakeKcal: avg.value, expenditureKcal: effective(get) }, FORMULAS.balance), {
    intakeKcal: avg.value,
    expenditureKcal: effective(get),
  });

  push(safe(weightChangePercent, { initialKg: initialWeight?.value ?? null, currentKg: weightKg }, FORMULAS.weightChange), {
    initialKg: initialWeight?.value ?? null,
    initialAt: initialWeight?.takenAt ?? null,
    currentKg: weightKg,
    currentAt: current.weightKg?.takenAt ?? null,
  });
  push(
    safe(
      weightProgressToGoal,
      { initialKg: initialWeight?.value ?? null, currentKg: weightKg, targetKg: patient.target_weight_kg },
      FORMULAS.goalProgress,
    ),
    { initialKg: initialWeight?.value ?? null, currentKg: weightKg, targetKg: patient.target_weight_kg },
  );

  const waistCm = current.waistCm?.value ?? null;
  const hipCm = current.hipCm?.value ?? null;
  push(safe(waistHipRatio, { waistCm, hipCm }, FORMULAS.waistHip), { waistCm, hipCm });
  push(safe(waistHeightRatio, { waistCm, heightCm }, FORMULAS.waistHeight), { waistCm, heightCm });

  const bodyFatPct = current.bodyFatPct?.value ?? null;
  push(safe(fatMass, { weightKg, bodyFatPct }, FORMULAS.fatMass), { weightKg, bodyFatPct });
  push(safe(fatFreeMass, { weightKg, bodyFatPct }, FORMULAS.fatFreeMass), { weightKg, bodyFatPct });

  push(safe(macroDistribution, { kcal: effective(target), ...MACRO_SPLIT }, FORMULAS.macros), {
    kcal: effective(target),
    ...MACRO_SPLIT,
  });
  push(safe(proteinRequirement, { weightKg, gPerKg: patient.protein_g_per_kg }, FORMULAS.protein), {
    weightKg,
    gPerKg: patient.protein_g_per_kg,
  });
  push(safe(hydrationEstimate, { weightKg }, FORMULAS.hydration), { weightKg, mlPerKg: 35 });

  const achieved = goals.filter((g) => g.status === 'cumplido').length;
  push(safe(goalCompliance, { achieved: goals.length ? achieved : null, total: goals.length || null }, FORMULAS.goalCompliance), {
    achieved,
    total: goals.length,
  });
  const adherence = planAdherence(intakes.map((d) => ({ mealsPlanned: d.mealsPlanned, mealsFollowed: d.mealsFollowed })));
  push(adherence, { diasRegistrados: adherence.daysCounted });

  return results;
}

// Instantanea con la version de cada formula, para trazabilidad (no se recalcula en el pasado).
export async function snapshot(patientId, measurementId, actorId) {
  const patient = await PatientModel.findById(patientId);
  const [measurements, goals, overrides] = await Promise.all([
    MeasurementModel.listCurrent(patientId),
    GoalModel.listByPatient(patientId),
    OverrideModel.latestByFormula(patientId),
  ]);
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const intakes = await IntakeModel.listLatestPerDay(patientId, { from: since });
  const results = computeEvaluation({ patient, measurements, intakes, goals, overrides }).map(
    ({ formula, version, kind, unit, value, effectiveValue, missing }) => ({
      formula,
      version,
      kind,
      unit,
      value,
      effectiveValue,
      missing,
    }),
  );
  return EvaluationModel.insert({ patientId, measurementId, computedBy: actorId, results });
}

const toDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

function seriesFrom(measurements, range) {
  const inRange = measurements.filter((m) => (!range.from || m.takenAt >= range.from) && (!range.to || m.takenAt <= range.to));
  const pick = (field) =>
    inRange.filter((m) => Number.isFinite(m.values?.[field])).map((m) => ({ date: m.takenAt, value: m.values[field], kind: 'medido' }));
  const derived = (fn, meta) =>
    inRange
      .map((m) => {
        const r = safe(fn, { ...m.values }, meta);
        return Number.isFinite(r.value) ? { date: m.takenAt, value: r.value, kind: r.kind } : null;
      })
      .filter(Boolean);
  return {
    weightKg: pick('weightKg'),
    bmi: derived(bmi, FORMULAS.imc),
    waistCm: pick('waistCm'),
    hipCm: pick('hipCm'),
    bodyFatPct: pick('bodyFatPct'),
    fatMassKg: derived(fatMass, FORMULAS.fatMass),
    muscleMassKg: pick('muscleMassKg'),
  };
}

function toMeasurementDto(m) {
  return {
    id: m._id.toString(),
    takenAt: m.takenAt,
    values: m.values,
    method: m.method,
    notes: m.notes ?? '',
    source: m.source,
    recordedBy: m.recordedBy,
    recordedAt: m.recordedAt,
    supersedes: m.supersedes?.toString() ?? null,
    correctionReason: m.correctionReason ?? null,
  };
}

const idOf = (doc) => ({ ...doc, id: doc._id.toString(), _id: undefined, patientId: undefined });

export const AnalysisBusiness = {
  // Todo lo que necesita el dashboard individual en una sola respuesta.
  async getAnalysis(actor, patientId, range) {
    const patient = await getAccessible(actor, patientId);
    const dayRange = { from: toDay(range.from), to: toDay(range.to) };
    const [measurements, intakes, labs, appointments, goals, overrides, evaluations] = await Promise.all([
      MeasurementModel.listCurrent(patientId),
      IntakeModel.listLatestPerDay(patientId, dayRange),
      LabModel.listByPatient(patientId, range),
      // Citas desde el inicio del periodo e incluidas las proximas (futuras).
      AppointmentModel.listByPatient(patientId, { from: range.from }),
      GoalModel.listByPatient(patientId),
      OverrideModel.latestByFormula(patientId),
      EvaluationModel.listByPatient(patientId, range),
    ]);

    const evaluation = computeEvaluation({ patient, measurements, intakes, goals, overrides });
    const byId = Object.fromEntries(evaluation.map((r) => [r.formula, r]));
    const series = seriesFrom(measurements, range);

    return {
      patient: {
        id: patient.id,
        fullName: patient.full_name,
        sex: patient.sex,
        birthDate: patient.birth_date,
        heightCm: patient.height_cm,
        activity: patient.activity,
        goal: patient.goal,
        targetWeightKg: patient.target_weight_kg,
        proteinGPerKg: patient.protein_g_per_kg,
      },
      range,
      evaluation,
      targets: {
        kcal: byId.objetivo_energetico?.effectiveValue ?? null,
        macros: byId.distribucion_macronutrientes?.effectiveValue ?? null,
        waterMl: byId.hidratacion_orientativa?.effectiveValue ?? null,
        weightKg: patient.target_weight_kg,
      },
      reference: {
        initialWeight: firstValue(measurements, 'weightKg'),
      },
      series,
      variation: {
        weightWeekly: periodVariation(series.weightKg, 'week'),
        weightMonthly: periodVariation(series.weightKg, 'month'),
        waistMonthly: periodVariation(series.waistCm, 'month'),
      },
      intake: intakes.map((d) => ({
        date: d.date,
        kcal: d.kcal ?? null,
        proteinG: d.proteinG ?? null,
        carbsG: d.carbsG ?? null,
        fatG: d.fatG ?? null,
        waterMl: d.waterMl ?? null,
        activityMinutes: d.activityMinutes ?? null,
        activityType: d.activityType ?? null,
        mealsPlanned: d.mealsPlanned ?? null,
        mealsFollowed: d.mealsFollowed ?? null,
      })),
      measurements: measurements.map(toMeasurementDto),
      labs: labs.map(idOf),
      appointments: appointments.map(idOf),
      goals: goals.map(idOf),
      evaluations: evaluations.map(idOf),
    };
  },

  async addMeasurement(actor, patientId, data, ctx) {
    await getAccessible(actor, patientId);
    // Solo se guarda lo que se midio: la estatura no se copia de mediciones anteriores.
    const values = Object.fromEntries(FIELDS.map((f) => [f, data[f] ?? null]));
    if (data.appointmentId) {
      const appt = await AppointmentModel.findById(data.appointmentId);
      if (!appt || appt.patientId !== patientId) throw new AppError(400, 'La consulta indicada no pertenece a este paciente');
    }
    const id = await MeasurementModel.insert({
      patientId,
      appointmentId: data.appointmentId ? toObjectId(data.appointmentId) : null,
      takenAt: data.takenAt,
      values,
      method: data.method,
      notes: data.notes,
      recordedBy: actor.id,
    });
    await snapshot(patientId, id, actor.id);
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'MEASUREMENT_RECORDED', details: `paciente=${patientId}` });
    return { id: id.toString() };
  },

  // Correccion: nuevo documento que sustituye al anterior; el original se conserva intacto.
  async correctMeasurement(actor, patientId, measurementId, data, ctx) {
    await getAccessible(actor, patientId);
    const original = await MeasurementModel.findById(measurementId);
    if (!original || original.patientId !== patientId) throw new AppError(404, 'Medicion no encontrada');
    if (original.supersededBy) throw new AppError(409, 'Esa medicion ya fue corregida; corrige la version vigente');

    const values = { ...original.values, ...Object.fromEntries(FIELDS.filter((f) => f in data).map((f) => [f, data[f]])) };
    const newId = await withTransaction(async (session) => {
      const id = await MeasurementModel.insert(
        {
          patientId,
          appointmentId: original.appointmentId ?? null,
          takenAt: original.takenAt,
          values,
          method: data.method ?? original.method,
          notes: data.notes ?? original.notes,
          recordedBy: actor.id,
          supersedes: original._id,
          correctionReason: data.reason,
        },
        session,
      );
      await MeasurementModel.markSuperseded(original._id, id, session);
      await AuditModel.log({ ...ctx, userId: actor.id, event: 'MEASUREMENT_CORRECTED', details: `paciente=${patientId}` }, session);
      return id;
    });
    await snapshot(patientId, newId, actor.id);
    return { id: newId.toString() };
  },

  async addIntake(actor, patientId, data, ctx) {
    await getAccessible(actor, patientId);
    if (Number.isFinite(data.mealsFollowed) && Number.isFinite(data.mealsPlanned) && data.mealsFollowed > data.mealsPlanned) {
      throw new AppError(400, 'Las comidas seguidas no pueden superar las planificadas');
    }
    const id = await IntakeModel.insert({ ...data, patientId, recordedBy: actor.id });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'INTAKE_RECORDED', details: `paciente=${patientId}` });
    return { id: id.toString() };
  },

  async addLab(actor, patientId, data, ctx) {
    await getAccessible(actor, patientId);
    const id = await LabModel.insert({ ...data, patientId, recordedBy: actor.id });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'LAB_RECORDED', details: `paciente=${patientId}` });
    return { id: id.toString() };
  },

  async addGoal(actor, patientId, { diagnosisId, ...data }, ctx) {
    await getAccessible(actor, patientId);
    // Integridad: el diagnostico vinculado debe ser del mismo paciente.
    let diagnosis = null;
    if (diagnosisId) {
      diagnosis = await collection('diagnosticos').findOne({ _id: { $eq: toObjectId(diagnosisId) } });
      if (!diagnosis || diagnosis.patientId !== patientId) throw new AppError(400, 'El diagnostico indicado no pertenece a este paciente');
    }
    const id = await GoalModel.insert({ ...data, diagnosisId: diagnosis?._id ?? null, patientId, createdBy: actor.id });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'GOAL_CREATED', details: `paciente=${patientId}` });
    return { id: id.toString() };
  },

  async setGoalStatus(actor, patientId, goalId, status, ctx) {
    await getAccessible(actor, patientId);
    const goal = await GoalModel.findById(goalId);
    if (!goal || goal.patientId !== patientId) throw new AppError(404, 'Objetivo no encontrado');
    await GoalModel.setStatus(goal._id, status, actor.id);
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'GOAL_STATUS_CHANGED', details: `paciente=${patientId} ${status}` });
    return { id: goal._id.toString(), status };
  },

  // Ajuste profesional de un resultado: se guarda junto al valor calculado y su justificacion.
  async addOverride(actor, patientId, { formula, adjustedValue, reason }, ctx) {
    const patient = await getAccessible(actor, patientId);
    const [measurements, goals, overrides] = await Promise.all([
      MeasurementModel.listCurrent(patientId),
      GoalModel.listByPatient(patientId),
      OverrideModel.latestByFormula(patientId),
    ]);
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const intakes = await IntakeModel.listLatestPerDay(patientId, { from: since });
    const calculated = computeEvaluation({ patient, measurements, intakes, goals, overrides }).find((r) => r.formula === formula);
    if (!calculated) throw new AppError(400, 'Indicador no ajustable');

    const id = await OverrideModel.insert({
      patientId,
      formula,
      formulaVersion: calculated.version,
      calculatedValue: calculated.value,
      adjustedValue,
      unit: calculated.unit,
      reason,
      adjustedBy: actor.id,
    });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'CLINICAL_OVERRIDE', details: `paciente=${patientId} ${formula}` });
    return { id: id.toString() };
  },

  async cancelAppointment(actor, patientId, appointmentId, reason, ctx) {
    await getAccessible(actor, patientId);
    const appt = await AppointmentModel.findById(appointmentId);
    if (!appt || appt.patientId !== patientId) throw new AppError(404, 'Cita no encontrada');
    if (appt.status !== 'programada') throw new AppError(409, 'Solo se pueden cancelar citas programadas');
    await AppointmentModel.update(appt._id, { status: 'cancelada', cancelledAt: new Date(), cancelledBy: actor.id, cancelReason: reason });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'APPOINTMENT_CANCELLED', details: `paciente=${patientId}` });
    return { id: appt._id.toString(), status: 'cancelada' };
  },
};
