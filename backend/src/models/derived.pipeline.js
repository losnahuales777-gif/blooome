// Datos "actuales" del paciente derivados de su fuente unica (etapa 2): las medidas vienen de la
// ultima medicion vigente que tenga ese dato y las fechas de visita vienen de la coleccion "citas".
// Asi el expediente no guarda copias que puedan quedar desactualizadas.

// Una medicion es vigente si no fue sustituida por una correccion (supersededBy nulo o ausente).
const vigente = { $lte: ['$supersededBy', null] };

const latestMeasure = (field) => ({
  $lookup: {
    from: 'mediciones',
    let: { pid: '$_id' },
    as: `_m_${field}`,
    pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$patientId', '$$pid'] }, vigente, { $isNumber: `$values.${field}` }] } } },
      { $sort: { takenAt: -1, recordedAt: -1 } },
      { $limit: 1 },
      { $project: { _id: 0, v: `$values.${field}`, at: '$takenAt' } },
    ],
  },
});

const appointment = (status, sort, as) => ({
  $lookup: {
    from: 'citas',
    let: { pid: '$_id' },
    as,
    pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$patientId', '$$pid'] }, { $eq: ['$status', status] }] } } },
      { $sort: sort },
      { $limit: 1 },
      { $project: { _id: 0, scheduledAt: 1, completedAt: 1 } },
    ],
  },
});

// Los valores guardados en el expediente (anteriores a la migracion) solo se usan como respaldo
// cuando el paciente aun no tiene ninguna medicion con ese dato.
export const DERIVED_PATIENT_FIELDS = Object.freeze([
  latestMeasure('weightKg'),
  latestMeasure('heightCm'),
  latestMeasure('waistCm'),
  appointment('programada', { scheduledAt: 1 }, '_next'),
  appointment('realizada', { completedAt: -1, scheduledAt: -1 }, '_last'),
  {
    $addFields: {
      weightKg: { $ifNull: [{ $first: '$_m_weightKg.v' }, '$weightKg'] },
      heightCm: { $ifNull: [{ $first: '$_m_heightCm.v' }, '$heightCm'] },
      waistCm: { $ifNull: [{ $first: '$_m_waistCm.v' }, '$waistCm'] },
      measuredAt: { $first: '$_m_weightKg.at' },
      nextVisitAt: { $ifNull: [{ $first: '$_next.scheduledAt' }, null] },
      lastVisitAt: { $ifNull: [{ $first: '$_last.completedAt' }, { $first: '$_last.scheduledAt' }, null] },
    },
  },
  { $project: { _m_weightKg: 0, _m_heightCm: 0, _m_waistCm: 0, _next: 0, _last: 0 } },
]);
