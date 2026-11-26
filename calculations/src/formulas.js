import { checkNumber, evaluate, KIND, LIMITS, round } from './core.js';

// Catalogo de formulas: id estable, version, tipo de dato que produce y referencia tecnica.
// Si una formula cambia, se sube su version: las evaluaciones guardadas conservan la version usada.
export const FORMULAS = Object.freeze({
  imc: { id: 'imc', version: '1.0.0', kind: KIND.CALCULATED, unit: 'kg/m2', reference: 'OMS. Obesity: preventing and managing the global epidemic. TRS 894, 2000.', note: 'No valido en embarazo ni en deportistas con alta masa muscular.' },
  tmrMifflin: { id: 'tmr_mifflin_st_jeor', version: '1.0.0', kind: KIND.ESTIMATED, unit: 'kcal/dia', reference: 'Mifflin MD, St Jeor ST, et al. Am J Clin Nutr. 1990;51(2):241-247.', note: 'Ecuacion predictiva para adultos; orientativa.' },
  get: { id: 'gasto_energetico_total', version: '1.0.0', kind: KIND.ESTIMATED, unit: 'kcal/dia', reference: 'FAO/OMS/UNU. Human energy requirements. 2004 (TMR x factor de actividad).', note: 'Estimacion; el factor de actividad lo define el profesional.' },
  energyTarget: { id: 'objetivo_energetico', version: '1.0.0', kind: KIND.PRESCRIBED, unit: 'kcal/dia', reference: 'GET + ajuste por objetivo (-500 kcal bajar de peso, 0 mantener, +300 ganar masa muscular).', note: 'Punto de partida; el profesional puede ajustarlo.' },
  balance: { id: 'balance_energetico', version: '1.0.0', kind: KIND.CALCULATED, unit: 'kcal/dia', reference: 'Balance = ingesta - gasto energetico.', note: 'Positivo: superavit. Negativo: deficit.' },
  weightChange: { id: 'cambio_peso_pct', version: '1.0.0', kind: KIND.CALCULATED, unit: '%', reference: 'Blackburn GL, et al. JPEN. 1977;1(1):11-22.' },
  waistHip: { id: 'indice_cintura_cadera', version: '1.0.0', kind: KIND.CALCULATED, unit: 'razon', reference: 'OMS. Waist circumference and waist-hip ratio: report of a WHO expert consultation. 2008.' },
  waistHeight: { id: 'indice_cintura_estatura', version: '1.0.0', kind: KIND.CALCULATED, unit: 'razon', reference: 'Ashwell M, Hsieh SD. Int J Food Sci Nutr. 2005;56(5):303-307.' },
  fatMass: { id: 'masa_grasa', version: '1.0.0', kind: KIND.CALCULATED, unit: 'kg', reference: 'Masa grasa = peso x %grasa / 100.', note: 'Depende del metodo con que se midio el % de grasa.' },
  fatFreeMass: { id: 'masa_libre_grasa', version: '1.0.0', kind: KIND.CALCULATED, unit: 'kg', reference: 'Masa libre de grasa = peso - masa grasa.' },
  macros: { id: 'distribucion_macronutrientes', version: '1.0.0', kind: KIND.PRESCRIBED, unit: 'g/dia', reference: 'Factores de Atwater: 4 kcal/g proteinas y carbohidratos, 9 kcal/g grasas.' },
  protein: { id: 'requerimiento_proteico', version: '1.0.0', kind: KIND.PRESCRIBED, unit: 'g/dia', reference: 'IOM. Dietary Reference Intakes. 2005 (g/kg de peso; 0.8 g/kg referencia en adultos sanos).' },
  hydration: { id: 'hidratacion_orientativa', version: '1.0.0', kind: KIND.ESTIMATED, unit: 'ml/dia', reference: 'Regla practica 30-35 ml/kg; EFSA. Dietary reference values for water. 2010.', note: 'Orientativo; no considera clima, actividad ni condiciones clinicas.' },
  goalProgress: { id: 'progreso_peso_objetivo', version: '1.0.0', kind: KIND.CALCULATED, unit: '%', reference: '(peso inicial - actual) / (peso inicial - objetivo) x 100.' },
  goalCompliance: { id: 'cumplimiento_objetivos', version: '1.0.0', kind: KIND.CALCULATED, unit: '%', reference: 'Objetivos cumplidos / objetivos establecidos x 100.' },
  adherence: { id: 'adherencia_plan', version: '1.0.0', kind: KIND.CALCULATED, unit: '%', reference: 'Comidas seguidas / comidas planificadas x 100, solo sobre dias registrados.' },
  avgIntake: { id: 'promedio_consumo_calorico', version: '1.0.0', kind: KIND.CALCULATED, unit: 'kcal/dia', reference: 'Media aritmetica de los dias con registro (sin imputar dias faltantes).' },
  variation: { id: 'variacion_periodica', version: '1.0.0', kind: KIND.CALCULATED, unit: 'segun indicador', reference: 'Diferencia entre el ultimo valor de cada periodo y el del periodo anterior con dato.' },
});

