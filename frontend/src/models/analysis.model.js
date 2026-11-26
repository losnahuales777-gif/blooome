// Capa MODEL del analisis: periodos, etiquetas y validaciones de formularios.

// Periodos del filtro. "dias" null = periodo personalizado.
export const RANGE_PRESETS = Object.freeze([
  { code: 'semana', label: 'Semana', days: 7 },
  { code: 'mes', label: 'Mes', days: 30 },
  { code: 'trimestre', label: '3 meses', days: 91 },
  { code: 'semestre', label: '6 meses', days: 183 },
  { code: 'anio', label: 'Ano', days: 365 },
  { code: 'personalizado', label: 'Personalizado', days: null },
]);

export const toDay = (d) => {
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Inicio y fin del dia en la hora local del usuario, como fecha-hora ISO con zona: asi una consulta
// registrada en la noche (ya otro dia en UTC) cae en el dia correcto.
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
const fromInput = (v) => new Date(`${v}T00:00:00`);

export function rangeFromPreset(code, custom = {}) {
  const preset = RANGE_PRESETS.find((p) => p.code === code);
  if (!preset?.days) {
    return {
      from: custom.from ? startOfDay(fromInput(custom.from)) : undefined,
      to: custom.to ? endOfDay(fromInput(custom.to)) : undefined,
    };
  }
  const today = new Date();
  return { from: startOfDay(new Date(today.getTime() - preset.days * 86400000)), to: endOfDay(today) };
}

// Origen del dato, siempre visible junto a cada cifra.
export const KINDS = Object.freeze({
  medido: { label: 'Medido', className: 'bg-chart-2/15 text-ink' },
  calculado: { label: 'Calculado', className: 'bg-tint-strong text-ink' },
  estimado: { label: 'Estimado', className: 'bg-chart-3/15 text-ink' },
  prescrito: { label: 'Prescrito', className: 'bg-chart-1/15 text-ink' },
  registrado: { label: 'Registrado', className: 'bg-tint-strong text-ink' },
  ajustado: { label: 'Ajustado', className: 'bg-chart-4/15 text-ink' },
});

export const APPOINTMENT_STATUS = Object.freeze({
  programada: 'Programada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
});

export const GOAL_STATUS = Object.freeze({
  pendiente: 'Pendiente',
  cumplido: 'Cumplido',
  no_cumplido: 'No cumplido',
});

export const MEASUREMENT_FIELDS = Object.freeze([
  { key: 'weightKg', label: 'Peso', unit: 'kg', min: 20, max: 400, step: '0.1' },
  { key: 'heightCm', label: 'Estatura', unit: 'cm', min: 100, max: 250, step: '0.1' },
  { key: 'waistCm', label: 'Cintura', unit: 'cm', min: 40, max: 250, step: '0.1' },
  { key: 'hipCm', label: 'Cadera', unit: 'cm', min: 50, max: 250, step: '0.1' },
  { key: 'bodyFatPct', label: 'Grasa corporal', unit: '%', min: 2, max: 75, step: '0.1' },
  { key: 'muscleMassKg', label: 'Masa muscular', unit: 'kg', min: 5, max: 150, step: '0.1' },
]);

export const MEASUREMENT_METHODS = Object.freeze(['bascula y cinta metrica', 'bioimpedancia', 'pliegues cutaneos', 'DEXA', 'otro']);

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// Convierte un formulario de numeros en texto a numeros o null; valida rangos.
export function parseNumbers(form, fields) {
  const values = {};
  const errors = {};
  for (const f of fields) {
    const v = num(form[f.key]);
    if (v !== null && !(Number.isFinite(v) && v >= f.min && v <= f.max)) errors[f.key] = `Entre ${f.min} y ${f.max} ${f.unit}`;
    values[f.key] = v;
  }
  return { values, errors };
}

export const INTAKE_FIELDS = Object.freeze([
  { key: 'kcal', label: 'Energia', unit: 'kcal', min: 0, max: 15000, step: '1' },
  { key: 'proteinG', label: 'Proteinas', unit: 'g', min: 0, max: 1000, step: '1' },
  { key: 'carbsG', label: 'Carbohidratos', unit: 'g', min: 0, max: 2000, step: '1' },
  { key: 'fatG', label: 'Grasas', unit: 'g', min: 0, max: 1000, step: '1' },
  { key: 'waterMl', label: 'Agua', unit: 'ml', min: 0, max: 15000, step: '50' },
  { key: 'activityMinutes', label: 'Actividad fisica', unit: 'min', min: 0, max: 1440, step: '5' },
  { key: 'mealsPlanned', label: 'Comidas planificadas', unit: '', min: 0, max: 12, step: '1' },
  { key: 'mealsFollowed', label: 'Comidas seguidas', unit: '', min: 0, max: 12, step: '1' },
]);

export const fmt = {
  date: (d) => (d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
  shortDate: (d) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }),
  dateTime: (d) => (d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—'),
  month: (m) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
  },
  number: (v, decimals = 1) =>
    Number.isFinite(v) ? v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: decimals }) : '—',
};

// Muestra el valor de un resultado del motor (numero u objeto de macronutrientes).
export function formatResult(value, unit) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') {
    return `P ${fmt.number(value.protein, 0)} g · C ${fmt.number(value.carbs, 0)} g · G ${fmt.number(value.fat, 0)} g`;
  }
  // Los indices (razones) siempre con 2 decimales: 0.80, no 0.8.
  if (unit === 'razon') return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const decimals = unit.startsWith('kcal') || unit === 'ml/dia' || unit === 'g/dia' ? 0 : 1;
  return `${fmt.number(value, decimals)} ${unit.replace('kg/m2', 'kg/m²').replace('/dia', '/día')}`;
}

// Ultimo y penultimo valor medido de cada campo (las mediciones llegan en orden cronologico).
// Solo usa mediciones reales: si un campo no se midio, no aparece.
export function latestByField(measurements = []) {
  const out = {};
  for (const f of MEASUREMENT_FIELDS) {
    const rows = measurements.filter((m) => Number.isFinite(m.values?.[f.key]));
    const last = rows.at(-1);
    const prev = rows.at(-2);
    if (last) {
      out[f.key] = {
        value: last.values[f.key],
        takenAt: last.takenAt,
        method: last.method,
        previous: prev ? { value: prev.values[f.key], takenAt: prev.takenAt } : null,
      };
    }
  }
  return out;
}
