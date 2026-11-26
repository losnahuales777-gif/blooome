import { z } from 'zod';
import { HISTORY_CATEGORIES } from '../../business/chart.business.js';
import { id } from '../common.validator.js';
import { rangeBound } from '../analysis/analysis.validator.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Identificador invalido');
const day = z.iso.date('Fecha invalida (AAAA-MM-DD)');
const text = (max) => z.string().trim().max(max).default('');
const notFuture = (d) => d.getTime() <= Date.now() + 5 * 60 * 1000;

export const patientParams = z.strictObject({ id });
export const historyParams = z.strictObject({ id, historyId: objectId });
export const noteParams = z.strictObject({ id, noteId: objectId });
export const diagnosisParams = z.strictObject({ id, diagnosisId: objectId });

const phone = z
  .string()
  .trim()
  .regex(/^[0-9 +()-]{7,20}$/, 'Telefono invalido')
  .or(z.literal(''))
  .default('');

// A. Identificacion del paciente (datos que no estaban en el alta basica).
export const identificationSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Correo invalido')).or(z.literal('')).default(''),
  address: text(200),
  occupation: text(80),
  consultReason: text(500),
  emergencyContact: z.strictObject({ name: text(120), relationship: text(40), phone }).default({ name: '', relationship: '', phone: '' }),
  recordStatus: z.enum(['activo', 'inactivo', 'alta']).default('activo'),
});

// Termino elegido de un catalogo autorizado (opcional: sin catalogo se usa texto libre).
const catalogRef = z
  .strictObject({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{1,30}$/),
    source: z.string().trim().min(1).max(120),
    version: z.string().trim().min(1).max(40),
  })
  .nullable()
  .default(null);

// B. Antecedente estructurado: categoria, descripcion, estado, fechas y observaciones.
const historyFields = {
  description: z.string().trim().min(2, 'Describe el antecedente').max(300),
  status: z.enum(['activo', 'resuelto', 'suspendido', 'inactivo']).default('activo'),
  onsetDate: day.nullable().default(null),
  endDate: day.nullable().default(null),
  severity: z.enum(['leve', 'moderada', 'grave']).nullable().default(null),
  dose: z.string().trim().max(60).nullable().default(null),
  frequency: z.string().trim().max(60).nullable().default(null),
  notes: text(1000),
  catalog: catalogRef,
};
const datesInOrder = (h) => !h.onsetDate || !h.endDate || h.onsetDate <= h.endDate;

export const historySchema = z
  .strictObject({ category: z.enum(Object.keys(HISTORY_CATEGORIES)), ...historyFields })
  .refine(datesInOrder, 'La fecha de fin debe ser posterior a la de inicio');

export const historyUpdateSchema = z.strictObject(historyFields).refine(datesInOrder, 'La fecha de fin debe ser posterior a la de inicio');

// D. Nota SOAP.
const soap = z.strictObject({
  s: z.string().max(10000).default(''),
  o: z.string().max(10000).default(''),
  a: z.string().max(10000).default(''),
  p: z.string().max(10000).default(''),
});
const consultationAt = z.iso
  .datetime({ offset: true })
  .transform((v) => new Date(v))
  .refine(notFuture, 'La fecha de la consulta no puede ser futura');

export const noteCreateSchema = z.strictObject({
  consultationAt,
  appointmentId: objectId.nullable().default(null),
  soap: soap.default({ s: '', o: '', a: '', p: '' }),
});

export const noteDraftSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  soap,
  consultationAt: consultationAt.optional(),
});

// La firma exige confirmacion explicita del profesional.
export const signSchema = z.strictObject({ confirm: z.literal(true, 'Confirma que revisaste la nota antes de firmar') });

export const addendumSchema = z.strictObject({ text: z.string().trim().min(5, 'Escribe la adenda').max(5000) });

// C. Diagnostico nutricional documentado por el profesional (formato PES).
export const diagnosisSchema = z.strictObject({
  evaluationId: objectId,
  noteId: objectId.nullable().default(null),
  problem: z.string().trim().min(3, 'Indica el problema').max(300),
  etiology: z.string().trim().min(3, 'Indica la etiologia').max(500),
  signs: z.string().trim().min(3, 'Indica signos y sintomas').max(500),
  code: z.string().trim().max(30).nullable().default(null),
  catalog: catalogRef,
});

// Verificacion en consulta: el profesional confirma que antecedentes vigentes siguen igual.
export const verifySchema = z.strictObject({
  ids: z.array(objectId).min(1).max(100),
  appointmentId: objectId.nullable().default(null),
});

export const diagnosisStatusSchema = z.strictObject({
  status: z.enum(['activo', 'resuelto']),
  note: text(300),
});

const TYPES = [
  'primera_consulta',
  'evaluacion',
  'alerta',
  'consulta',
  'proxima_consulta',
  'nota',
  'medicion',
  'laboratorio',
  'diagnostico',
  'antecedente',
  'tratamiento',
  'plan',
  'objetivo',
];

export const timelineQuery = z.object({
  from: rangeBound('start').optional(),
  to: rangeBound('end').optional(),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.enum(TYPES))),
  authorId: z.coerce.number().int().positive().optional(),
});
