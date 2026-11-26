import { collection } from '../config/database.js';
import { EvaluationLookup, NoteModel } from '../models/chart.model.js';
import { DERIVED_PATIENT_FIELDS } from '../models/derived.pipeline.js';
import { StatsModel } from '../models/stats.model.js';
import { PERMISSIONS } from './access.business.js';
import { recordNumber } from './chart.business.js';

// Listas de trabajo de las secciones del menu (Expedientes, Consultas, Agenda, Laboratorios,
// Evaluaciones). Alcance: los pacientes del nutriologo, o todos con patients.view_all.
const scopeOf = (actor) => (actor.permissions.has(PERMISSIONS.PATIENTS_VIEW_ALL) ? {} : { nutritionistId: actor.id });
const oid = (v) => (v ? v.toString() : null);

export const WorklistsBusiness = {
  async records(actor) {
    const rows = await collection('patients')
      .aggregate([
        { $match: scopeOf(actor) },
        { $sort: { fullName: 1 } },
        { $limit: 1000 },
        ...DERIVED_PATIENT_FIELDS,
        {
          $lookup: {
            from: 'notasClinicas',
            localField: '_id',
            foreignField: 'patientId',
            as: 'notes',
            pipeline: [{ $project: { status: 1, consultationAt: 1 } }],
          },
        },
        {
          $lookup: { from: 'users', localField: 'nutritionistId', foreignField: '_id', as: 'u', pipeline: [{ $project: { fullName: 1 } }] },
        },
        {
          $project: {
            fullName: 1,
            birthDate: 1,
            recordStatus: 1,
            isActive: 1,
            createdAt: 1,
            lastVisitAt: 1,
            nextVisitAt: 1,
            nutritionist: { $first: '$u.fullName' },
            drafts: { $size: { $filter: { input: '$notes', cond: { $eq: ['$$this.status', 'borrador'] } } } },
            signed: { $size: { $filter: { input: '$notes', cond: { $eq: ['$$this.status', 'firmada'] } } } },
            lastNoteAt: { $max: '$notes.consultationAt' },
          },
        },
      ])
      .toArray();
    return rows.map((r) => ({
      id: r._id,
      recordNumber: recordNumber(r._id),
      fullName: r.fullName,
      birthDate: r.birthDate,
      recordStatus: r.recordStatus ?? (r.isActive === false ? 'inactivo' : 'activo'),
      admissionDate: r.createdAt,
      nutritionistName: r.nutritionist ?? null,
      lastVisitAt: r.lastVisitAt ?? null,
      nextVisitAt: r.nextVisitAt ?? null,
      drafts: r.drafts,
      signedNotes: r.signed,
      lastNoteAt: r.lastNoteAt ?? null,
    }));
  },

  async notes(actor, { status, from, to }) {
    const ids = await StatsModel.patientIds(scopeOf(actor));
    const rows = await NoteModel.worklist(ids, { status, from, to });
    return rows.map((n) => ({
      id: oid(n._id),
      patientId: n.patientId,
      patientName: n.p?.[0]?.fullName ?? null,
      authorName: n.u?.[0]?.fullName ?? null,
      consultationAt: n.consultationAt,
      status: n.status,
      updatedAt: n.updatedAt,
      signedAt: n.signedAt ?? null,
      addenda: n.addenda?.length ?? 0,
    }));
  },

  async agenda(actor, { from, to }) {
    const ids = await StatsModel.patientIds(scopeOf(actor));
    const rows = await collection('citas')
      .aggregate([
        { $match: { patientId: { $in: ids }, scheduledAt: { $gte: from, $lte: to } } },
        { $sort: { scheduledAt: 1 } },
        { $limit: 500 },
        { $lookup: { from: 'patients', localField: 'patientId', foreignField: '_id', as: 'p', pipeline: [{ $project: { fullName: 1 } }] } },
      ])
      .toArray();
    return rows.map((a) => ({
      id: oid(a._id),
      patientId: a.patientId,
      patientName: a.p?.[0]?.fullName ?? null,
      scheduledAt: a.scheduledAt,
      status: a.status,
      completedAt: a.completedAt ?? null,
      cancelReason: a.cancelReason ?? null,
    }));
  },

  async labs(actor, { from, to }) {
    const ids = await StatsModel.patientIds(scopeOf(actor));
    const rows = await collection('laboratorios')
      .aggregate([
        { $match: { patientId: { $in: ids }, takenAt: { $gte: from, $lte: to } } },
        { $sort: { takenAt: -1 } },
        { $limit: 500 },
        { $lookup: { from: 'patients', localField: 'patientId', foreignField: '_id', as: 'p', pipeline: [{ $project: { fullName: 1 } }] } },
      ])
      .toArray();
    return rows.map((l) => ({
      id: oid(l._id),
      patientId: l.patientId,
      patientName: l.p?.[0]?.fullName ?? null,
      takenAt: l.takenAt,
      analyte: l.analyte,
      value: l.value,
      unit: l.unit,
      referenceRange: l.referenceRange ?? '',
      laboratory: l.laboratory ?? '',
    }));
  },

  async evaluations(actor, { from, to }) {
    const ids = await StatsModel.patientIds(scopeOf(actor));
    const rows = await EvaluationLookup.worklist(ids, { from, to });
    const pick = (e, f) => e.results?.find((r) => r.formula === f)?.effectiveValue ?? null;
    return rows.map((e) => ({
      id: oid(e._id),
      patientId: e.patientId,
      patientName: e.p?.[0]?.fullName ?? null,
      computedAt: e.computedAt,
      bmi: pick(e, 'imc'),
      weightChangePct: pick(e, 'cambio_peso_pct'),
      energyKcal: pick(e, 'gasto_energetico_total'),
      adherencePct: pick(e, 'adherencia_plan'),
      versions: [...new Set((e.results ?? []).map((r) => r.version))],
    }));
  },
};
