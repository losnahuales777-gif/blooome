import { randomUUID } from 'node:crypto';
import { collection } from '../config/database.js';
import { recordNumber } from '../business/chart.business.js';
import { getAccessible } from '../business/patients.business.js';
import { DiagnosisModel, HistoryModel } from '../models/chart.model.js';
import { GoalModel, LabModel, MeasurementModel } from '../models/clinical.model.js';
import { DocumentModel } from '../models/document.model.js';
import { MealPlanModel } from '../models/mealPlan.model.js';
import { AuditBusiness } from '../business/audit.business.js';

// Exportacion del expediente como Bundle HL7 FHIR R4 (tipo "collection"), de solo lectura.
// Es una PREPARACION para integraciones futuras: antes de intercambiar datos con otro sistema hay
// que validar el Bundle con un validador FHIR y acordar perfiles y terminologias con el receptor.
// - Mediciones con codigo LOINC y unidades UCUM; los datos sin codigo verificado van solo como texto.
// - No se exporta el texto de las notas SOAP (requiere definir el perfil de Composition).

const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const OBS_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

// Campo -> codigo LOINC y unidad UCUM. Masa muscular sin codigo verificado: solo texto.
const MEASURES = {
  weightKg: { loinc: '29463-7', display: 'Body weight', unit: 'kg' },
  heightCm: { loinc: '8302-2', display: 'Body height', unit: 'cm' },
  waistCm: { loinc: '8280-0', display: 'Waist Circumference at umbilicus by Tape measure', unit: 'cm' },
  hipCm: { loinc: '62409-8', display: 'Hip Circumference by Tape measure', unit: 'cm' },
  bodyFatPct: { loinc: '41982-0', display: 'Percentage of body fat Measured', unit: '%' },
  muscleMassKg: { loinc: null, display: 'Masa muscular', unit: 'kg' },
};

const iso = (d) => (d ? new Date(d).toISOString() : undefined);
const clean = (o) => JSON.parse(JSON.stringify(o));

