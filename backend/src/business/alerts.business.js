import { createHash } from 'node:crypto';
import { collection, withTransaction } from '../config/database.js';
import { AlertReviewModel, AlertRuleModel } from '../models/alerts.model.js';
import { AuditModel } from '../models/audit.model.js';
import { normalize } from '../models/catalog.model.js';
import { PatientModel } from '../models/patient.model.js';
import { AppError } from '../utils/AppError.js';
import { PERMISSIONS } from './access.business.js';
import { AuditBusiness } from './audit.business.js';
import { getAccessible } from './patients.business.js';
import { CONSENT_TYPES, currentConsents, missingConsents } from './privacy.business.js';

// Capa BUSINESS de alertas clinicas configurables (etapa 4).
//
// Principios:
// - Una alerta senala algo que el profesional debe revisar; nunca es un diagnostico.
// - La prioridad la fija la regla configurada; el sistema no calcula "gravedad".
// - Las reglas administrativas describen hechos verificables (una alergia registrada, una cita vencida).
// - Las reglas clinicas (umbrales) NO traen valores de fabrica: las configura un profesional y no se
//   pueden activar sin registrar la referencia clinica que las valida.
// - Las alertas se calculan con los registros reales vigentes; no se guardan copias. Solo se guarda el
//   estado de revision (pendiente / revisada / descartada) de cada alerta.

const DAY = 86400000;

export const RULE_TYPES = Object.freeze({
  alergia_registrada: { kind: 'administrativa', label: 'Alergias registradas', origin: 'Historia clinica' },
  seguimiento_pendiente: { kind: 'administrativa', label: 'Seguimientos pendientes (cita vencida)', origin: 'Agenda' },
  consulta_no_realizada: { kind: 'administrativa', label: 'Consultas no realizadas (canceladas)', origin: 'Agenda' },
  datos_incompletos: { kind: 'administrativa', label: 'Datos clinicos incompletos', origin: 'Expediente' },
  objetivo_sin_revision: { kind: 'administrativa', label: 'Objetivos sin revision', origin: 'Objetivos' },
  nota_sin_firmar: { kind: 'administrativa', label: 'Notas sin firmar', origin: 'Consultas' },
  consentimiento_pendiente: { kind: 'administrativa', label: 'Consentimientos obligatorios pendientes', origin: 'Privacidad' },
  cambio_antropometrico: { kind: 'clinica', label: 'Cambios antropometricos relevantes', origin: 'Antropometria' },
  laboratorio_fuera_rango: { kind: 'clinica', label: 'Laboratorio fuera del rango configurado', origin: 'Laboratorio' },
  interaccion_revision: { kind: 'clinica', label: 'Posible interaccion o contraindicacion a revisar', origin: 'Historia clinica y plan' },
});

// Reglas administrativas iniciales (hechos verificables). El usuario puede cambiarlas o desactivarlas.
const DEFAULT_RULES = [
  { type: 'alergia_registrada', name: 'Alergia o intolerancia registrada', priority: 'alta', enabled: true, params: {} },
  {
    type: 'seguimiento_pendiente',
    name: 'Cita programada vencida sin registrar',
    priority: 'media',
    enabled: true,
    params: { overdueDays: 1 },
  },
  { type: 'consulta_no_realizada', name: 'Cita cancelada reciente', priority: 'baja', enabled: true, params: { days: 30 } },
  { type: 'datos_incompletos', name: 'Datos del expediente incompletos', priority: 'baja', enabled: true, params: {} },
  {
    type: 'objetivo_sin_revision',
    name: 'Objetivo pendiente con fecha meta vencida',
    priority: 'media',
    enabled: true,
    params: { graceDays: 0 },
  },
  { type: 'nota_sin_firmar', name: 'Nota en borrador sin firmar', priority: 'media', enabled: true, params: { hours: 24 } },
  { type: 'consentimiento_pendiente', name: 'Consentimiento obligatorio pendiente', priority: 'alta', enabled: true, params: {} },
].map((r) => ({ ...r, kind: RULE_TYPES[r.type].kind }));

const oid = (v) => (v ? v.toString() : null);
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const includesTerm = (text, term) => normalize(text).includes(normalize(term));

