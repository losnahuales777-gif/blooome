// Capa MODEL del expediente: etiquetas, estados y reglas de presentacion.
export const RECORD_STATUS = Object.freeze({
  activo: { label: 'Activo', tone: 'success' },
  inactivo: { label: 'Inactivo', tone: 'neutral' },
  alta: { label: 'Alta', tone: 'info' },
});

export const NOTE_STATUS = Object.freeze({
  borrador: { label: 'Borrador', tone: 'warning' },
  firmada: { label: 'Firmada', tone: 'success' },
});

export const HISTORY_STATUS = Object.freeze({
  activo: 'Activo',
  resuelto: 'Resuelto',
  suspendido: 'Suspendido',
  inactivo: 'Inactivo',
});

export const ALERT_PRIORITY = Object.freeze({
  alta: { label: 'Prioridad alta', tone: 'danger' },
  media: { label: 'Prioridad media', tone: 'warning' },
  baja: { label: 'Prioridad baja', tone: 'info' },
});

export const SOAP_SECTIONS = Object.freeze([
  { key: 's', letter: 'S', label: 'Subjetivo', hint: 'Sintomas, habitos, percepcion del paciente y motivo de consulta.' },
  { key: 'o', letter: 'O', label: 'Objetivo', hint: 'Mediciones, signos, estudios y resultados observables.' },
  { key: 'a', letter: 'A', label: 'Analisis', hint: 'Interpretacion clinica y nutricional del profesional.' },
  { key: 'p', letter: 'P', label: 'Plan', hint: 'Intervencion, recomendaciones, objetivos y seguimiento.' },
]);

// Campos condicionales de cada categoria de antecedente.
export function historyFieldsFor(category) {
  return {
    severity: category === 'alergia',
    dose: ['medicamento', 'suplemento'].includes(category),
    frequency: ['medicamento', 'suplemento', 'alcohol', 'tabaco', 'actividad_fisica'].includes(category),
    dates: true,
  };
}

// Categorias que solo aplican segun el sexo registrado (campo condicional).
export const categoryApplies = (category, sex) => category !== 'ginecoobstetrico' || sex === 'F';

export const TIMELINE_TYPES = Object.freeze({
  primera_consulta: 'Primera consulta',
  evaluacion: 'Evaluaciones',
  alerta: 'Alertas revisadas',
  consulta: 'Consultas',
  proxima_consulta: 'Proximas consultas',
  nota: 'Notas',
  medicion: 'Mediciones',
  laboratorio: 'Laboratorio',
  diagnostico: 'Diagnosticos',
  antecedente: 'Antecedentes',
  tratamiento: 'Tratamientos',
  plan: 'Plan alimenticio',
  objetivo: 'Objetivos',
});

export const PATIENT_TABS = Object.freeze([
  { key: 'resumen', label: 'Resumen clinico' },
  { key: 'historia', label: 'Historia clinica' },
  { key: 'consultas', label: 'Consultas y notas SOAP' },
  { key: 'antropometria', label: 'Antropometria' },
  { key: 'laboratorios', label: 'Laboratorios' },
  { key: 'diagnosticos', label: 'Diagnosticos' },
  { key: 'plan', label: 'Plan nutricional' },
  { key: 'objetivos', label: 'Objetivos' },
  { key: 'evolucion', label: 'Evolucion' },
  { key: 'documentos', label: 'Documentos' },
]);

// Pestana (y parametros) donde se abre el registro original de cada evento de la linea de tiempo.
export function timelineTarget(ref) {
  switch (ref?.kind) {
    case 'nota':
      return { tab: 'consultas', nota: ref.id };
    case 'cita':
      return { tab: 'consultas' };
    case 'medicion':
      return { tab: 'antropometria' };
    case 'laboratorio':
      return { tab: 'laboratorios' };
    case 'diagnostico':
    case 'evaluacion':
      return { tab: 'diagnosticos' };
    case 'antecedente':
      return { tab: 'historia' };
    case 'objetivo':
      return { tab: 'objetivos' };
    case 'plan':
      return { tab: 'plan' };
    case 'alerta':
      return { tab: 'resumen' };
    default:
      return null;
  }
}

// Categorias que conviene confirmar en cada consulta (cambios frecuentes y relevancia clinica).
export const VERIFY_CATEGORIES = Object.freeze(['alergia', 'medicamento', 'suplemento', 'enfermedad']);

// Aviso de captura (no clinico): un valor que difiere mucho de la medicion anterior suele ser un error
// de tecleo o de unidad. No bloquea el guardado.
export const CAPTURE_CHECK_PCT = 10;
export function captureWarning(value, previous) {
  if (!Number.isFinite(value) || !Number.isFinite(previous) || previous === 0) return null;
  const pct = ((value - previous) / previous) * 100;
  return Math.abs(pct) >= CAPTURE_CHECK_PCT
    ? `Difiere ${pct > 0 ? '+' : ''}${pct.toFixed(1)} % de la medicion anterior (${previous}). Verifica la captura y la unidad.`
    : null;
}