export async function exportPatientBundle(actor, patientId, ctx) {
  const p = await getAccessible(actor, patientId);
  const [measurements, labs, history, diagnoses, goals, plan, appointments, consents, documents] = await Promise.all([
    MeasurementModel.listCurrent(patientId),
    LabModel.listByPatient(patientId),
    HistoryModel.listCurrent(patientId),
    DiagnosisModel.listByPatient(patientId),
    GoalModel.listByPatient(patientId),
    MealPlanModel.findByPatient(patientId),
    collection('citas')
      .find({ patientId: { $eq: patientId } })
      .sort({ scheduledAt: 1 })
      .limit(500)
      .toArray(),
    collection('consentimientos')
      .find({ patientId: { $eq: patientId } })
      .sort({ recordedAt: -1 })
      .toArray(),
    DocumentModel.listByPatient(patientId),
  ]);

  const entries = [];
  const add = (resource) => {
    const fullUrl = `urn:uuid:${randomUUID()}`;
    entries.push({ fullUrl, resource: clean({ ...resource, meta: { source: 'urn:lanutria' } }) });
    return fullUrl;
  };

  const patientRef = add({
    resourceType: 'Patient',
    identifier: [{ system: 'urn:lanutria:expediente', value: recordNumber(p.id) }],
    active: p.record_status === 'activo',
    name: [{ text: p.full_name }],
    gender: p.sex === 'F' ? 'female' : p.sex === 'M' ? 'male' : 'unknown',
    birthDate: p.birth_date,
    telecom: [
      p.phone && { system: 'phone', value: p.phone },
      p.identification?.email && { system: 'email', value: p.identification.email },
    ].filter(Boolean),
  });
  const subject = { reference: patientRef };

  for (const m of measurements) {
    for (const [field, def] of Object.entries(MEASURES)) {
      const v = m.values?.[field];
      if (!Number.isFinite(v)) continue;
      add({
        resourceType: 'Observation',
        status: m.supersedes ? 'amended' : 'final',
        category: [{ coding: [{ system: OBS_CATEGORY, code: 'vital-signs' }] }],
        code: def.loinc ? { coding: [{ system: LOINC, code: def.loinc, display: def.display }], text: def.display } : { text: def.display },
        subject,
        effectiveDateTime: iso(m.takenAt),
        valueQuantity: { value: v, unit: def.unit, system: UCUM, code: def.unit },
        method: m.method ? { text: m.method } : undefined,
      });
    }
  }

  for (const l of labs) {
    add({
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: OBS_CATEGORY, code: 'laboratory' }] }],
      code: { text: l.analyte },
      subject,
      effectiveDateTime: iso(l.takenAt),
      valueQuantity: { value: l.value, unit: l.unit },
      referenceRange: l.referenceRange ? [{ text: l.referenceRange }] : undefined,
      performer: l.laboratory ? [{ display: l.laboratory }] : undefined,
    });
  }

  const catalogCode = (h) =>
    h.catalog
      ? { coding: [{ system: `urn:lanutria:catalogo:${h.catalog.source}`, version: h.catalog.version, code: h.catalog.code }] }
      : {};
  const clinical = (s) => ({
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
        code: s === 'activo' ? 'active' : s === 'resuelto' ? 'resolved' : 'inactive',
      },
    ],
  });
  for (const h of history) {
    if (h.category === 'alergia') {
      add({
        resourceType: 'AllergyIntolerance',
        clinicalStatus: clinical(h.status),
        code: { ...catalogCode(h), text: h.description },
        patient: subject,
        recordedDate: iso(h.recordedAt),
        note: h.notes ? [{ text: h.notes }] : undefined,
      });
    } else if (h.category === 'medicamento' || h.category === 'suplemento') {
      add({
        resourceType: 'MedicationStatement',
        status: h.status === 'activo' ? 'active' : h.status === 'suspendido' ? 'stopped' : 'completed',
        medicationCodeableConcept: { ...catalogCode(h), text: h.description },
        subject,
        dateAsserted: iso(h.recordedAt),
        dosage: h.dose || h.frequency ? [{ text: [h.dose, h.frequency].filter(Boolean).join(', ') }] : undefined,
      });
    } else if (h.category === 'enfermedad') {
      add({
        resourceType: 'Condition',
        clinicalStatus: {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: h.status === 'activo' ? 'active' : 'resolved' },
          ],
        },
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: 'problem-list-item' }] }],
        code: { ...catalogCode(h), text: h.description },
        subject,
        recordedDate: iso(h.recordedAt),
      });
    }
  }

  for (const d of diagnoses) {
    add({
      resourceType: 'Condition',
      clinicalStatus: {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: d.status === 'activo' ? 'active' : 'resolved' },
        ],
      },
      category: [{ text: 'Diagnostico nutricional (PES)' }],
      code: d.code
        ? {
            coding: [{ system: d.catalog ? `urn:lanutria:catalogo:${d.catalog.source}` : 'urn:lanutria:codigo', code: d.code }],
            text: d.problem,
          }
        : { text: d.problem },
      subject,
      recordedDate: iso(d.recordedAt),
      note: [{ text: `Etiologia: ${d.etiology}. Signos: ${d.signs}.` }],
    });
  }

  const goalStatus = {
    pendiente: ['active', 'in-progress'],
    cumplido: ['completed', 'achieved'],
    no_cumplido: ['cancelled', 'not-achieved'],
  };
  for (const g of goals) {
    const [lifecycle, achievement] = goalStatus[g.status] ?? ['proposed', undefined];
    add({
      resourceType: 'Goal',
      lifecycleStatus: lifecycle,
      achievementStatus: achievement
        ? { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/goal-achievement', code: achievement }] }
        : undefined,
      description: { text: g.description },
      subject,
      startDate: g.periodStart ?? undefined,
      target:
        g.indicator || g.targetDate
          ? [
              {
                measure: g.indicator ? { text: g.indicator.formula } : undefined,
                detailQuantity: g.indicator ? { value: g.indicator.targetValue, unit: g.indicator.unit } : undefined,
                dueDate: g.targetDate ?? undefined,
              },
            ]
          : undefined,
    });
  }

  if (plan.version) {
    add({
      resourceType: 'NutritionOrder',
      status: 'active',
      intent: 'plan',
      patient: subject,
      dateTime: iso(plan.updatedAt),
      oralDiet: {
        type: [{ text: `Plan alimenticio v${plan.version}` }],
        instruction: plan.items.map((i) => `${i.meal}: ${i.name} (${i.portion})`).join('; '),
      },
    });
  }

  const encStatus = { realizada: 'finished', cancelada: 'cancelled', programada: 'planned' };
  for (const a of appointments) {
    add({
      resourceType: 'Encounter',
      status: encStatus[a.status] ?? 'unknown',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
      subject,
      period: { start: iso(a.completedAt ?? a.scheduledAt) },
    });
  }

  const consentStatus = { otorgado: 'active', revocado: 'inactive', negado: 'rejected' };
  for (const c of consents) {
    add({
      resourceType: 'Consent',
      status: consentStatus[c.status] ?? 'proposed',
      scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }] },
      category: [{ coding: [{ system: LOINC, code: '59284-0', display: 'Patient Consent' }], text: c.type }],
      patient: subject,
      dateTime: iso(c.recordedAt),
      policyRule: { text: `Aviso de privacidad ${c.noticeVersion}` },
    });
  }

  for (const d of documents) {
    add({
      resourceType: 'DocumentReference',
      status: 'current',
      identifier: [{ system: 'urn:lanutria:sha256', value: d.sha256 }],
      type: { text: d.kind === 'reporte' ? d.title : 'Documento adjunto' },
      subject,
      date: iso(d.createdAt),
      description: d.description || d.title,
      content: [
        {
          attachment: {
            contentType: d.contentType,
            title: d.filename,
            size: d.sizeBytes,
            url: `/api/patients/${patientId}/documents/${d._id}/file`,
          },
        },
      ],
    });
  }

  await AuditBusiness.record({
    ...ctx,
    userId: actor.id,
    event: 'FHIR_EXPORTED',
    details: `paciente=${patientId} recursos=${entries.length}`,
  });
  return { resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(), entry: entries };
}
