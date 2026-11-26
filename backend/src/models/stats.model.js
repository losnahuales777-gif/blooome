import { collection } from '../config/database.js';
import { DERIVED_PATIENT_FIELDS } from './derived.pipeline.js';

// Agregaciones para el dashboard administrativo. Todo el agrupamiento ocurre en MongoDB; solo
// viajan totales y puntos numericos (sin nombres), salvo en las alertas, que necesitan identificar
// al paciente para actuar.

const month = (field, tz) => ({
  $dateToString: { format: '%Y-%m', date: field, timezone: tz },
});

export const StatsModel = {
  async patientIds(scope) {
    const docs = await collection('patients')
      .find(scope, { projection: { _id: 1 } })
      .toArray();
    return docs.map((d) => d._id);
  },

  async patients(scope, { from, to, tz }) {
    const [result] = await collection('patients')
      .aggregate([
        { $match: scope },
        {
          $facet: {
            status: [
              {
                $group: {
                  _id: { $ne: ['$isActive', false] },
                  count: { $sum: 1 },
                },
              },
            ],
            goals: [{ $group: { _id: '$goal', count: { $sum: 1 } } }],
            newByMonth: [
              { $match: { createdAt: { $gte: from, $lte: to } } },
              { $group: { _id: month('$createdAt', tz), count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            profiles: [
              { $match: { isActive: { $ne: false } } },
              { $limit: 2000 },
              ...DERIVED_PATIENT_FIELDS,
              {
                $project: {
                  _id: 0,
                  birthDate: 1,
                  weightKg: 1,
                  heightCm: 1,
                  goal: 1,
                },
              },
              { $limit: 2000 },
            ],
          },
        },
      ])
      .toArray();
    return result;
  },

  async appointments(patientIds, { from, to, tz }) {
    const now = new Date();
    const scope = { patientId: { $in: patientIds } };
    // Proximas citas: no dependen del periodo consultado.
    const upcoming = await collection('citas').countDocuments({ ...scope, status: 'programada', scheduledAt: { $gte: now } });
    const [result] = await collection('citas')
      .aggregate([
        { $match: scope },
        // Fecha efectiva: cuando se atendio, cuando se cancelo o, si sigue programada, la fecha planificada.
        {
          $addFields: {
            at: {
              $switch: {
                branches: [
                  { case: { $eq: ['$status', 'realizada'] }, then: { $ifNull: ['$completedAt', '$scheduledAt'] } },
                  { case: { $eq: ['$status', 'cancelada'] }, then: { $ifNull: ['$cancelledAt', '$scheduledAt'] } },
                ],
                default: '$scheduledAt',
              },
            },
            // Programada cuya fecha ya paso sin registrarse: no asistida.
            effectiveStatus: {
              $cond: [{ $and: [{ $eq: ['$status', 'programada'] }, { $lt: ['$scheduledAt', now] }] }, 'no_asistida', '$status'],
            },
          },
        },
        { $match: { at: { $gte: from, $lte: to } } },
        {
          $facet: {
            byStatus: [{ $group: { _id: '$effectiveStatus', count: { $sum: 1 } } }],
            byMonth: [
              { $group: { _id: { month: month('$at', tz), status: '$effectiveStatus' }, count: { $sum: 1 } } },
              { $sort: { '_id.month': 1 } },
            ],
            heatmap: [
              { $match: { effectiveStatus: { $in: ['realizada', 'programada'] } } },
              {
                $group: {
                  _id: { day: { $isoDayOfWeek: { date: '$at', timezone: tz } }, hour: { $hour: { date: '$at', timezone: tz } } },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ])
      .toArray();
    return { ...result, upcoming };
  },

  async overdueAppointments(patientIds) {
    return collection('citas')
      .aggregate([
        {
          $match: {
            patientId: { $in: patientIds },
            status: 'programada',
            scheduledAt: { $lt: new Date(Date.now() - 86400000) },
          },
        },
        { $sort: { scheduledAt: 1 } },
        { $limit: 50 },
        {
          $lookup: {
            from: 'patients',
            localField: 'patientId',
            foreignField: '_id',
            as: 'p',
            pipeline: [{ $project: { fullName: 1 } }],
          },
        },
        {
          $project: {
            _id: 0,
            patientId: 1,
            scheduledAt: 1,
            fullName: { $first: '$p.fullName' },
          },
        },
      ])
      .toArray();
  },

  // Pacientes activos sin cita futura cuya ultima consulta fue hace mas de "days" dias (o nunca).
  async withoutFollowUp(scope, days) {
    const limit = new Date(Date.now() - days * 86400000);
    return collection('patients')
      .aggregate([
        { $match: { ...scope, isActive: { $ne: false } } },
        ...DERIVED_PATIENT_FIELDS,
        {
          $match: {
            $and: [
              { $or: [{ nextVisitAt: null }, { nextVisitAt: { $lt: new Date() } }] },
              { $or: [{ lastVisitAt: null }, { lastVisitAt: { $lt: limit } }] },
            ],
          },
        },
        { $project: { _id: 1, fullName: 1, lastVisitAt: 1 } },
        { $sort: { lastVisitAt: 1 } },
        { $limit: 50 },
      ])
      .toArray();
  },

  // Pacientes activos sin mediciones vigentes en los ultimos "days" dias.
  async withoutRecentMeasurements(scope, days) {
    const limit = new Date(Date.now() - days * 86400000);
    return collection('patients')
      .aggregate([
        { $match: { ...scope, isActive: { $ne: false } } },
        {
          $lookup: {
            from: 'mediciones',
            localField: '_id',
            foreignField: 'patientId',
            as: 'm',
            pipeline: [{ $match: { supersededBy: null } }, { $sort: { takenAt: -1 } }, { $limit: 1 }, { $project: { takenAt: 1 } }],
          },
        },
        {
          $project: {
            fullName: 1,
            lastMeasurementAt: { $first: '$m.takenAt' },
          },
        },
        {
          $match: {
            $or: [{ lastMeasurementAt: null }, { lastMeasurementAt: { $lt: limit } }],
          },
        },
        { $limit: 50 },
      ])
      .toArray();
  },

  async adherenceByMonth(patientIds, { from, to }) {
    return collection('consumos')
      .aggregate([
        {
          $match: {
            patientId: { $in: patientIds },
            date: { $gte: from, $lte: to },
            mealsPlanned: { $gt: 0 },
          },
        },
        { $sort: { recordedAt: -1 } },
        {
          $group: {
            _id: { p: '$patientId', d: '$date' },
            doc: { $first: '$$ROOT' },
          },
        },
        {
          $group: {
            _id: { $substrBytes: ['$_id.d', 0, 7] },
            followed: { $sum: '$doc.mealsFollowed' },
            planned: { $sum: '$doc.mealsPlanned' },
            days: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();
  },

  // Promedio mensual de peso e IMC a partir de las mediciones vigentes.
  async indicatorsByMonth(patientIds, { from, to, tz }) {
    return collection('mediciones')
      .aggregate([
        {
          $match: {
            patientId: { $in: patientIds },
            supersededBy: null,
            takenAt: { $gte: from, $lte: to },
            'values.weightKg': { $type: 'number' },
          },
        },
        {
          $addFields: {
            bmi: {
              $cond: [
                { $gt: ['$values.heightCm', 0] },
                {
                  $divide: ['$values.weightKg', { $pow: [{ $divide: ['$values.heightCm', 100] }, 2] }],
                },
                null,
              ],
            },
          },
        },
        {
          $group: {
            _id: month('$takenAt', tz),
            avgWeightKg: { $avg: '$values.weightKg' },
            avgBmi: { $avg: '$bmi' },
            measurements: { $sum: 1 },
            patients: { $addToSet: '$patientId' },
          },
        },
        {
          $project: {
            avgWeightKg: 1,
            avgBmi: 1,
            measurements: 1,
            patients: { $size: '$patients' },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();
  },
};