// Datos faltantes del expediente (mismo criterio que la ficha).
export function missingData(patient, history) {
  const id = patient.identification ?? {};
  const missing = [];
  if (!patient.phone && !id.email) missing.push('Telefono o correo de contacto');
  if (!id.emergencyContact?.name || !id.emergencyContact?.phone) missing.push('Contacto de emergencia');
  if (!id.consultReason) missing.push('Motivo de consulta');
  if (!id.occupation) missing.push('Ocupacion');
  if (!history.some((h) => h.category === 'alergia')) missing.push('Alergias (registrar tambien "sin alergias conocidas")');
  if (!history.some((h) => h.category === 'medicamento')) missing.push('Medicamentos (registrar tambien "ninguno")');
  if (!patient.target_weight_kg) missing.push('Peso objetivo');
  return missing;
}

// ------------------------------------------------------------------ carga de datos (por lotes)
const MAX_WINDOW_DAYS = 400;

async function loadContexts(patients) {
  const ids = patients.map((p) => p.id);
  const since = new Date(Date.now() - MAX_WINDOW_DAYS * DAY);
  const [history, appointments, goals, drafts, measurements, labs, plans, consents] = await Promise.all([
    collection('antecedentes')
      .find({ patientId: { $in: ids }, supersededBy: null })
      .toArray(),
    collection('citas')
      .find({ patientId: { $in: ids }, $or: [{ status: 'programada' }, { status: 'cancelada', cancelledAt: { $gte: since } }] })
      .toArray(),
    collection('objetivos')
      .find({ patientId: { $in: ids }, status: 'pendiente' })
      .toArray(),
    collection('notasClinicas')
      .find({ patientId: { $in: ids }, status: 'borrador' }, { projection: { soap: 0 } })
      .toArray(),
    collection('mediciones')
      .find({ patientId: { $in: ids }, supersededBy: null, takenAt: { $gte: since } })
      .sort({ takenAt: 1 })
      .toArray(),
    collection('laboratorios')
      .find({ patientId: { $in: ids }, takenAt: { $gte: since } })
      .toArray(),
    collection('planesAlimenticios')
      .find({ patientId: { $in: ids }, status: 'vigente' }, { projection: { items: 1, patientId: 1 } })
      .toArray(),
    currentConsents(ids),
  ]);
  const by = (rows) => {
    const m = new Map(ids.map((id) => [id, []]));
    for (const r of rows) m.get(r.patientId)?.push(r);
    return m;
  };
  const [h, a, g, d, ms, l, pl] = [history, appointments, goals, drafts, measurements, labs, plans].map(by);
  return patients.map((p) => ({
    patient: p,
    history: h.get(p.id),
    appointments: a.get(p.id),
    goals: g.get(p.id),
    drafts: d.get(p.id),
    measurements: ms.get(p.id),
    labs: l.get(p.id),
    planItems: pl.get(p.id)[0]?.items ?? [],
    consents: consents.get(p.id) ?? {},
  }));
}

// ------------------------------------------------------------------ evaluacion de reglas
const FIELD_LABELS = { weightKg: ['Peso', 'kg'], waistCm: ['Cintura', 'cm'], bodyFatPct: ['Grasa corporal', '%'], hipCm: ['Cadera', 'cm'] };

