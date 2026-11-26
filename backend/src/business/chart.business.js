import { createHash } from 'node:crypto';
import { withTransaction } from '../config/database.js';
import { AuditModel } from '../models/audit.model.js';
import { DiagnosisModel, EvaluationLookup, HistoryModel, NoteModel } from '../models/chart.model.js';
import { AppointmentModel, EvaluationModel, GoalModel, LabModel, MeasurementModel, toObjectId } from '../models/clinical.model.js';
import { MealPlanModel } from '../models/mealPlan.model.js';
import { PatientModel } from '../models/patient.model.js';
import { AppError } from '../utils/AppError.js';
import { snapshot } from './analysis.business.js';
import { AlertsBusiness, missingData } from './alerts.business.js';
import { AuditBusiness } from './audit.business.js';
import { getAccessible } from './patients.business.js';

// Capa BUSINESS del expediente clinico integral (etapa 1).
// Principios: no se borra informacion clinica, toda modificacion deja version y autor, las notas
// firmadas son inmutables (solo adendas) y la auditoria guarda identificadores, nunca contenido clinico.

// Categorias de antecedentes y los campos adicionales que admite cada una.
export const HISTORY_CATEGORIES = Object.freeze({
  heredofamiliar: 'Antecedentes heredofamiliares',
  patologico: 'Antecedentes personales patologicos',
  no_patologico: 'Antecedentes no patologicos',
  enfermedad: 'Enfermedades diagnosticadas',
  alergia: 'Alergias e intolerancias',
  medicamento: 'Medicamentos',
  suplemento: 'Suplementos',
  cirugia: 'Cirugias',
  hospitalizacion: 'Hospitalizaciones',
  nutricional: 'Antecedentes nutricionales',
  habito_alimentario: 'Habitos alimenticios',
  actividad_fisica: 'Actividad fisica',
  sueno: 'Calidad y duracion del sueno',
  alcohol: 'Consumo de alcohol',
  tabaco: 'Consumo de tabaco',
  ginecoobstetrico: 'Antecedentes ginecoobstetricos',
});

export const recordNumber = (id) => `BL-${String(id).padStart(6, '0')}`;

const hashNote = (note, soap) =>
  createHash('sha256')
    .update(JSON.stringify({ patientId: note.patientId, authorId: note.authorId, consultationAt: note.consultationAt, soap }))
    .digest('hex');

const oid = (v) => (v ? v.toString() : null);

function historyDto(h) {
  return {
    id: oid(h._id),
    rootId: oid(h.rootId),
    version: h.version,
    category: h.category,
    description: h.description,
    status: h.status,
    onsetDate: h.onsetDate ?? null,
    endDate: h.endDate ?? null,
    severity: h.severity ?? null,
    dose: h.dose ?? null,
    frequency: h.frequency ?? null,
    notes: h.notes ?? '',
    catalog: h.catalog ?? null,
    lastVerifiedAt: h.lastVerifiedAt ?? null,
    recordedBy: h.recordedBy,
    recordedAt: h.recordedAt,
    supersedes: oid(h.supersedes),
    superseded: Boolean(h.supersededBy),
  };
}

