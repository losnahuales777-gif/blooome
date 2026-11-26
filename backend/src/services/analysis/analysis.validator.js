import { z } from 'zod';
import { ADJUSTABLE_FORMULAS } from '../../business/analysis.business.js';
import { id } from '../common.validator.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Identificador invalido');
const day = z.iso.date('Fecha invalida (AAAA-MM-DD)');
const optionalNumber = (min, max) => z.number().min(min).max(max).nullable().default(null);
const notInFuture = (d) => d.getTime() <= Date.now() + 5 * 60 * 1000;

export const patientParams = z.strictObject({ id });
export const measurementParams = z.strictObject({ id, measurementId: objectId });
export const goalParams = z.strictObject({ id, goalId: objectId });
export const appointmentParams = z.strictObject({ id, appointmentId: objectId });

// Limites de periodo: fecha-hora con zona (lo que envia el frontend, en la hora local del usuario)
// o fecha sola (dia completo en UTC).
export const rangeBound = (edge) =>
  z
    .union([z.iso.datetime({ offset: true }), z.iso.date()])
    .transform((v) => (v.length === 10 ? new Date(`${v}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`) : new Date(v)));

// Periodo del dashboard. Sin fechas: ultimos 6 meses.
export const rangeQuery = z
  .object({
    from: rangeBound('start').optional(),
    to: rangeBound('end').optional(),
  })
  .transform(({ from, to }) => {
    const end = to ?? new Date();
    const start = from ?? new Date(end.getTime() - 183 * 86400000);
    return { from: start, to: end };
  })
  .refine((r) => r.from <= r.to, 'La fecha inicial debe ser anterior a la final')
  .refine((r) => r.to - r.from <= 3 * 366 * 86400000, 'El periodo maximo es de 3 anos');

const measures = {
  weightKg: optionalNumber(20, 400),
  heightCm: optionalNumber(100, 250),
  waistCm: optionalNumber(40, 250),
  hipCm: optionalNumber(50, 250),
  bodyFatPct: optionalNumber(2, 75),
  muscleMassKg: optionalNumber(5, 150),
};

export const measurementSchema = z
  .strictObject({
    takenAt: z.iso
      .datetime({ offset: true })
      .transform((v) => new Date(v))
      .refine(notInFuture, 'La fecha no puede ser futura'),
    ...measures,
    method: z.string().trim().min(2, 'Indica el metodo de medicion').max(60),
    notes: z.string().trim().max(500).default(''),
    // Consulta (cita realizada) a la que pertenece la medicion, si se tomo durante una consulta.
    appointmentId: z
      .string()
      .regex(/^[a-f0-9]{24}$/i, 'Identificador invalido')
      .nullable()
      .default(null),
  })
  .refine((m) => Object.keys(measures).some((k) => m[k] !== null), 'Registra al menos una medicion');

// En una correccion solo se envian los campos que cambian: sin valor por defecto, para que los
// campos ausentes conserven el valor de la medicion original.
const correctionMeasures = {
  weightKg: z.number().min(20).max(400).nullable().optional(),
  heightCm: z.number().min(100).max(250).nullable().optional(),
  waistCm: z.number().min(40).max(250).nullable().optional(),
  hipCm: z.number().min(50).max(250).nullable().optional(),
  bodyFatPct: z.number().min(2).max(75).nullable().optional(),
  muscleMassKg: z.number().min(5).max(150).nullable().optional(),
};

export const correctionSchema = z.strictObject({
  ...correctionMeasures,
  method: z.string().trim().min(2).max(60).optional(),
  notes: z.string().trim().max(500).optional(),
  reason: z.string().trim().min(5, 'Explica el motivo de la correccion').max(300),
});

export const intakeSchema = z.strictObject({
  date: day.refine((d) => new Date(`${d}T00:00:00Z`).getTime() <= Date.now() + 86400000, 'La fecha no puede ser futura'),
  kcal: optionalNumber(0, 15000),
  proteinG: optionalNumber(0, 1000),
  carbsG: optionalNumber(0, 2000),
  fatG: optionalNumber(0, 1000),
  waterMl: optionalNumber(0, 15000),
  activityMinutes: optionalNumber(0, 1440),
  activityType: z.string().trim().max(60).nullable().default(null),
  mealsPlanned: z.number().int().min(0).max(12).nullable().default(null),
  mealsFollowed: z.number().int().min(0).max(12).nullable().default(null),
  notes: z.string().trim().max(500).default(''),
});

export const labSchema = z.strictObject({
  takenAt: z.iso
    .datetime({ offset: true })
    .transform((v) => new Date(v))
    .refine(notInFuture, 'La fecha no puede ser futura'),
  analyte: z.string().trim().min(2).max(60),
  value: z.number().min(-1e6).max(1e6),
  unit: z.string().trim().min(1).max(20),
  referenceRange: z.string().trim().max(60).default(''),
  laboratory: z.string().trim().max(80).default(''),
});

// Objetivo vinculado (opcionalmente) a su diagnostico, a un indicador medible y a un periodo.
export const goalSchema = z
  .strictObject({
    description: z.string().trim().min(3).max(200),
    targetDate: day.nullable().default(null),
    diagnosisId: objectId.nullable().default(null),
    indicator: z
      .strictObject({
        formula: z.string().trim().min(2).max(60),
        targetValue: z.number().min(-1e6).max(1e6),
        unit: z.string().trim().min(1).max(20),
      })
      .nullable()
      .default(null),
    periodStart: day.nullable().default(null),
  })
  .refine((g) => !g.periodStart || !g.targetDate || g.periodStart <= g.targetDate, 'El periodo debe iniciar antes de la fecha meta');

export const goalStatusSchema = z.strictObject({
  status: z.enum(['pendiente', 'cumplido', 'no_cumplido']),
});

export const overrideSchema = z.strictObject({
  formula: z.enum(ADJUSTABLE_FORMULAS),
  adjustedValue: z.number().min(-1e6).max(1e6),
  reason: z.string().trim().min(5, 'Justifica el ajuste').max(300),
});

export const cancelSchema = z.strictObject({
  reason: z.string().trim().min(3).max(200),
});