const EVALUATORS = {
  alergia_registrada(rule, c) {
    return c.history
      .filter((h) => h.category === 'alergia' && h.status === 'activo')
      .map((h) => ({
        subject: `antecedente:${oid(h.rootId)}`,
        reason: `Alergia o intolerancia registrada: ${h.description}`,
        at: h.recordedAt,
        ref: { kind: 'antecedente', id: oid(h._id) },
      }));
  },

  seguimiento_pendiente(rule, c) {
    const limit = Date.now() - (rule.params.overdueDays ?? 1) * DAY;
    return c.appointments
      .filter((a) => a.status === 'programada' && a.scheduledAt.getTime() < limit)
      .map((a) => ({
        subject: `cita:${oid(a._id)}`,
        reason: 'Cita programada vencida sin registrar',
        at: a.scheduledAt,
        ref: { kind: 'cita', id: oid(a._id) },
      }));
  },

  consulta_no_realizada(rule, c) {
    const since = Date.now() - (rule.params.days ?? 30) * DAY;
    return c.appointments
      .filter((a) => a.status === 'cancelada' && a.cancelledAt && a.cancelledAt.getTime() >= since)
      .map((a) => ({
        subject: `cita:${oid(a._id)}`,
        reason: `Consulta no realizada${a.cancelReason ? `: ${a.cancelReason}` : ''}`,
        at: a.cancelledAt,
        ref: { kind: 'cita', id: oid(a._id) },
      }));
  },

  datos_incompletos(rule, c) {
    const missing = missingData(c.patient, c.history);
    return missing.length
      ? [
          {
            subject: `datos:${hash(missing.join('|'))}`,
            reason: `Datos incompletos: ${missing.join(', ')}`,
            at: null,
            ref: { kind: 'expediente', id: String(c.patient.id) },
          },
        ]
      : [];
  },

  objetivo_sin_revision(rule, c) {
    const today = new Date().toISOString().slice(0, 10);
    const grace = rule.params.graceDays ?? 0;
    return c.goals
      .filter(
        (g) => g.targetDate && new Date(`${g.targetDate}T00:00:00Z`).getTime() + grace * DAY < new Date(`${today}T00:00:00Z`).getTime(),
      )
      .map((g) => ({
        subject: `objetivo:${oid(g._id)}`,
        reason: `Objetivo pendiente con fecha meta vencida: ${g.description}`,
        at: new Date(`${g.targetDate}T12:00:00Z`),
        ref: { kind: 'objetivo', id: oid(g._id) },
      }));
  },

  nota_sin_firmar(rule, c) {
    const limit = Date.now() - (rule.params.hours ?? 24) * 3600000;
    return c.drafts
      .filter((n) => n.updatedAt.getTime() < limit)
      .map((n) => ({
        subject: `nota:${oid(n._id)}`,
        reason: 'Nota clinica en borrador sin firmar',
        at: n.updatedAt,
        ref: { kind: 'nota', id: oid(n._id) },
      }));
  },

  consentimiento_pendiente(rule, c) {
    const missing = missingConsents(c.consents);
    return missing.length
      ? [
          {
            subject: `consentimiento:${missing.join('+')}`,
            reason: `Consentimiento pendiente: ${missing.map((t) => CONSENT_TYPES[t].label).join('; ')}`,
            at: null,
            ref: { kind: 'expediente', id: String(c.patient.id) },
          },
        ]
      : [];
  },

  // Compara la ultima medicion de un campo con la mas antigua dentro de la ventana configurada.
  cambio_antropometrico(rule, c) {
    const { field, pctChange, windowDays } = rule.params;
    const rows = c.measurements.filter((m) => Number.isFinite(m.values?.[field]));
    const last = rows.at(-1);
    if (!last) return [];
    const from = last.takenAt.getTime() - windowDays * DAY;
    const base = rows.find((m) => m.takenAt.getTime() >= from && m !== last);
    if (!base || base.values[field] === 0) return [];
    const pct = ((last.values[field] - base.values[field]) / base.values[field]) * 100;
    if (Math.abs(pct) < pctChange) return [];
    const [label, unit] = FIELD_LABELS[field];
    const days = Math.round((last.takenAt - base.takenAt) / DAY);
    return [
      {
        subject: `medicion:${oid(last._id)}`,
        reason: `${label}: ${base.values[field]} → ${last.values[field]} ${unit} (${pct > 0 ? '+' : ''}${pct.toFixed(1)} % en ${days} dias; regla: ${pctChange} % en ${windowDays} dias)`,
        at: last.takenAt,
        ref: { kind: 'medicion', id: oid(last._id) },
      },
    ];
  },

  // Solo evalua resultados con el mismo estudio y la misma unidad que la regla (no convierte unidades).
  laboratorio_fuera_rango(rule, c) {
    const { analyte, unit, min, max } = rule.params;
    return c.labs
      .filter((l) => normalize(l.analyte) === normalize(analyte) && normalize(l.unit) === normalize(unit))
      .filter((l) => (min !== null && min !== undefined && l.value < min) || (max !== null && max !== undefined && l.value > max))
      .map((l) => ({
        subject: `laboratorio:${oid(l._id)}`,
        reason: `${l.analyte}: ${l.value} ${l.unit}, fuera del rango configurado (${min ?? '—'} a ${max ?? '—'} ${unit})`,
        at: l.takenAt,
        ref: { kind: 'laboratorio', id: oid(l._id) },
      }));
  },

  // Coincidencia de terminos configurados entre antecedentes vigentes y el plan alimenticio vigente.
  interaccion_revision(rule, c) {
    const sources = [
      ...c.history
        .filter((h) => h.status === 'activo' && ['medicamento', 'suplemento', 'alergia', 'enfermedad'].includes(h.category))
        .map((h) => ({ text: h.description, where: 'Historia clinica', id: oid(h.rootId) })),
      ...c.planItems.map((i, n) => ({ text: i.name, where: 'Plan alimenticio', id: `plan${n}` })),
    ];
    const find = (terms) => sources.filter((s) => terms.some((t) => includesTerm(s.text, t)));
    const a = find(rule.params.termsA ?? []);
    const b = find(rule.params.termsB ?? []);
    if (!a.length || !b.length) return [];
    return [
      {
        subject: `interaccion:${hash(
          [...a, ...b]
            .map((s) => s.id)
            .sort()
            .join('|'),
        )}`,
        reason: `Requiere revision profesional: ${a.map((s) => `"${s.text}" (${s.where})`).join(', ')} y ${b.map((s) => `"${s.text}" (${s.where})`).join(', ')}`,
        at: null,
        ref: { kind: 'antecedente', id: null },
      },
    ];
  },
};