function noteDto(n, { withSoap = true } = {}) {
  return {
    id: oid(n._id),
    patientId: n.patientId,
    patientName: n.p?.[0]?.fullName,
    authorId: n.authorId,
    authorName: n.u?.[0]?.fullName,
    appointmentId: oid(n.appointmentId),
    consultationAt: n.consultationAt,
    status: n.status,
    version: n.version,
    ...(withSoap && { soap: n.soap }),
    signedAt: n.signedAt ?? null,
    contentHash: n.contentHash ?? null,
    addenda: (n.addenda ?? []).map((a) => ({ text: a.text, authorId: a.authorId, at: a.at })),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

function diagnosisDto(d) {
  return {
    id: oid(d._id),
    evaluationId: oid(d.evaluationId),
    noteId: oid(d.noteId),
    problem: d.problem,
    etiology: d.etiology,
    signs: d.signs,
    code: d.code ?? null,
    catalog: d.catalog ?? null,
    status: d.status,
    statusHistory: d.statusHistory,
    recordedBy: d.recordedBy,
    recordedAt: d.recordedAt,
    resolvedAt: d.resolvedAt ?? null,
  };
}

async function logAccess(actor, patientId, section, ctx) {
  await AuditBusiness.record({
    ...ctx,
    userId: actor.id,
    event: 'PATIENT_RECORD_VIEWED',
    details: `paciente=${patientId} seccion=${section}`,
  });
}

async function getNoteOf(patientId, noteId) {
  const note = await NoteModel.findById(noteId);
  if (!note || note.patientId !== patientId) throw new AppError(404, 'Nota no encontrada');
  return note;
}

// Datos que el expediente deberia tener y aun no tiene (no se inventan: solo se senalan).

export const ChartBusiness = {
  // ------------------------------------------------------------ ficha clinica (resumen)
  async getChart(actor, patientId, ctx) {
    const patient = await getAccessible(actor, patientId);
    const [history, diagnoses, goals, notes, pending, appointments] = await Promise.all([
      HistoryModel.listCurrent(patientId),
      DiagnosisModel.listByPatient(patientId),
      GoalModel.listByPatient(patientId),
      NoteModel.listByPatient(patientId),
      AppointmentModel.findPending(patientId),
      AppointmentModel.listByPatient(patientId),
    ]);
    await logAccess(actor, patientId, 'ficha', ctx);

    const lastVisit = appointments.find((a) => a.status === 'realizada');
    const missing = missingData(patient, history);
    // Alertas pendientes de revision segun las reglas configuradas (modulo de alertas).
    const { items: alerts } = await AlertsBusiness.forPatient(actor, patientId, { status: 'pendiente' });

    return {
      patient: {
        id: patient.id,
        recordNumber: recordNumber(patient.id),
        fullName: patient.full_name,
        birthDate: patient.birth_date,
        sex: patient.sex,
        phone: patient.phone,
        nutritionistId: patient.nutritionist_id,
        nutritionistName: patient.nutritionist_name,
        recordStatus: patient.record_status,
        admissionDate: patient.created_at,
        identification: patient.identification ?? {},
        targetWeightKg: patient.target_weight_kg,
        goal: patient.goal,
        activity: patient.activity,
      },
      lastConsultationAt: lastVisit ? (lastVisit.completedAt ?? lastVisit.scheduledAt) : null,
      nextAppointment: pending ? { id: oid(pending._id), scheduledAt: pending.scheduledAt } : null,
      history: history.map(historyDto),
      diagnoses: diagnoses.map(diagnosisDto),
      goals: goals.map((g) => ({
        id: oid(g._id),
        description: g.description,
        status: g.status,
        diagnosisId: oid(g.diagnosisId),
        targetDate: g.targetDate ?? null,
      })),
      notes: notes.map((n) => noteDto(n, { withSoap: false })),
      missing,
      alerts,
      categories: HISTORY_CATEGORIES,
    };
  },

  async updateIdentification(actor, patientId, { recordStatus, ...identification }, ctx) {
    await getAccessible(actor, patientId);
    await PatientModel.setIdentification(patientId, identification, recordStatus);
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'PATIENT_IDENTIFICATION_UPDATED', details: `paciente=${patientId}` });
    return { recordNumber: recordNumber(patientId), recordStatus };
  },

  // ------------------------------------------------------------ antecedentes versionados
  async addHistory(actor, patientId, data, ctx) {
    await getAccessible(actor, patientId);
    const id = await HistoryModel.insert({ ...data, patientId, recordedBy: actor.id });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'HISTORY_ADDED', details: `paciente=${patientId} ${data.category}` });
    return historyDto(await HistoryModel.findById(id));
  },

  async updateHistory(actor, patientId, historyId, data, ctx) {
    await getAccessible(actor, patientId);
    const previous = await HistoryModel.findById(historyId);
    if (!previous || previous.patientId !== patientId) throw new AppError(404, 'Antecedente no encontrado');
    if (previous.supersededBy) throw new AppError(409, 'Ese registro ya fue actualizado; edita la version vigente');
    let id;
    try {
      id = await withTransaction(async (session) => {
        const newId = await HistoryModel.insertVersion(previous, { category: previous.category, ...data, recordedBy: actor.id }, session);
        await AuditModel.log(
          { ...ctx, userId: actor.id, event: 'HISTORY_UPDATED', details: `paciente=${patientId} ${previous.category}` },
          session,
        );
        return newId;
      });
    } catch (err) {
      if (err.message === 'VERSION_CONFLICT') throw new AppError(409, 'Otro usuario actualizo este registro; recarga la ficha');
      throw err;
    }
    return historyDto(await HistoryModel.findById(id));
  },

  async historyVersions(actor, patientId, historyId, ctx) {
    await getAccessible(actor, patientId);
    const item = await HistoryModel.findById(historyId);
    if (!item || item.patientId !== patientId) throw new AppError(404, 'Antecedente no encontrado');
    await logAccess(actor, patientId, 'historial-antecedente', ctx);
    return (await HistoryModel.listVersions(item.rootId)).map(historyDto);
  },

  async verifyHistory(actor, patientId, { ids, appointmentId }, ctx) {
    await getAccessible(actor, patientId);
    const verified = await HistoryModel.verify(patientId, ids, { by: actor.id, appointmentId });
    if (verified !== ids.length)
      throw new AppError(409, 'Algun antecedente ya fue actualizado o no pertenece al paciente; recarga la ficha');
    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: 'HISTORY_VERIFIED',
      details: `paciente=${patientId} registros=${verified}`,
    });
    return { verified, at: new Date() };
  },

  // ------------------------------------------------------------ notas clinicas SOAP
  async createNote(actor, patientId, { consultationAt, appointmentId, soap }, ctx) {
    await getAccessible(actor, patientId);
    let appt = null;
    if (appointmentId) {
      appt = await AppointmentModel.findById(appointmentId);
      if (!appt || appt.patientId !== patientId) throw new AppError(400, 'La cita no pertenece a este paciente');
    } else {
      // Sin cita indicada: se vincula a la consulta del paciente mas cercana (maximo 12 horas).
      appt = await AppointmentModel.findNear(patientId, consultationAt, 12);
    }
    const id = await NoteModel.insert({
      patientId,
      authorId: actor.id,
      appointmentId: appt?._id ?? null,
      consultationAt,
      soap,
    });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'NOTE_CREATED', details: `paciente=${patientId}` });
    return noteDto(await NoteModel.findById(id));
  },

  // Autoguardado del borrador con control de version (evita sobrescribir cambios de otra pestana).
  async saveDraft(actor, patientId, noteId, { expectedVersion, soap, consultationAt }) {
    await getAccessible(actor, patientId);
    const note = await getNoteOf(patientId, noteId);
    if (note.status !== 'borrador') throw new AppError(409, 'La nota ya esta firmada; usa una adenda para corregirla');
    if (note.authorId !== actor.id) throw new AppError(403, 'Solo el autor puede editar el borrador');
    const saved = await NoteModel.saveDraft(note._id, {
      authorId: actor.id,
      expectedVersion,
      soap,
      consultationAt: consultationAt ?? note.consultationAt,
    });
    if (!saved) throw new AppError(409, 'La nota cambio desde que la abriste; recargala antes de seguir');
    return noteDto(saved);
  },

  async signNote(actor, patientId, noteId, ctx) {
    await getAccessible(actor, patientId);
    const note = await getNoteOf(patientId, noteId);
    if (note.status !== 'borrador') throw new AppError(409, 'La nota ya esta firmada');
    if (note.authorId !== actor.id) throw new AppError(403, 'Solo el autor puede firmar la nota');
    const empty = ['s', 'o', 'a', 'p'].filter((k) => !note.soap?.[k]?.trim());
    if (empty.length) {
      throw new AppError(400, `Completa las secciones antes de firmar: ${empty.map((k) => k.toUpperCase()).join(', ')}`);
    }
    const signed = await withTransaction(async (session) => {
      const r = await NoteModel.sign(note._id, { authorId: actor.id, contentHash: hashNote(note, note.soap), session });
      await AuditModel.log({ ...ctx, userId: actor.id, event: 'NOTE_SIGNED', details: `paciente=${patientId}` }, session);
      return r;
    });
    if (!signed) throw new AppError(409, 'No se pudo firmar: la nota cambio');
    return noteDto(signed);
  },

  async addAddendum(actor, patientId, noteId, text, ctx) {
    await getAccessible(actor, patientId);
    const note = await getNoteOf(patientId, noteId);
    if (note.status !== 'firmada') throw new AppError(409, 'Las adendas solo aplican a notas firmadas; edita el borrador');
    const ok = await NoteModel.addAddendum(note._id, { text, authorId: actor.id, at: new Date() });
    if (!ok) throw new AppError(409, 'No se pudo agregar la adenda');
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'NOTE_ADDENDUM', details: `paciente=${patientId}` });
    return noteDto(await NoteModel.findById(note._id));
  },

  // Nota completa con sus versiones y la comparacion con la evaluacion de la consulta anterior.
  async getNote(actor, patientId, noteId, ctx) {
    await getAccessible(actor, patientId);
    const note = await getNoteOf(patientId, noteId);
    const [versions, around, diagnoses, appointment, linked] = await Promise.all([
      NoteModel.listVersions(note._id),
      EvaluationLookup.aroundDate(patientId, note.signedAt ?? new Date()),
      DiagnosisModel.listByPatient(patientId),
      note.appointmentId ? AppointmentModel.findById(note.appointmentId) : null,
      note.appointmentId ? MeasurementModel.listByAppointment(note.appointmentId) : [],
    ]);
    await logAccess(actor, patientId, 'nota', ctx);
    const summary = (e) =>
      e && {
        id: oid(e._id),
        computedAt: e.computedAt,
        results: e.results.filter((r) =>
          ['imc', 'cambio_peso_pct', 'indice_cintura_estatura', 'masa_grasa', 'gasto_energetico_total', 'adherencia_plan'].includes(
            r.formula,
          ),
        ),
      };
    return {
      note: noteDto(note),
      versions: versions.map((v) => ({
        version: v.version,
        kind: v.kind,
        savedAt: v.savedAt,
        savedBy: v.savedBy,
        soap: v.soap,
        contentHash: v.contentHash ?? null,
      })),
      comparison: { current: summary(around.current), previous: summary(around.previous) },
      diagnoses: diagnoses.filter((d) => oid(d.noteId) === oid(note._id)).map(diagnosisDto),
      // Consulta a la que pertenece la nota y las mediciones vigentes tomadas en ella.
      consultation: appointment && {
        appointmentId: oid(appointment._id),
        status: appointment.status,
        scheduledAt: appointment.scheduledAt,
        completedAt: appointment.completedAt ?? null,
        measurements: linked.map((m) => ({ id: oid(m._id), takenAt: m.takenAt, method: m.method, values: m.values })),
      },
    };
  },

  // ------------------------------------------------------------ evaluaciones y diagnosticos
  async createEvaluation(actor, patientId, ctx) {
    await getAccessible(actor, patientId);
    const id = await snapshot(patientId, null, actor.id);
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'EVALUATION_CREATED', details: `paciente=${patientId}` });
    return { id: oid(id) };
  },

  // Cada diagnostico se sustenta en una evaluacion del mismo paciente (integridad verificada).
  async createDiagnosis(actor, patientId, { evaluationId, noteId, ...data }, ctx) {
    await getAccessible(actor, patientId);
    const evaluation = await EvaluationLookup.findById(evaluationId);
    if (!evaluation || evaluation.patientId !== patientId) throw new AppError(400, 'La evaluacion indicada no pertenece a este paciente');
    if (noteId) await getNoteOf(patientId, noteId);
    const id = await DiagnosisModel.insert({
      ...data,
      code: data.catalog?.code ?? data.code ?? null,
      patientId,
      evaluationId: evaluation._id,
      noteId: noteId ? toObjectId(noteId) : null,
      recordedBy: actor.id,
    });
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'DIAGNOSIS_RECORDED', details: `paciente=${patientId}` });
    return diagnosisDto(await DiagnosisModel.findById(id));
  },

  async setDiagnosisStatus(actor, patientId, diagnosisId, { status, note }, ctx) {
    await getAccessible(actor, patientId);
    const d = await DiagnosisModel.findById(diagnosisId);
    if (!d || d.patientId !== patientId) throw new AppError(404, 'Diagnostico no encontrado');
    await DiagnosisModel.setStatus(d._id, status, actor.id, note);
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'DIAGNOSIS_STATUS_CHANGED', details: `paciente=${patientId} ${status}` });
    return diagnosisDto(await DiagnosisModel.findById(d._id));
  },

  // ------------------------------------------------------------ linea de tiempo clinica
  async getTimeline(actor, patientId, { from, to, types, authorId }, ctx) {
    const patient = await getAccessible(actor, patientId);
    const range = { from, to };
    const [notes, measurements, labs, appointments, diagnoses, history, planVersions, evaluations, goals, alertReviews] = await Promise.all(
      [
        NoteModel.listByPatient(patientId, range),
        MeasurementModel.listCurrent(patientId, range),
        LabModel.listByPatient(patientId, range),
        AppointmentModel.listByPatient(patientId, { from }),
        DiagnosisModel.listByPatient(patientId),
        HistoryModel.listAll(patientId),
        MealPlanModel.listVersions(patientId),
        EvaluationModel.listByPatient(patientId, range),
        GoalModel.listByPatient(patientId),
        AlertsBusiness.reviewsForTimeline(patientId, range),
      ],
    );
    await logAccess(actor, patientId, 'linea-de-tiempo', ctx);

    const inRange = (at) => at && (!from || at >= from) && (!to || at <= to);
    const events = [];
    const firstVisit = [...appointments].reverse().find((a) => a.status === 'realizada');
    // Resumen de lo registrado en cada consulta (mediciones y notas vinculadas a la cita).
    const linkedSummary = (apptId) => {
      const id = oid(apptId);
      const m = measurements.filter((x) => oid(x.appointmentId) === id).length;
      const n = notes.filter((x) => oid(x.appointmentId) === id).length;
      const parts = [m && `${m} medicion(es)`, n && `${n} nota(s)`].filter(Boolean);
      return parts.length ? `Registrado en la consulta: ${parts.join(', ')}` : null;
    };
    for (const a of appointments) {
      const at =
        a.status === 'realizada'
          ? (a.completedAt ?? a.scheduledAt)
          : a.status === 'cancelada'
            ? (a.cancelledAt ?? a.scheduledAt)
            : a.scheduledAt;
      const isFirst = firstVisit && a._id.equals(firstVisit._id);
      events.push({
        type: a.status === 'programada' ? 'proxima_consulta' : isFirst ? 'primera_consulta' : 'consulta',
        at,
        authorId: a.completedBy ?? a.createdBy ?? null,
        title: a.status === 'programada' ? 'Proxima consulta' : isFirst ? 'Primera consulta' : `Consulta ${a.status}`,
        detail: a.cancelReason ?? linkedSummary(a._id),
        ref: { kind: 'cita', id: oid(a._id) },
      });
    }
    for (const n of notes) {
      events.push({
        type: 'nota',
        at: n.signedAt ?? n.updatedAt,
        authorId: n.authorId,
        title: n.status === 'firmada' ? 'Nota SOAP firmada' : 'Nota SOAP en borrador',
        detail: n.addenda?.length ? `${n.addenda.length} adenda(s)` : null,
        ref: { kind: 'nota', id: oid(n._id) },
      });
    }
    let previousWeight = null;
    for (const m of measurements) {
      const w = m.values?.weightKg;
      events.push({
        type: 'medicion',
        at: m.takenAt,
        authorId: m.recordedBy,
        title: Number.isFinite(w) ? `Peso ${w} kg` : 'Medicion antropometrica',
        detail:
          Number.isFinite(w) && Number.isFinite(previousWeight)
            ? `${w - previousWeight > 0 ? '+' : ''}${(w - previousWeight).toFixed(1)} kg desde la anterior`
            : m.method,
        ref: { kind: 'medicion', id: oid(m._id) },
      });
      if (Number.isFinite(w)) previousWeight = w;
    }
    for (const l of labs) {
      events.push({
        type: 'laboratorio',
        at: l.takenAt,
        authorId: l.recordedBy,
        title: `${l.analyte}: ${l.value} ${l.unit}`,
        detail: l.referenceRange ? `Referencia ${l.referenceRange}` : null,
        ref: { kind: 'laboratorio', id: oid(l._id) },
      });
    }
    for (const d of diagnoses) {
      events.push({
        type: 'diagnostico',
        at: d.recordedAt,
        authorId: d.recordedBy,
        title: `Diagnostico: ${d.problem}`,
        detail: d.status === 'resuelto' ? 'Resuelto' : null,
        ref: { kind: 'diagnostico', id: oid(d._id) },
      });
    }
    for (const h of history) {
      const isTreatment = ['medicamento', 'suplemento'].includes(h.category);
      events.push({
        type: isTreatment ? 'tratamiento' : 'antecedente',
        at: h.recordedAt,
        authorId: h.recordedBy,
        title: `${HISTORY_CATEGORIES[h.category]}: ${h.description}`,
        detail: h.version > 1 ? `Actualizado (version ${h.version})` : 'Registrado',
        ref: { kind: 'antecedente', id: oid(h._id) },
      });
    }
    for (const e of evaluations) {
      events.push({
        type: 'evaluacion',
        at: e.computedAt,
        authorId: e.computedBy ?? null,
        title: 'Evaluacion nutricional guardada',
        detail: e.measurementId ? 'Calculada al registrar una medicion' : 'Guardada por el profesional',
        ref: { kind: 'evaluacion', id: oid(e._id) },
      });
    }
    for (const h of history) {
      for (const v of h.verifications ?? []) {
        events.push({
          type: 'antecedente',
          at: v.at,
          authorId: v.by,
          title: `Verificado vigente: ${HISTORY_CATEGORIES[h.category]}`,
          detail: h.description,
          ref: { kind: 'antecedente', id: oid(h._id) },
        });
      }
    }
    for (const r of alertReviews) {
      events.push({
        type: 'alerta',
        at: r.at,
        authorId: r.by,
        title: `Alerta ${r.status}: ${r.reason ?? ''}`.trim(),
        detail: r.note || null,
        ref: { kind: 'alerta', id: r.key },
      });
    }
    for (const v of planVersions) {
      events.push({
        type: 'plan',
        at: v.createdAt,
        authorId: v.createdBy,
        title: v.version === 1 ? 'Plan alimenticio inicial (version 1)' : `Plan alimenticio actualizado (version ${v.version})`,
        detail: [`${v.foods} alimentos, ${v.kcal} kcal`, v.reason].filter(Boolean).join(' · '),
        ref: { kind: 'plan', id: String(v.version) },
      });
    }
    for (const g of goals) {
      for (const s of g.statusHistory ?? []) {
        events.push({
          type: 'objetivo',
          at: s.at,
          authorId: s.by,
          title: `Objetivo ${s.status}: ${g.description}`,
          detail: null,
          ref: { kind: 'objetivo', id: oid(g._id) },
        });
      }
    }

    const wanted = types?.length ? new Set(types) : null;
    const filtered = events
      .filter((e) => e.type === 'proxima_consulta' || inRange(e.at))
      .filter((e) => !wanted || wanted.has(e.type))
      .filter((e) => !authorId || e.authorId === authorId)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    return { events: filtered.slice(0, 500), total: filtered.length };
  },
};