/** Indice de masa corporal: peso (kg) / estatura (m)^2. 1 decimal. */
export function bmi({ weightKg, heightCm }) {
  return evaluate(FORMULAS.imc, { weightKg, heightCm }, (i) => {
    const w = checkNumber('weightKg', i.weightKg, LIMITS.weightKg);
    const m = checkNumber('heightCm', i.heightCm, LIMITS.heightCm) / 100;
    return round(w / (m * m), 1);
  });
}

/** Tasa metabolica en reposo (Mifflin-St Jeor): 10P + 6.25E - 5A + 5 (hombre) / -161 (mujer). Entero. */
export function restingEnergyMifflin({ weightKg, heightCm, ageYears, sex }) {
  return evaluate(FORMULAS.tmrMifflin, { weightKg, heightCm, ageYears, sex }, (i) => {
    if (i.sex !== 'M' && i.sex !== 'F') throw new Error('sex: debe ser M o F');
    const w = checkNumber('weightKg', i.weightKg, LIMITS.weightKg);
    const h = checkNumber('heightCm', i.heightCm, LIMITS.heightCm);
    const a = checkNumber('ageYears', i.ageYears, LIMITS.ageYears);
    return Math.round(10 * w + 6.25 * h - 5 * a + (i.sex === 'M' ? 5 : -161));
  });
}

/** Gasto energetico total estimado: TMR x factor de actividad. Entero. */
export function totalEnergyExpenditure({ restingKcal, activityFactor }) {
  return evaluate(FORMULAS.get, { restingKcal, activityFactor }, (i) => {
    const r = checkNumber('restingKcal', i.restingKcal, LIMITS.kcal);
    const f = checkNumber('activityFactor', i.activityFactor, LIMITS.activityFactor);
    return Math.round(r * f);
  });
}

// Ajuste calorico por objetivo usado como prescripcion de partida.
export const GOAL_KCAL_DELTA = Object.freeze({ perder: -500, mantener: 0, ganar: 300 });

/** Objetivo energetico prescrito = GET + ajuste por objetivo. Redondeo a 10 kcal. */
export function energyTarget({ expenditureKcal, goal }) {
  return evaluate(FORMULAS.energyTarget, { expenditureKcal, goal }, (i) => {
    if (!(i.goal in GOAL_KCAL_DELTA)) throw new Error('goal: debe ser perder, mantener o ganar');
    const kcal = checkNumber('expenditureKcal', i.expenditureKcal, LIMITS.kcal) + GOAL_KCAL_DELTA[i.goal];
    return Math.round(kcal / 10) * 10;
  });
}

/** Balance energetico: ingesta - gasto. Entero. */
export function energyBalance({ intakeKcal, expenditureKcal }) {
  return evaluate(FORMULAS.balance, { intakeKcal, expenditureKcal }, (i) =>
    Math.round(checkNumber('intakeKcal', i.intakeKcal, LIMITS.kcal) - checkNumber('expenditureKcal', i.expenditureKcal, LIMITS.kcal)),
  );
}

/** Porcentaje de cambio de peso respecto al peso inicial. Negativo = perdida. 1 decimal. */
export function weightChangePercent({ initialKg, currentKg }) {
  return evaluate(FORMULAS.weightChange, { initialKg, currentKg }, (i) => {
    const a = checkNumber('initialKg', i.initialKg, LIMITS.weightKg);
    const b = checkNumber('currentKg', i.currentKg, LIMITS.weightKg);
    return round(((b - a) / a) * 100, 1);
  });
}

