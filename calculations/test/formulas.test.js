import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIVITY_FACTORS,
  CalculationError,
  FORMULAS,
  KIND,
  ageFromBirthDate,
  averageCaloricIntake,
  bmi,
  energyBalance,
  energyTarget,
  fatFreeMass,
  fatMass,
  goalCompliance,
  hydrationEstimate,
  macroDistribution,
  periodKey,
  periodVariation,
  planAdherence,
  proteinRequirement,
  restingEnergyMifflin,
  totalEnergyExpenditure,
  waistHeightRatio,
  waistHipRatio,
  weightChangePercent,
  weightProgressToGoal,
} from '../src/index.js';

describe('estructura comun de resultados', () => {
  it('incluye formula, version, tipo y unidad', () => {
    const r = bmi({ weightKg: 70, heightCm: 175 });
    assert.equal(r.formula, 'imc');
    assert.equal(r.version, '1.0.0');
    assert.equal(r.kind, KIND.CALCULATED);
    assert.equal(r.unit, 'kg/m2');
    assert.deepEqual(r.missing, []);
  });

  it('con datos faltantes devuelve value null y lista lo que falta (no inventa)', () => {
    const r = bmi({ weightKg: 70, heightCm: null });
    assert.equal(r.value, null);
    assert.deepEqual(r.missing, ['heightCm']);
  });

  it('con datos fuera de rango lanza CalculationError', () => {
    assert.throws(() => bmi({ weightKg: 70, heightCm: 17.5 }), CalculationError);
    assert.throws(() => bmi({ weightKg: '70', heightCm: 175 }), CalculationError);
  });

  it('cada formula del catalogo tiene version y referencia', () => {
    for (const f of Object.values(FORMULAS)) {
      assert.match(f.version, /^\d+\.\d+\.\d+$/);
      assert.ok(f.reference.length > 10, f.id);
    }
  });
});

describe('antropometria', () => {
  it('IMC = peso / estatura^2', () => {
    assert.equal(bmi({ weightKg: 70, heightCm: 175 }).value, 22.9);
    assert.equal(bmi({ weightKg: 98, heightCm: 175 }).value, 32);
  });

  it('indice cintura-cadera e indice cintura-estatura', () => {
    assert.equal(waistHipRatio({ waistCm: 80, hipCm: 100 }).value, 0.8);
    assert.equal(waistHeightRatio({ waistCm: 86, heightCm: 162 }).value, 0.53);
  });

  it('masa grasa y masa libre de grasa suman el peso', () => {
    const fm = fatMass({ weightKg: 80, bodyFatPct: 25 }).value;
    const ffm = fatFreeMass({ weightKg: 80, bodyFatPct: 25 }).value;
    assert.equal(fm, 20);
    assert.equal(ffm, 60);
    assert.equal(fm + ffm, 80);
  });

  it('porcentaje de cambio de peso (negativo = perdida)', () => {
    assert.equal(weightChangePercent({ initialKg: 100, currentKg: 95 }).value, -5);
    assert.equal(weightChangePercent({ initialKg: 60, currentKg: 63 }).value, 5);
  });
});

describe('energia', () => {
  it('Mifflin-St Jeor mujer y hombre (valores de referencia)', () => {
    // Mujer 30 anos, 60 kg, 165 cm: 600 + 1031.25 - 150 - 161 = 1320.25
    assert.equal(restingEnergyMifflin({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'F' }).value, 1320);
    // Hombre 30 anos, 80 kg, 180 cm: 800 + 1125 - 150 + 5 = 1780
    assert.equal(restingEnergyMifflin({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'M' }).value, 1780);
    assert.equal(restingEnergyMifflin({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'M' }).kind, KIND.ESTIMATED);
  });

  it('rechaza sexo invalido y menores de 18', () => {
    assert.throws(() => restingEnergyMifflin({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'X' }));
    assert.throws(() => restingEnergyMifflin({ weightKg: 60, heightCm: 160, ageYears: 16, sex: 'F' }), CalculationError);
  });

  it('GET = TMR x factor de actividad', () => {
    assert.equal(totalEnergyExpenditure({ restingKcal: 1780, activityFactor: ACTIVITY_FACTORS.moderada }).value, 2759);
  });

  it('objetivo energetico prescrito segun objetivo', () => {
    assert.equal(energyTarget({ expenditureKcal: 2259, goal: 'perder' }).value, 1760);
    assert.equal(energyTarget({ expenditureKcal: 2259, goal: 'ganar' }).kind, KIND.PRESCRIBED);
    assert.throws(() => energyTarget({ expenditureKcal: 2000, goal: 'otro' }));
  });

  it('balance energetico = ingesta - gasto', () => {
    assert.equal(energyBalance({ intakeKcal: 1800, expenditureKcal: 2300 }).value, -500);
  });

  it('promedio calorico solo con dias registrados', () => {
    const r = averageCaloricIntake([{ kcal: 1800 }, { kcal: 2000 }, { kcal: null }, {}]);
    assert.equal(r.value, 1900);
    assert.equal(r.daysCounted, 2);
    assert.equal(averageCaloricIntake([]).value, null);
  });
});

