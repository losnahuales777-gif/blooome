// Nucleo comun del motor de calculos.
//
// Cada formula devuelve un "resultado" con la misma forma, para que la interfaz y la base de datos
// sepan siempre de donde sale un numero:
//   {
//     formula:   id estable de la formula (p. ej. 'imc')
//     version:   version de la formula usada (se guarda con cada evaluacion)
//     kind:      'calculado' (derivado de forma exacta de datos medidos)
//              | 'estimado'  (ecuacion predictiva; orientativo)
//              | 'prescrito' (derivado de una indicacion del profesional)
//     value:     numero redondeado, o null si faltan datos
//     unit:      unidad del valor
//     missing:   campos que faltaron (vacio si se pudo calcular)
//     note:      restriccion de aplicacion o aclaracion clinica
//   }
// Faltantes (null/undefined/'') => value null + missing. Datos invalidos (tipo o rango) => CalculationError.
// Nunca se inventan ni imputan datos.

export const KIND = Object.freeze({ CALCULATED: 'calculado', ESTIMATED: 'estimado', PRESCRIBED: 'prescrito' });

export class CalculationError extends Error {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.name = 'CalculationError';
    this.field = field;
  }
}

export const isMissing = (v) => v === null || v === undefined || v === '';

// Limites fisiologicos de entrada (adultos). Fuera de rango = error, no un valor "corregido".
export const LIMITS = Object.freeze({
  weightKg: [20, 400],
  heightCm: [100, 250],
  waistCm: [40, 250],
  hipCm: [50, 250],
  bodyFatPct: [2, 75],
  ageYears: [18, 120],
  activityFactor: [1, 2.5],
  kcal: [0, 15000],
  percent: [0, 100],
  gPerKg: [0.3, 3.5],
  mlPerKg: [20, 60],
});

export function checkNumber(field, value, [min, max] = [-Infinity, Infinity]) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new CalculationError(field, 'debe ser un numero');
  if (value < min || value > max) throw new CalculationError(field, `fuera de rango (${min} a ${max})`);
  return value;
}

export function round(value, decimals) {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

// Construye el resultado. compute() solo se ejecuta si no falta ningun dato.
export function evaluate(meta, inputs, compute) {
  const missing = Object.entries(inputs)
    .filter(([, v]) => isMissing(v))
    .map(([k]) => k);
  const base = { formula: meta.id, version: meta.version, kind: meta.kind, unit: meta.unit, note: meta.note ?? null };
  if (missing.length > 0) return { ...base, value: null, missing };
  return { ...base, value: compute(inputs), missing: [] };
}
