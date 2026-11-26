import { isDuplicateKey } from '../config/database.js';
import { LABELS } from '../business/analysis.business.js';
import { AuditBusiness } from '../business/audit.business.js';
import { HISTORY_CATEGORIES, recordNumber } from '../business/chart.business.js';
import { ageFrom, getAccessible, MEALS } from '../business/patients.business.js';
import { DiagnosisModel, EvaluationLookup, HistoryModel, NoteModel } from '../models/chart.model.js';
import { GoalModel, MeasurementModel } from '../models/clinical.model.js';
import { DocumentModel } from '../models/document.model.js';
import { MealPlanModel } from '../models/mealPlan.model.js';
import { UserModel } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { createReport, fmtDate, fmtDateTime, fmtNum } from './pdfRenderer.js';

// Servicio de reportes PDF (etapa 5). Cada reporte se genera en el servidor con los registros
// vigentes, se guarda como documento inmutable (con su huella SHA-256 y version por tipo) y la
// generacion queda en la auditoria. No se incluyen datos que el tipo de reporte no necesita.

export const REPORT_TYPES = Object.freeze({
  historia: { title: 'Historia clinica', thirdParty: false },
  consulta: { title: 'Resumen de consulta', thirdParty: false },
  evaluacion: { title: 'Evaluacion nutricional', thirdParty: false },
  plan: { title: 'Plan alimenticio', thirdParty: true },
  evolucion: { title: 'Reporte de evolucion', thirdParty: true },
  antropometria: { title: 'Resultados antropometricos', thirdParty: true },
  objetivos: { title: 'Seguimiento de objetivos', thirdParty: true },
});

const MEAL_LABELS = {
  desayuno: 'Desayuno',
  colacion1: 'Colacion matutina',
  comida: 'Comida',
  colacion2: 'Colacion vespertina',
  cena: 'Cena',
};
const SEX = { F: 'Femenino', M: 'Masculino' };
const FIELDS = [
  ['weightKg', 'Peso', 'kg'],
  ['heightCm', 'Estatura', 'cm'],
  ['waistCm', 'Cintura', 'cm'],
  ['hipCm', 'Cadera', 'cm'],
  ['bodyFatPct', 'Grasa', '%'],
  ['muscleMassKg', 'Musculo', 'kg'],
];
const kcal = (i) => i.protein_g * 4 + i.carbs_g * 4 + i.fat_g * 9;