function evaluate(context, rules) {
  const out = [];
  for (const rule of rules) {
    const fn = EVALUATORS[rule.type];
    if (!fn) continue;
    for (const a of fn(rule, context)) {
      out.push({
        key: `${oid(rule._id)}:${a.subject}`,
        patientId: context.patient.id,
        patientName: context.patient.full_name,
        ruleId: oid(rule._id),
        ruleName: rule.name,
        ruleVersion: rule.version,
        type: rule.type,
        kind: rule.kind,
        priority: rule.priority,
        origin: RULE_TYPES[rule.type].origin,
        reason: a.reason,
        at: a.at,
        ref: a.ref,
      });
    }
  }
  return out;
}

const PRIORITY_ORDER = { alta: 0, media: 1, baja: 2 };

async function withReviews(alerts, patientIds) {
  const reviews = await AlertReviewModel.listByPatients(patientIds);
  const map = new Map(reviews.map((r) => [`${r.patientId}|${r.key}`, r]));
  return alerts
    .map((a) => {
      const r = map.get(`${a.patientId}|${a.key}`);
      return { ...a, status: r?.status ?? 'pendiente', review: r ? { note: r.note, by: r.by, at: r.at } : null };
    })
    .sort((x, y) => PRIORITY_ORDER[x.priority] - PRIORITY_ORDER[y.priority] || new Date(y.at ?? 0) - new Date(x.at ?? 0));
}

const ruleDto = (r) => ({
  id: oid(r._id),
  type: r.type,
  kind: r.kind,
  typeLabel: RULE_TYPES[r.type]?.label ?? r.type,
  name: r.name,
  priority: r.priority,
  enabled: r.enabled,
  params: r.params ?? {},
  validation: r.validation ?? null,
  system: Boolean(r.system),
  version: r.version,
  updatedAt: r.updatedAt,
  updatedBy: r.updatedBy ?? null,
});

const filterStatus = (alerts, status) => (status === 'todas' ? alerts : alerts.filter((a) => a.status === status));

