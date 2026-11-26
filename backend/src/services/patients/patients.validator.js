import { z } from 'zod';

const measure = (min, max, label) => z.number(`${label} debe ser un numero`).min(min).max(max);
const nextVisit = z.iso.datetime({ offset: true }).nullable().default(null);

export const patientSchema = z.strictObject({
  fullName: z.string().trim().min(3, 'Escribe nombre y apellido').max(120),
  birthDate: z.iso.date('Fecha de nacimiento invalida'),
  sex: z.enum(['F', 'M']),
  weightKg: measure(30, 250, 'El peso'),
  heightCm: measure(130, 220, 'La estatura'),
  waistCm: measure(50, 200, 'La cintura').nullable().default(null),
  activity: z.enum(['sedentaria', 'ligera', 'moderada', 'alta']),
  goal: z.enum(['perder', 'mantener', 'ganar']),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9 +()-]{7,20}$/, 'Telefono invalido')
    .or(z.literal(''))
    .default(''),
  notes: z.string().trim().max(1000).default(''),
  nextVisit,
  // Prescripciones opcionales del profesional y estado del expediente.
  targetWeightKg: measure(30, 250, 'El peso objetivo').nullable().default(null),
  proteinGPerKg: z.number().min(0.3).max(3.5).nullable().default(null),
  isActive: z.boolean().default(true),
});

// Edicion del expediente: sin medidas. Peso, estatura y cintura se registran como medicion.
export const patientUpdateSchema = patientSchema.omit({ weightKg: true, heightCm: true, waistCm: true });

export const visitSchema = z.strictObject({
  weightKg: measure(30, 250, 'El peso'),
  waistCm: measure(50, 200, 'La cintura').nullable().default(null),
  hipCm: measure(50, 250, 'La cadera').nullable().default(null),
  bodyFatPct: measure(2, 75, 'El porcentaje de grasa').nullable().default(null),
  muscleMassKg: measure(5, 150, 'La masa muscular').nullable().default(null),
  method: z.string().trim().max(60).default('bascula y cinta metrica'),
  nextVisit,
});

const food = z.strictObject({
  name: z.string().trim().min(1).max(80),
  portion: z.string().trim().min(1).max(30),
  protein: z.number().min(0).max(300),
  carbs: z.number().min(0).max(300),
  fat: z.number().min(0).max(300),
});

const mealItems = z.array(food).max(20).default([]);

export const mealPlanSchema = z.strictObject({
  meals: z.strictObject({
    desayuno: mealItems,
    colacion1: mealItems,
    comida: mealItems,
    colacion2: mealItems,
    cena: mealItems,
  }),
  // Motivo del cambio (queda en la version) y version que se tenia abierta (control de concurrencia).
  reason: z.string().trim().max(300).default(''),
  expectedVersion: z.number().int().min(0).optional(),
});
