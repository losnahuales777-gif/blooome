// Etapa 4: alertas clinicas configurables con estado de revision.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestApi } from './helpers.js';

let t;
let sup;
let ana;
let pid;
const year = new Date().getFullYear();
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();

before(async () => {
  t = await startTestApi();
  await t.createUser('super@prueba.test', 'Super Prueba', 3);
  await t.createUser('ana@prueba.test', 'Ana Prueba', 1);
  [sup, ana] = await Promise.all([t.session('super@prueba.test'), t.session('ana@prueba.test')]);
  pid = (
    await ana.call('POST', '/patients', {
      fullName: 'Paciente Etapa Cuatro',
      birthDate: `${year - 50}-03-03`,
      sex: 'M',
      weightKg: 90,
      heightCm: 172,
      waistCm: 100,
      activity: 'ligera',
      goal: 'perder',
    })
  ).body.patient.id;
});

after(async () => t?.stop());

const rules = async () => (await ana.call('GET', '/alerts/rules')).body.items;
const alerts = async (status = 'pendiente') => (await ana.call('GET', `/patients/${pid}/alerts?status=${status}`)).body.items;

describe('reglas', () => {
  it('trae solo reglas administrativas por defecto; ninguna clinica con umbrales de fabrica', async () => {
    const items = await rules();
    assert.ok(items.length >= 6);
    assert.ok(items.every((r) => r.kind === 'administrativa' && r.system));
  });

  it('configurar reglas exige el permiso alerts.configure', async () => {
    const r = await ana.call('POST', '/alerts/rules', {
      type: 'alergia_registrada',
      name: 'Prueba',
      priority: 'baja',
      enabled: true,
      params: {},
    });
    assert.equal(r.status, 403);
  });

  it('una regla clinica no se activa sin referencia que la valide', async () => {
    const body = {
      type: 'cambio_antropometrico',
      name: 'Cambio de peso de prueba',
      priority: 'media',
      enabled: true,
      params: { field: 'weightKg', pctChange: 5, windowDays: 60 },
    };
    assert.equal((await sup.call('POST', '/alerts/rules', body)).status, 400);
    const bad = await sup.call('POST', '/alerts/rules', {
      ...body,
      validationReference: 'Referencia de prueba',
      params: { field: 'weightKg' },
    });
    assert.equal(bad.status, 400, 'parametros incompletos');
    const ok = await sup.call('POST', '/alerts/rules', { ...body, validationReference: 'Referencia de prueba' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.validation.reference, 'Referencia de prueba');
  });
});

describe('alertas del paciente', () => {
  it('las reglas administrativas detectan hechos registrados', async () => {
    await ana.call('POST', `/patients/${pid}/history`, { category: 'alergia', description: 'Alergia de prueba' });
    const items = await alerts();
    const allergy = items.find((a) => a.type === 'alergia_registrada');
    assert.ok(allergy);
    assert.equal(allergy.priority, 'alta');
    assert.equal(allergy.status, 'pendiente');
    assert.ok(allergy.origin && allergy.reason && allergy.ruleId);
    assert.ok(items.some((a) => a.type === 'datos_incompletos'));
  });

  it('la regla antropometrica usa solo mediciones reales y su umbral', async () => {
    await ana.call('POST', `/patients/${pid}/measurements`, {
      takenAt: new Date().toISOString(),
      weightKg: 87,
      method: 'bascula y cinta metrica',
    });
    assert.ok(!(await alerts()).some((a) => a.type === 'cambio_antropometrico'), '-3.3 % no supera el 5 %');
    await ana.call('POST', `/patients/${pid}/measurements`, {
      takenAt: new Date().toISOString(),
      weightKg: 84,
      method: 'bascula y cinta metrica',
    });
    const a = (await alerts()).find((x) => x.type === 'cambio_antropometrico');
    assert.ok(a, 'cambio de -6.7 %');
    assert.match(a.reason, /90 → 84 kg/);
  });

  it('laboratorio fuera de rango solo con el mismo estudio y la misma unidad', async () => {
    const r = await sup.call('POST', '/alerts/rules', {
      type: 'laboratorio_fuera_rango',
      name: 'Glucosa de prueba',
      priority: 'media',
      enabled: true,
      validationReference: 'Referencia de prueba',
      params: { analyte: 'Glucosa de prueba', unit: 'mg/dL', min: 70, max: 99 },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await ana.call('POST', `/patients/${pid}/labs`, { takenAt: daysAgo(1), analyte: 'Glucosa de prueba', value: 110, unit: 'mg/dL' });
    await ana.call('POST', `/patients/${pid}/labs`, { takenAt: daysAgo(1), analyte: 'Glucosa de prueba', value: 6.5, unit: 'mmol/L' });
    const labs = (await alerts()).filter((a) => a.type === 'laboratorio_fuera_rango');
    assert.equal(labs.length, 1);
    assert.match(labs[0].reason, /110 mg\/dL/);
  });

  it('interaccion configurada cruza antecedentes y plan vigente', async () => {
    await sup.call('POST', '/alerts/rules', {
      type: 'interaccion_revision',
      name: 'Interaccion de prueba',
      priority: 'alta',
      enabled: true,
      validationReference: 'Referencia de prueba',
      params: { termsA: ['medicamento x'], termsB: ['alimento y'] },
    });
    await ana.call('POST', `/patients/${pid}/history`, { category: 'medicamento', description: 'Medicamento X de prueba' });
    assert.ok(!(await alerts()).some((a) => a.type === 'interaccion_revision'));
    await ana.call('PUT', `/patients/${pid}/meal-plan`, {
      meals: {
        desayuno: [{ name: 'Alimento Y', portion: '1 pieza', protein: 1, carbs: 10, fat: 0 }],
        colacion1: [],
        comida: [],
        colacion2: [],
        cena: [],
      },
    });
    const a = (await alerts()).find((x) => x.type === 'interaccion_revision');
    assert.ok(a);
    assert.match(a.reason, /Requiere revision profesional/);
  });
});

describe('revision', () => {
  it('marca una alerta como revisada y deja rastro en la linea de tiempo', async () => {
    const allergy = (await alerts()).find((a) => a.type === 'alergia_registrada');
    const r = await ana.call('POST', `/patients/${pid}/alerts/review`, {
      key: allergy.key,
      status: 'revisada',
      note: 'Revisada en consulta',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(!(await alerts()).some((a) => a.key === allergy.key));
    assert.equal((await alerts('revisada')).find((a) => a.key === allergy.key).review.note, 'Revisada en consulta');
    const tl = await ana.call('GET', `/patients/${pid}/timeline?types=alerta`);
    assert.ok(tl.body.events.some((e) => e.title.startsWith('Alerta revisada')));
  });

  it('descartar exige motivo y no acepta claves inexistentes', async () => {
    const any = (await alerts())[0];
    assert.equal((await ana.call('POST', `/patients/${pid}/alerts/review`, { key: any.key, status: 'descartada', note: '' })).status, 400);
    assert.equal((await ana.call('POST', `/patients/${pid}/alerts/review`, { key: 'regla:inventada', status: 'revisada' })).status, 404);
  });

  it('desactivar una regla quita sus alertas; los cambios quedan versionados', async () => {
    const rule = (await rules()).find((r) => r.type === 'datos_incompletos');
    const r = await sup.call('PUT', `/alerts/rules/${rule.id}`, { expectedVersion: rule.version, enabled: false });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(!(await alerts()).some((a) => a.type === 'datos_incompletos'));
    const stale = await sup.call('PUT', `/alerts/rules/${rule.id}`, { expectedVersion: rule.version, enabled: true });
    assert.equal(stale.status, 409);
    const versions = await sup.call('GET', `/alerts/rules/${rule.id}/versions`);
    assert.ok(versions.body.items.length >= 1);
  });

  it('la lista global de seguimiento reune las alertas pendientes', async () => {
    const r = await ana.call('GET', '/clinical/alerts');
    assert.equal(r.status, 200);
    assert.ok(r.body.items.every((a) => a.status === 'pendiente' && a.patientId === pid));
    assert.ok(r.body.items.some((a) => a.type === 'cambio_antropometrico'));
  });
});
