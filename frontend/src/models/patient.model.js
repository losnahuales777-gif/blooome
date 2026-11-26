import {
  ACTIVITY_FACTORS,
  bmi as calcBmi,
  energyTarget,
  restingEnergyMifflin,
  totalEnergyExpenditure,
} from '@calc';

// Capa MODEL: reglas clinicas del paciente. La consulta solo atiende adultos de 18 a 60 anos.
export const AGE_RANGE = Object.freeze({ min: 18, max: 60 });

export const SEXES = Object.freeze([
  { code: 'F', label: 'Femenino' },
  { code: 'M', label: 'Masculino' },
]);

export const ACTIVITY_LEVELS = Object.freeze([
  { code: 'sedentaria', label: 'Sedentaria', factor: 1.2 },
  { code: 'ligera', label: 'Ligera (1-3 dias/semana)', factor: 1.375 },
  { code: 'moderada', label: 'Moderada (3-5 dias/semana)', factor: 1.55 },
  { code: 'alta', label: 'Alta (6-7 dias/semana)', factor: 1.725 },
]);

export const GOALS = Object.freeze([
  { code: 'perder', label: 'Bajar de peso', kcalDelta: -500 },
  { code: 'mantener', label: 'Mantener peso', kcalDelta: 0 },
  { code: 'ganar', label: 'Ganar masa muscular', kcalDelta: 300 },
]);

// Clasificacion de IMC de la OMS. color y shape codifican la categoria en las graficas;
// la etiqueta siempre acompana para no depender solo del color.
export const BMI_CATEGORIES = Object.freeze([
  { code: 'bajo', label: 'Bajo peso', max: 18.5, color: 'var(--chart-1)', shape: 'triangle' },
  { code: 'normal', label: 'Normal', max: 25, color: 'var(--chart-2)', shape: 'circle' },
  { code: 'sobrepeso', label: 'Sobrepeso', max: 30, color: 'var(--chart-3)', shape: 'square' },
  { code: 'obesidad', label: 'Obesidad', max: Infinity, color: 'var(--chart-4)', shape: 'diamond' },
]);