// --------------------------------------------------------------- contenido de cada reporte
const BUILDERS = {
  async historia(r, { patient }) {
    const [history, diagnoses] = await Promise.all([HistoryModel.listCurrent(patient.id), DiagnosisModel.listByPatient(patient.id)]);
    const id = patient.identification ?? {};
    r.section('Identificacion');
    r.keyValues([
      ['Fecha de nacimiento', fmtDate(`${patient.birth_date}T12:00:00Z`)],
      ['Sexo', SEX[patient.sex] ?? patient.sex],
      ['Ocupacion', id.occupation || '—'],
      ['Motivo de consulta', id.consultReason || '—'],
      [
        'Contacto de emergencia',
        id.emergencyContact?.name ? `${id.emergencyContact.name} (${id.emergencyContact.relationship || 's/d'})` : '—',
      ],
    ]);
    r.section('Antecedentes vigentes');
    r.table(
      [
        { label: 'Categoria', width: 0.24 },
        { label: 'Descripcion', width: 0.36 },
        { label: 'Estado', width: 0.12 },
        { label: 'Detalle', width: 0.18 },
        { label: 'Version', width: 0.1, align: 'right' },
      ],
      history.map((h) => [
        HISTORY_CATEGORIES[h.category] ?? h.category,
        h.description,
        h.status,
        [h.severity && `severidad ${h.severity}`, h.dose, h.frequency, h.onsetDate && `desde ${h.onsetDate}`].filter(Boolean).join(', ') ||
          '—',
        `v${h.version}`,
      ]),
      { empty: 'Sin antecedentes registrados.' },
    );
    r.section('Diagnosticos nutricionales');
    r.table(
      [
        { label: 'Problema', width: 0.3 },
        { label: 'Etiologia', width: 0.26 },
        { label: 'Signos', width: 0.26 },
        { label: 'Estado', width: 0.18 },
      ],
      diagnoses.map((d) => [d.problem + (d.code ? ` [${d.code}]` : ''), d.etiology, d.signs, `${d.status} (${fmtDate(d.recordedAt)})`]),
      { empty: 'Sin diagnosticos documentados.' },
    );
    return { sources: `${history.length} antecedentes vigentes, ${diagnoses.length} diagnosticos` };
  },

  async consulta(r, { patient, noteId }) {
    if (!noteId) throw new AppError(400, 'Indica la nota de la consulta');
    const note = await NoteModel.findById(noteId);
    if (!note || note.patientId !== patient.id) throw new AppError(404, 'Nota no encontrada');
    const measurements = note.appointmentId ? await MeasurementModel.listByAppointment(note.appointmentId) : [];
    r.section('Consulta');
    r.keyValues([
      ['Fecha de la consulta', fmtDateTime(note.consultationAt)],
      ['Profesional', note.u?.[0]?.fullName ?? '—'],
      [
        'Estado de la nota',
        note.status === 'firmada' ? `Firmada el ${fmtDateTime(note.signedAt)}` : 'BORRADOR (sin firmar, no es un documento definitivo)',
      ],
      ['Version de la nota', `v${note.version}`],
    ]);
    if (measurements.length) {
      r.section('Mediciones de la consulta');
      r.table(
        [
          { label: 'Fecha', width: 0.22 },
          { label: 'Metodo', width: 0.22 },
          ...FIELDS.slice(0, 4).map(([, l, u]) => ({ label: `${l} (${u})`, width: 0.14, align: 'right' })),
        ],
        measurements.map((m) => [fmtDateTime(m.takenAt), m.method, ...FIELDS.slice(0, 4).map(([k]) => fmtNum(m.values?.[k] ?? null))]),
      );
    }
    for (const [k, label] of [
      ['s', 'Subjetivo (S)'],
      ['o', 'Objetivo (O)'],
      ['a', 'Analisis (A)'],
      ['p', 'Plan (P)'],
    ]) {
      r.section(label);
      r.paragraph(note.soap?.[k]?.trim() || 'Sin registrar');
    }
    if (note.addenda?.length) {
      r.section('Adendas');
      for (const a of note.addenda) r.paragraph(`${fmtDateTime(a.at)}: ${a.text}`);
    }
    if (note.contentHash) r.paragraph(`Huella de integridad de la nota (SHA-256): ${note.contentHash}`, { muted: true, size: 7.5 });
    return { sources: `nota v${note.version} (${note.status})`, draft: note.status !== 'firmada' };
  },

  async evaluacion(r, { patient }) {
    const ev = await EvaluationLookup.latest(patient.id);
    if (!ev) throw new AppError(400, 'El paciente no tiene evaluaciones guardadas');
    r.section('Evaluacion guardada');
    r.keyValues([
      ['Fecha de calculo', fmtDateTime(ev.computedAt)],
      ['Identificador', ev._id.toString()],
    ]);
    r.paragraph(
      'Los valores son calculos del motor con la version de formula indicada; no constituyen un diagnostico. Los datos faltantes no se estiman.',
      { muted: true },
    );
    r.table(
      [
        { label: 'Indicador', width: 0.36 },
        { label: 'Valor', width: 0.24, align: 'right' },
        { label: 'Origen', width: 0.16 },
        { label: 'Formula', width: 0.12 },
        { label: 'Faltantes', width: 0.12 },
      ],
      ev.results.map((x) => [
        LABELS[x.formula] ?? x.formula,
        x.effectiveValue === null || x.effectiveValue === undefined
          ? '—'
          : typeof x.effectiveValue === 'object'
            ? `P ${fmtNum(x.effectiveValue.protein, 0)} / C ${fmtNum(x.effectiveValue.carbs, 0)} / G ${fmtNum(x.effectiveValue.fat, 0)} g`
            : `${fmtNum(x.effectiveValue, 2)} ${x.unit ?? ''}`,
        x.kind ?? '—',
        `v${x.version}`,
        x.missing?.length ? x.missing.join(', ') : '—',
      ]),
    );
    return { sources: `evaluacion del ${fmtDate(ev.computedAt)}` };
  },

  async plan(r, { patient }) {
    const plan = await MealPlanModel.findByPatient(patient.id);
    if (!plan.version) throw new AppError(400, 'El paciente no tiene un plan alimenticio guardado');
    r.section(`Plan alimenticio vigente (version ${plan.version})`);
    r.keyValues([['Guardado', fmtDateTime(plan.updatedAt)]]);
    for (const meal of MEALS) {
      const items = plan.items.filter((i) => i.meal === meal);
      r.section(MEAL_LABELS[meal]);
      r.table(
        [
          { label: 'Alimento', width: 0.36 },
          { label: 'Porcion', width: 0.16 },
          { label: 'Proteina (g)', width: 0.12, align: 'right' },
          { label: 'Carbohidratos (g)', width: 0.14, align: 'right' },
          { label: 'Grasa (g)', width: 0.1, align: 'right' },
          { label: 'kcal', width: 0.12, align: 'right' },
        ],
        items.map((i) => [i.name, i.portion, fmtNum(i.protein_g), fmtNum(i.carbs_g), fmtNum(i.fat_g), fmtNum(kcal(i), 0)]),
        { empty: 'Sin alimentos asignados.' },
      );
    }
    const t = plan.items.reduce((s, i) => ({ p: s.p + i.protein_g, c: s.c + i.carbs_g, g: s.g + i.fat_g }), { p: 0, c: 0, g: 0 });
    r.section('Total del dia');
    r.keyValues([
      ['Energia', `${fmtNum(t.p * 4 + t.c * 4 + t.g * 9, 0)} kcal`],
      ['Proteina / Carbohidratos / Grasa', `${fmtNum(t.p)} g / ${fmtNum(t.c)} g / ${fmtNum(t.g)} g`],
    ]);
    return { sources: `plan v${plan.version}` };
  },

  async antropometria(r, { patient, audience }) {
    const ms = await MeasurementModel.listCurrent(patient.id);
    const fields = audience === 'terceros' ? FIELDS.filter(([k]) => ['weightKg', 'heightCm', 'waistCm'].includes(k)) : FIELDS;
    r.section('Mediciones registradas');
    r.table(
      [
        { label: 'Fecha', width: 0.2 },
        { label: 'Metodo', width: 0.2 },
        ...fields.map(([, l, u]) => ({ label: `${l} (${u})`, width: 0.6 / fields.length, align: 'right' })),
      ],
      ms.map((m) => [fmtDate(m.takenAt), m.method, ...fields.map(([k]) => fmtNum(m.values?.[k] ?? null))]),
    );
    r.paragraph('"—" indica que el dato no se midio en esa fecha; no se estiman valores faltantes.', { muted: true });
    return { sources: `${ms.length} mediciones vigentes` };
  },

  async evolucion(r, { patient }) {
    const ms = await MeasurementModel.listCurrent(patient.id);
    const series = (k) => ms.filter((m) => Number.isFinite(m.values?.[k])).map((m) => ({ date: m.takenAt, value: m.values[k] }));
    for (const [k, label, unit] of [
      ['weightKg', 'Peso', 'kg'],
      ['waistCm', 'Cintura', 'cm'],
    ]) {
      const s = series(k);
      r.section(`Evolucion: ${label}`);
      if (s.length) {
        const first = s[0];
        const last = s.at(-1);
        r.keyValues([
          ['Primera medicion', `${fmtNum(first.value)} ${unit} (${fmtDate(first.date)})`],
          ['Ultima medicion', `${fmtNum(last.value)} ${unit} (${fmtDate(last.date)})`],
          [
            'Cambio',
            `${last.value - first.value > 0 ? '+' : ''}${fmtNum(last.value - first.value)} ${unit} (${fmtNum(((last.value - first.value) / first.value) * 100)} %)`,
          ],
        ]);
      }
      r.lineChart(s, { label, unit });
    }
    if (patient.target_weight_kg) r.keyValues([['Peso objetivo (prescrito)', `${fmtNum(patient.target_weight_kg)} kg`]]);
    return { sources: `${ms.length} mediciones vigentes` };
  },

  async objetivos(r, { patient, audience }) {
    const goals = await GoalModel.listByPatient(patient.id);
    r.section('Objetivos');
    r.table(
      [
        { label: 'Objetivo', width: 0.32 },
        { label: 'Indicador', width: 0.2 },
        { label: 'Periodo', width: 0.2 },
        { label: 'Estado', width: 0.28 },
      ],
      goals.map((g) => [
        g.description,
        g.indicator ? `${g.indicator.formula}: ${g.indicator.targetValue} ${g.indicator.unit}` : '—',
        [g.periodStart && `desde ${g.periodStart}`, g.targetDate && `meta ${g.targetDate}`].filter(Boolean).join(', ') || '—',
        `${g.status}${g.statusHistory?.length ? ` (actualizado ${fmtDate(g.statusHistory.at(-1).at)})` : ''}`,
      ]),
      { empty: 'Sin objetivos registrados.' },
    );
    if (audience !== 'terceros') {
      const linked = goals.filter((g) => g.diagnosisId).length;
      r.paragraph(`${linked} de ${goals.length} objetivos estan vinculados a un diagnostico nutricional.`, { muted: true });
    }
    return { sources: `${goals.length} objetivos` };
  },
};

