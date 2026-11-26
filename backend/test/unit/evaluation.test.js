// Pruebas unitarias de la evaluacion clinica (sin base de datos).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'test',
  CORS_ORIGIN: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://127.0.0.1:1/sin-conexion',
  JWT_SECRET: 'prueba-unitaria-0123456789abcdef0123456789',
  // Llave ficticia solo para las pruebas unitarias (32 bytes en cero, sin datos reales).
  DATA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
});
const { computeEvaluation } = await import('../../src/business/analysis.business.js');

const patient = {
  sex: 'F',
  birth_date: '1996-01-15',
  height_cm: 165,
  activity: 'ligera',
  goal: 'perder',
  target_weight_kg: 62,
  protein_g_per_kg: null,
};
const at = new Date('2026-11-10T12:00:00Z');
const measurements = [
  { takenAt: new Date('2026-08-01'), values: { weightKg: 72, heightCm: 165, waistCm: 86 } },
  { takenAt: new Date('2026-10-01'), values: { weightKg: 69, heightCm: 165, waistCm: 82, hipCm: 100 } },
  { takenAt: new Date('2026-11-01'), values: { weightKg: 67, heightCm: 165, bodyFatPct: 30 } },
];
const intakes = [
  { date: '2026-11-01', kcal: 1700, mealsPlanned: 5, mealsFollowed: 4 },
  { date: '2026-11-02', kcal: 1900, mealsPlanned: 5, mealsFollowed: 5 },
];
const goals = [{ status: 'cumplido' }, { status: 'pendiente' }];
const get = (results, id) => results.find((r) => r.formula === id);

describe('evaluacion clinica del expediente', () => {
  const results = computeEvaluation({ patient, measurements, intakes, goals, at });

  it('usa el ultimo valor medido de cada campo y conserva la version de cada formula', () => {
    assert.equal(get(results, 'imc').value, 24.6); // 67 / 1.65^2
    assert.equal(get(results, 'indice_cintura_cadera').value, 0.82); // 82 / 100 (cintura de octubre)
    assert.equal(get(results, 'masa_grasa').value, 20.1);
    assert.ok(results.every((r) => /^\d+\.\d+\.\d+$/.test(r.version)));
  });

  it('distingue datos estimados, calculados y prescritos', () => {
    assert.equal(get(results, 'tmr_mifflin_st_jeor').kind, 'estimado');
    assert.equal(get(results, 'imc').kind, 'calculado');
    assert.equal(get(results, 'objetivo_energetico').kind, 'prescrito');
  });

  it('calcula energia, avance y adherencia con los datos registrados', () => {
    // TMR mujer 30 anos 67 kg 165 cm = 670 + 1031.25 - 150 - 161 = 1390; GET x1.375 = 1911
    assert.equal(get(results, 'tmr_mifflin_st_jeor').value, 1390);
    assert.equal(get(results, 'gasto_energetico_total').value, 1911);
    assert.equal(get(results, 'objetivo_energetico').value, 1410);
    assert.equal(get(results, 'promedio_consumo_calorico').value, 1800);
    assert.equal(get(results, 'balance_energetico').value, -111);
    assert.equal(get(results, 'progreso_peso_objetivo').value, 50); // (72-67)/(72-62)
    assert.equal(get(results, 'cambio_peso_pct').value, -6.9);
    assert.equal(get(results, 'adherencia_plan').value, 90);
    assert.equal(get(results, 'cumplimiento_objetivos').value, 50);
  });

  it('no inventa datos: sin prescripcion proteica el resultado queda vacio con el motivo', () => {
    const r = get(results, 'requerimiento_proteico');
    assert.equal(r.value, null);
    assert.deepEqual(r.missing, ['gPerKg']);
  });

  it('un ajuste del profesional sustituye el valor efectivo y se propaga a los dependientes', () => {
    const overrides = new Map([['gasto_energetico_total', { adjustedValue: 2000, reason: 'Actividad laboral intensa', adjustedBy: 1 }]]);
    const adjusted = computeEvaluation({ patient, measurements, intakes, goals, overrides, at });
    const getRow = get(adjusted, 'gasto_energetico_total');
    assert.equal(getRow.value, 1911);
    assert.equal(getRow.effectiveValue, 2000);
    assert.equal(getRow.override.calculatedValue, 1911);
    assert.equal(get(adjusted, 'objetivo_energetico').value, 1500);
    assert.equal(get(adjusted, 'balance_energetico').value, -200);
  });

  it('un dato fuera de rango no rompe la evaluacion completa', () => {
    const bad = computeEvaluation({
      patient,
      measurements: [{ takenAt: at, values: { weightKg: 67, heightCm: 16.5 } }],
      intakes: [],
      goals: [],
      at,
    });
    assert.match(get(bad, 'imc').error, /heightCm/);
    assert.equal(get(bad, 'hidratacion_orientativa').value, 2350);
  });
});