/** Indice cintura-cadera. 2 decimales. */
export function waistHipRatio({ waistCm, hipCm }) {
  return evaluate(FORMULAS.waistHip, { waistCm, hipCm }, (i) =>
    round(checkNumber('waistCm', i.waistCm, LIMITS.waistCm) / checkNumber('hipCm', i.hipCm, LIMITS.hipCm), 2),
  );
}

/** Indice cintura-estatura. 2 decimales. */
export function waistHeightRatio({ waistCm, heightCm }) {
  return evaluate(FORMULAS.waistHeight, { waistCm, heightCm }, (i) =>
    round(checkNumber('waistCm', i.waistCm, LIMITS.waistCm) / checkNumber('heightCm', i.heightCm, LIMITS.heightCm), 2),
  );
}

/** Masa grasa (kg) a partir del % de grasa medido. 1 decimal. */
export function fatMass({ weightKg, bodyFatPct }) {
  return evaluate(FORMULAS.fatMass, { weightKg, bodyFatPct }, (i) =>
    round((checkNumber('weightKg', i.weightKg, LIMITS.weightKg) * checkNumber('bodyFatPct', i.bodyFatPct, LIMITS.bodyFatPct)) / 100, 1),
  );
}

/** Masa libre de grasa (kg) = peso - masa grasa. 1 decimal. */
export function fatFreeMass({ weightKg, bodyFatPct }) {
  return evaluate(FORMULAS.fatFreeMass, { weightKg, bodyFatPct }, (i) => {
    const w = checkNumber('weightKg', i.weightKg, LIMITS.weightKg);
    return round(w - (w * checkNumber('bodyFatPct', i.bodyFatPct, LIMITS.bodyFatPct)) / 100, 1);
  });
}

const KCAL_PER_GRAM = Object.freeze({ protein: 4, carbs: 4, fat: 9 });

/**
 * Gramos de cada macronutriente para unas kcal y un reparto en % (debe sumar 100 +-1).
 * Devuelve value = { protein, carbs, fat } en g/dia (enteros).
 */
export function macroDistribution({ kcal, proteinPct, carbsPct, fatPct }) {
  return evaluate(FORMULAS.macros, { kcal, proteinPct, carbsPct, fatPct }, (i) => {
    const total = checkNumber('kcal', i.kcal, LIMITS.kcal);
    const pct = {
      protein: checkNumber('proteinPct', i.proteinPct, LIMITS.percent),
      carbs: checkNumber('carbsPct', i.carbsPct, LIMITS.percent),
      fat: checkNumber('fatPct', i.fatPct, LIMITS.percent),
    };
    const sum = pct.protein + pct.carbs + pct.fat;
    if (Math.abs(sum - 100) > 1) throw new Error(`reparto: los porcentajes suman ${sum}, deben sumar 100`);
    return Object.fromEntries(Object.entries(pct).map(([k, p]) => [k, Math.round((total * p) / 100 / KCAL_PER_GRAM[k])]));
  });
}

/** Requerimiento proteico (g/dia) = peso x g/kg prescritos. Entero. */
export function proteinRequirement({ weightKg, gPerKg }) {
  return evaluate(FORMULAS.protein, { weightKg, gPerKg }, (i) =>
    Math.round(checkNumber('weightKg', i.weightKg, LIMITS.weightKg) * checkNumber('gPerKg', i.gPerKg, LIMITS.gPerKg)),
  );
}

/** Hidratacion orientativa (ml/dia) = peso x ml/kg (35 por defecto). Redondeo a 50 ml. */
export function hydrationEstimate({ weightKg, mlPerKg = 35 }) {
  return evaluate(FORMULAS.hydration, { weightKg, mlPerKg }, (i) => {
    const ml = checkNumber('weightKg', i.weightKg, LIMITS.weightKg) * checkNumber('mlPerKg', i.mlPerKg, LIMITS.mlPerKg);
    return Math.round(ml / 50) * 50;
  });
}

/**
 * Progreso hacia el peso objetivo en %. 0 = sin avance, 100 = objetivo alcanzado. Puede ser negativo
 * (se alejo del objetivo) o mayor de 100 (lo supero): no se recorta, para no ocultar informacion.
 */