// --------------------------------------------------------------- generacion y registro
// Para terceros solo se identifica al paciente con nombre y edad (sin fecha de nacimiento, expediente,
// sexo ni datos de contacto).
export function identificationLines(patient, audience) {
  if (audience === 'terceros') {
    return [
      ['Paciente', patient.full_name],
      ['Edad', `${ageFrom(patient.birth_date)} anos`],
    ];
  }
  return [
    ['Paciente', patient.full_name],
    ['Expediente', recordNumber(patient.id)],
    ['Edad / sexo', `${ageFrom(patient.birth_date)} anos / ${SEX[patient.sex] ?? patient.sex}`],
    ['Profesional responsable', patient.nutritionist_name ?? '—'],
  ];
}

export const ReportsBusiness = {
  async generate(actor, patientId, { type, audience, noteId }, ctx) {
    const def = REPORT_TYPES[type];
    if (audience === 'terceros' && !def.thirdParty) {
      throw new AppError(400, 'Este reporte contiene informacion clinica y solo puede generarse para uso clinico');
    }
    const patient = await getAccessible(actor, patientId);
    const author = await UserModel.findById(actor.id);
    const version = await DocumentModel.nextVersion(patientId, type);
    const now = new Date();
    const ln = recordNumber(patientId);

    const patientLines = identificationLines(patient, audience);
    const r = createReport({
      title: def.title,
      audience,
      audienceLabel:
        audience === 'terceros'
          ? 'PARA TERCEROS: datos minimos, sin informacion clinica adicional'
          : 'USO CLINICO: informacion confidencial',
      patientLines,
      docLines: [
        ['Documento', `${def.title} v${version}`],
        ['Generado', fmtDateTime(now)],
        ['Generado por', author?.full_name ?? `usuario ${actor.id}`],
        ...(audience === 'terceros' ? [['Profesional responsable', patient.nutritionist_name ?? '—']] : []),
      ],
    });
    const result = await BUILDERS[type](r, { patient, audience, noteId });
    r.section('Origen de los datos');
    r.paragraph(`Registros vigentes al ${fmtDateTime(now)}: ${result.sources}.`, { muted: true });
    const pdf = await r.finish(
      `Bloome · ${def.title} v${version} · ${audience === 'terceros' ? 'para terceros' : 'confidencial, uso clinico'}${result.draft ? ' · BORRADOR' : ''}`,
    );

    let stored;
    try {
      stored = await DocumentModel.store(
        {
          patientId,
          kind: 'reporte',
          reportType: type,
          audience,
          version,
          title: `${def.title} v${version}`,
          filename: `${ln}_${type}_v${version}.pdf`,
          contentType: 'application/pdf',
          sourceSummary: result.sources,
          noteId: noteId ?? null,
          createdBy: actor.id,
        },
        pdf,
      );
    } catch (err) {
      if (isDuplicateKey(err)) throw new AppError(409, 'Otro documento del mismo tipo se genero al mismo tiempo; intenta de nuevo');
      throw err;
    }
    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: 'REPORT_GENERATED',
      details: `paciente=${patientId} tipo=${type} audiencia=${audience} version=${version}`,
    });
    return documentDto(stored);
  },
};

export function documentDto(d) {
  return {
    id: d._id.toString(),
    kind: d.kind,
    reportType: d.reportType ?? null,
    audience: d.audience ?? null,
    version: d.version ?? null,
    title: d.title,
    filename: d.filename,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    sha256: d.sha256,
    description: d.description ?? '',
    createdAt: d.createdAt,
    createdBy: d.createdBy,
    sharedWithPatient: Boolean(d.sharedWithPatient),
  };
}