export const AlertsBusiness = {
  async ensureDefaults() {
    await AlertRuleModel.ensureDefaults(DEFAULT_RULES);
  },

  // ------------------------------------------------------------ reglas
  async listRules() {
    return { types: RULE_TYPES, items: (await AlertRuleModel.list()).map(ruleDto) };
  },

  async createRule(actor, { validationReference, ...data }, ctx) {
    assertClinicalValidation({ ...data, validationReference });
    const id = await withTransaction(async (session) => {
      const newId = await AlertRuleModel.insert(
        {
          ...data,
          kind: RULE_TYPES[data.type].kind,
          validation: validationOf(actor, { validationReference }),
          createdBy: actor.id,
          updatedBy: actor.id,
        },
        session,
      );
      await AuditModel.log(
        { ...ctx, userId: actor.id, event: 'ALERT_RULE_CREATED', details: `tipo=${data.type} activa=${data.enabled}` },
        session,
      );
      return newId;
    });
    return ruleDto(await AlertRuleModel.findById(id));
  },

  async updateRule(actor, ruleId, { expectedVersion, validationReference, ...data }, ctx) {
    const current = await AlertRuleModel.findById(ruleId);
    if (!current) throw new AppError(404, 'Regla no encontrada');
    const merged = { ...current, ...data, type: current.type, validationReference };
    assertClinicalValidation(merged);
    // Los parametros deben corresponder al tipo de la regla (validados contra su esquema en el servicio).
    if (data.params && !paramsValid(current.type, data.params)) throw new AppError(400, 'Parametros invalidos para este tipo de regla');
    const updated = await withTransaction(async (session) => {
      const r = await AlertRuleModel.update(
        ruleId,
        expectedVersion,
        {
          ...data,
          validation: validationReference ? validationOf(actor, { validationReference }) : current.validation,
          updatedBy: actor.id,
        },
        session,
      );
      if (!r) throw new AppError(409, 'La regla cambio desde que la abriste; recarga la pagina');
      await AuditModel.log(
        { ...ctx, userId: actor.id, event: 'ALERT_RULE_UPDATED', details: `regla=${ruleId} version=${r.version} activa=${r.enabled}` },
        session,
      );
      return r;
    });
    return ruleDto(updated);
  },

  async ruleVersions(ruleId) {
    return {
      items: (await AlertRuleModel.listVersions(ruleId)).map((v) => ({
        version: v.version,
        savedAt: v.savedAt,
        rule: ruleDto(v.snapshot),
      })),
    };
  },

  // ------------------------------------------------------------ alertas
  async forPatient(actor, patientId, { status = 'pendiente' } = {}, ctx) {
    const patient = await getAccessible(actor, patientId);
    const [context] = await loadContexts([patient]);
    const alerts = await withReviews(evaluate(context, await AlertRuleModel.listEnabled()), [patientId]);
    if (ctx)
      await AuditBusiness.record({
        ...ctx,
        userId: actor.id,
        event: 'PATIENT_RECORD_VIEWED',
        details: `paciente=${patientId} seccion=alertas`,
      });
    return { items: filterStatus(alerts, status) };
  },

  async worklist(actor, { status = 'pendiente' } = {}) {
    const all = actor.permissions.has(PERMISSIONS.PATIENTS_VIEW_ALL);
    const patients = (await PatientModel.list({ nutritionistId: all ? null : actor.id })).filter((p) => p.record_status === 'activo');
    if (!patients.length) return { items: [] };
    const contexts = await loadContexts(patients);
    const rules = await AlertRuleModel.listEnabled();
    const alerts = await withReviews(
      contexts.flatMap((c) => evaluate(c, rules)),
      patients.map((p) => p.id),
    );
    return { items: filterStatus(alerts, status).slice(0, 1000) };
  },

  // La revision solo se admite sobre una alerta que existe ahora (evita marcar claves inventadas).
  async review(actor, patientId, { key, status, note }, ctx) {
    const { items } = await this.forPatient(actor, patientId, { status: 'todas' });
    const alert = items.find((a) => a.key === key);
    if (!alert) throw new AppError(404, 'La alerta ya no esta activa; recarga la ficha');
    if (status === 'descartada' && note.trim().length < 3) throw new AppError(400, 'Indica por que se descarta la alerta');
    await AlertReviewModel.set(patientId, key, { status, note, by: actor.id, ruleId: alert.ruleId, reason: alert.reason });
    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: 'ALERT_REVIEWED',
      details: `paciente=${patientId} estado=${status} regla=${alert.ruleId}`,
    });
    return { key, status };
  },

  async reviewsForTimeline(patientId, range) {
    return AlertReviewModel.listByPatient(patientId, range);
  },
};

// Una regla clinica activa exige la referencia clinica que la valida (protocolo, guia o acuerdo).
function assertClinicalValidation(rule) {
  if (RULE_TYPES[rule.type]?.kind !== 'clinica' || !rule.enabled) return;
  const ref = rule.validationReference ?? rule.validation?.reference;
  if (!ref || ref.trim().length < 5) {
    throw new AppError(400, 'Una regla clinica solo puede activarse con la referencia clinica que la valida');
  }
}

function validationOf(actor, { validationReference }) {
  const ref = validationReference?.trim();
  return ref ? { reference: ref, recordedBy: actor.id, recordedAt: new Date() } : null;
}

// Se inyecta desde el validador para no duplicar los esquemas de parametros.
let paramsValid = () => true;
export function setParamsValidator(fn) {
  paramsValid = fn;
}