export function weightProgressToGoal({ initialKg, currentKg, targetKg }) {
  return evaluate(FORMULAS.goalProgress, { initialKg, currentKg, targetKg }, (i) => {
    const a = checkNumber('initialKg', i.initialKg, LIMITS.weightKg);
    const b = checkNumber('currentKg', i.currentKg, LIMITS.weightKg);
    const t = checkNumber('targetKg', i.targetKg, LIMITS.weightKg);
    if (a === t) throw new Error('targetKg: el objetivo es igual al peso inicial');
    return round(((a - b) / (a - t)) * 100, 1);
  });
}

function ratioPercent(meta, done, total, labels) {
  return evaluate(meta, { [labels[0]]: done, [labels[1]]: total }, (i) => {
    const d = checkNumber(labels[0], i[labels[0]], [0, Infinity]);
    const t = checkNumber(labels[1], i[labels[1]], [0, Infinity]);
    if (d > t) throw new Error(`${labels[0]}: no puede ser mayor que ${labels[1]}`);
    return t === 0 ? null : round((d / t) * 100, 1);
  });
}

/** Cumplimiento de objetivos (%) = cumplidos / establecidos. */
export function goalCompliance({ achieved, total }) {
  return ratioPercent(FORMULAS.goalCompliance, achieved, total, ['achieved', 'total']);
}

/** Adherencia al plan (%) = comidas seguidas / planificadas, sumadas sobre los dias registrados. */
export function planAdherence(days) {
  const valid = (days ?? []).filter((d) => d && Number.isFinite(d.mealsPlanned) && Number.isFinite(d.mealsFollowed));
  const followed = valid.reduce((s, d) => s + d.mealsFollowed, 0);
  const planned = valid.reduce((s, d) => s + d.mealsPlanned, 0);
  const result = ratioPercent(FORMULAS.adherence, valid.length ? followed : null, valid.length ? planned : null, ['mealsFollowed', 'mealsPlanned']);
  return { ...result, daysCounted: valid.length };
}

/** Promedio de consumo calorico (kcal/dia) sobre los dias con registro. Entero. */
export function averageCaloricIntake(days) {
  const values = (days ?? []).map((d) => d?.kcal).filter((v) => Number.isFinite(v));
  const result = evaluate(FORMULAS.avgIntake, { registros: values.length ? values : null }, (i) => {
    i.registros.forEach((v) => checkNumber('kcal', v, LIMITS.kcal));
    return Math.round(i.registros.reduce((s, v) => s + v, 0) / i.registros.length);
  });
  return { ...result, daysCounted: values.length };
}

// Clave del periodo: semana ISO ('2026-W45') o mes ('2026-11'), en UTC.
export function periodKey(date, period) {
  const d = new Date(date);
  if (period === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Variacion semanal o mensual de un indicador. points = [{ date, value }].
 * Toma el ultimo valor de cada periodo y lo compara con el del periodo anterior que tenga dato.
 * Devuelve [{ period, value, change }] (change null en el primer periodo). Sin interpolar huecos.
 */
export function periodVariation(points, period = 'week', decimals = 1) {
  if (period !== 'week' && period !== 'month') throw new Error("period: debe ser 'week' o 'month'");
  const last = new Map();
  [...(points ?? [])]
    .filter((p) => p && Number.isFinite(p.value) && !Number.isNaN(new Date(p.date).getTime()))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((p) => last.set(periodKey(p.date, period), p.value));
  let previous = null;
  return [...last.entries()].map(([key, value]) => {
    const row = { period: key, value, change: previous === null ? null : round(value - previous, decimals) };
    previous = value;
    return row;
  });
}

/** Edad cumplida en anos a una fecha dada ('AAAA-MM-DD'). */
export function ageFromBirthDate(birthDate, at = new Date()) {
  const [y, m, d] = String(birthDate).split('-').map(Number);
  if (!y || !m || !d) throw new Error('birthDate: formato AAAA-MM-DD');
  // Una fecha sin hora se interpreta como dia local (new Date('AAAA-MM-DD') seria UTC y en America
  // caeria en el dia anterior).
  const ref = typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at) ? new Date(`${at}T00:00:00`) : new Date(at);
  let age = ref.getFullYear() - y;
  if (ref.getMonth() + 1 < m || (ref.getMonth() + 1 === m && ref.getDate() < d)) age -= 1;
  return age;
}

// Factores de actividad (FAO/OMS/UNU 2004) asociados a las opciones de la aplicacion.
export const ACTIVITY_FACTORS = Object.freeze({ sedentaria: 1.2, ligera: 1.375, moderada: 1.55, alta: 1.725 });