describe('macronutrientes, proteina e hidratacion', () => {
  it('distribucion 25/50/25 de 2000 kcal', () => {
    assert.deepEqual(macroDistribution({ kcal: 2000, proteinPct: 25, carbsPct: 50, fatPct: 25 }).value, {
      protein: 125,
      carbs: 250,
      fat: 56,
    });
  });

  it('rechaza repartos que no suman 100', () => {
    assert.throws(() => macroDistribution({ kcal: 2000, proteinPct: 30, carbsPct: 50, fatPct: 30 }));
  });

  it('requerimiento proteico y su tipo prescrito', () => {
    const r = proteinRequirement({ weightKg: 70, gPerKg: 1.2 });
    assert.equal(r.value, 84);
    assert.equal(r.kind, KIND.PRESCRIBED);
  });

  it('hidratacion orientativa 35 ml/kg redondeada a 50 ml', () => {
    const r = hydrationEstimate({ weightKg: 72 });
    assert.equal(r.value, 2500);
    assert.equal(r.kind, KIND.ESTIMATED);
  });
});

describe('seguimiento', () => {
  it('progreso hacia el objetivo de peso', () => {
    assert.equal(weightProgressToGoal({ initialKg: 90, currentKg: 85, targetKg: 80 }).value, 50);
    assert.equal(weightProgressToGoal({ initialKg: 90, currentKg: 92, targetKg: 80 }).value, -20);
    assert.equal(weightProgressToGoal({ initialKg: 60, currentKg: 63, targetKg: 66 }).value, 50);
  });

  it('cumplimiento de objetivos y adherencia', () => {
    assert.equal(goalCompliance({ achieved: 3, total: 4 }).value, 75);
    assert.equal(goalCompliance({ achieved: 0, total: 0 }).value, null);
    assert.throws(() => goalCompliance({ achieved: 5, total: 4 }));
    const a = planAdherence([
      { mealsPlanned: 5, mealsFollowed: 4 },
      { mealsPlanned: 5, mealsFollowed: 5 },
      { mealsPlanned: null, mealsFollowed: 3 },
    ]);
    assert.equal(a.value, 90);
    assert.equal(a.daysCounted, 2);
    assert.equal(planAdherence([]).value, null);
  });

  it('claves de periodo ISO y variacion semanal/mensual sin interpolar', () => {
    assert.equal(periodKey('2026-01-01T12:00:00Z', 'week'), '2026-W01');
    assert.equal(periodKey('2026-11-10T12:00:00Z', 'month'), '2026-11');
    const series = [
      { date: '2026-09-02', value: 90 },
      { date: '2026-09-20', value: 88.4 },
      { date: '2026-11-05', value: 86 },
    ];
    assert.deepEqual(periodVariation(series, 'month'), [
      { period: '2026-09', value: 88.4, change: null },
      { period: '2026-11', value: 86, change: -2.4 },
    ]);
  });

  it('edad cumplida', () => {
    assert.equal(ageFromBirthDate('1990-11-11', '2026-11-10'), 35);
    assert.equal(ageFromBirthDate('1990-11-10', '2026-11-10'), 36);
  });
});