export function ageFrom(birthDate, today = new Date()) {
  const birth = new Date(`${birthDate}T00:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isInAgeRange(age) {
  return Number.isInteger(age) && age >= AGE_RANGE.min && age <= AGE_RANGE.max;
}

const toIsoDate = (d) => d.toISOString().slice(0, 10);

// Limites para el campo de fecha: quien hoy cumple 18 hasta quien tiene 60 y casi 61.
export function birthDateBounds(today = new Date()) {
  const max = new Date(today.getFullYear() - AGE_RANGE.min, today.getMonth(), today.getDate());
  const min = new Date(today.getFullYear() - AGE_RANGE.max - 1, today.getMonth(), today.getDate() + 1);
  return { min: toIsoDate(min), max: toIsoDate(max) };
}

// Las formulas viven en el motor de calculos compartido (/calculations); aqui solo se adaptan a la
// interfaz. Un dato fuera de rango devuelve null en lugar de romper la pantalla.
const valueOf = (fn, args) => {
  try {
    return fn(args).value;
  } catch {
    return null;
  }
};

export function bmi(weightKg, heightCm) {
  return valueOf(calcBmi, { weightKg: Number(weightKg), heightCm: Number(heightCm) });
}

export function bmiCategory(value) {
  return Number.isFinite(value) ? BMI_CATEGORIES.find((c) => value < c.max) : null;
}

// Objetivo energetico de partida: Mifflin-St Jeor x factor de actividad + ajuste por objetivo.
export function dailyEnergyTarget({ sex, weightKg, heightCm, birthDate, activity, goal }) {
  const restingKcal = valueOf(restingEnergyMifflin, { weightKg, heightCm, ageYears: ageFrom(birthDate), sex });
  const expenditureKcal = valueOf(totalEnergyExpenditure, { restingKcal, activityFactor: ACTIVITY_FACTORS[activity] ?? null });
  return valueOf(energyTarget, { expenditureKcal, goal });
}

// Agrega datos derivados que usan las pantallas.
export function describePatient(p) {
  const age = ageFrom(p.birthDate);
  const bmiValue = bmi(p.weightKg, p.heightCm);
  return { ...p, age, bmi: bmiValue, bmiCategory: bmiCategory(bmiValue), kcalTarget: dailyEnergyTarget(p) };
}

export const EMPTY_PATIENT = Object.freeze({
  fullName: '',
  birthDate: '',
  sex: 'F',
  weightKg: '',
  heightCm: '',
  waistCm: '',
  activity: 'ligera',
  goal: 'mantener',
  phone: '',
  notes: '',
  nextVisit: '',
  targetWeightKg: '',
  proteinGPerKg: '',
  isActive: true,
});

// <input type="datetime-local"> trabaja en hora local sin zona; la API usa ISO en UTC.
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function localInputToIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function validateNextVisit(value, errors) {
  if (value && new Date(value).getTime() < Date.now()) errors.nextVisit = 'Elige una fecha y hora futuras';
}

// Al editar no se validan medidas: el peso, la estatura y la cintura se registran como medicion.
export function validatePatient(form, { withMeasures = true } = {}) {
  const errors = {};
  if (form.fullName.trim().length < 3) errors.fullName = 'Escribe nombre y apellido';

  if (!form.birthDate) {
    errors.birthDate = 'Indica la fecha de nacimiento';
  } else if (!isInAgeRange(ageFrom(form.birthDate))) {
    errors.birthDate = `Solo se atienden pacientes de ${AGE_RANGE.min} a ${AGE_RANGE.max} anos`;
  }

  if (withMeasures) {
    const weight = Number(form.weightKg);
    if (!(weight >= 30 && weight <= 250)) errors.weightKg = 'Peso entre 30 y 250 kg';

    const height = Number(form.heightCm);
    if (!(height >= 130 && height <= 220)) errors.heightCm = 'Estatura entre 130 y 220 cm';

    if (form.waistCm !== '' && !(Number(form.waistCm) >= 50 && Number(form.waistCm) <= 200)) {
      errors.waistCm = 'Cintura entre 50 y 200 cm';
    }
  }
  if (form.phone && !/^[0-9 +()-]{7,20}$/.test(form.phone)) errors.phone = 'Telefono invalido';
  if (form.targetWeightKg !== '' && !(Number(form.targetWeightKg) >= 30 && Number(form.targetWeightKg) <= 250)) {
    errors.targetWeightKg = 'Peso objetivo entre 30 y 250 kg';
  }
  if (form.proteinGPerKg !== '' && !(Number(form.proteinGPerKg) >= 0.3 && Number(form.proteinGPerKg) <= 3.5)) {
    errors.proteinGPerKg = 'Entre 0.3 y 3.5 g/kg';
  }
  return errors;
}

// Solo se exige fecha futura al crear: al editar, la cita guardada puede haber pasado ya.
export function validateNewPatient(form) {
  const errors = validatePatient(form);
  validateNextVisit(form.nextVisit, errors);
  return errors;
}

// La edicion no envia medidas (la API las rechaza): se capturan como medicion nueva.
export function toPatientUpdatePayload(form) {
  const { weightKg, heightCm, waistCm, ...rest } = toPatientPayload({ ...form, weightKg: 0, heightCm: 0, waistCm: '' });
  return rest;
}

export function toPatientPayload(form) {
  return {
    ...form,
    fullName: form.fullName.trim(),
    phone: form.phone.trim(),
    notes: form.notes.trim(),
    weightKg: Number(form.weightKg),
    heightCm: Number(form.heightCm),
    waistCm: form.waistCm === '' ? null : Number(form.waistCm),
    nextVisit: localInputToIso(form.nextVisit),
    targetWeightKg: form.targetWeightKg === '' ? null : Number(form.targetWeightKg),
    proteinGPerKg: form.proteinGPerKg === '' ? null : Number(form.proteinGPerKg),
    isActive: form.isActive !== false,
  };
}

export function patientToForm(patient) {
  if (!patient) return { ...EMPTY_PATIENT };
  return {
    ...Object.fromEntries(Object.keys(EMPTY_PATIENT).map((k) => [k, patient[k] ?? ''])),
    nextVisit: isoToLocalInput(patient.nextVisit),
    isActive: patient.isActive !== false,
  };
}

// Consulta atendida: nuevas mediciones y siguiente cita.
export function visitToForm(patient) {
  return { weightKg: String(patient.weightKg), waistCm: patient.waistCm ? String(patient.waistCm) : '', nextVisit: '' };
}

export function validateVisit(form) {
  const errors = {};
  const weight = Number(form.weightKg);
  if (!(weight >= 30 && weight <= 250)) errors.weightKg = 'Peso entre 30 y 250 kg';
  if (form.waistCm !== '' && !(Number(form.waistCm) >= 50 && Number(form.waistCm) <= 200)) {
    errors.waistCm = 'Cintura entre 50 y 200 cm';
  }
  validateNextVisit(form.nextVisit, errors);
  return errors;
}

export function toVisitPayload(form) {
  return {
    weightKg: Number(form.weightKg),
    waistCm: form.waistCm === '' ? null : Number(form.waistCm),
    nextVisit: localInputToIso(form.nextVisit),
  };
}
