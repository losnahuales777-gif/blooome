// Etapa 2: consultas vinculadas, datos actuales derivados (sin copias), planes versionados y migracion.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';
import { startTestApi } from './helpers.js';

const run = promisify(execFile);
const BACKEND = fileURLToPath(new URL('../../', import.meta.url));

let t;
let ana;
let pid;
const year = new Date().getFullYear();
const patient = {
  fullName: 'Paciente Etapa Dos',
  birthDate: `${year - 38}-02-11`,
  sex: 'M',
  weightKg: 90,
  heightCm: 175,
  waistCm: 100,
  activity: 'ligera',
  goal: 'perder',
};

before(async () => {
  t = await startTestApi();
  await t.createUser('ana@prueba.test', 'Ana Prueba', 1);
  ana = await t.session('ana@prueba.test');
  pid = (await ana.call('POST', '/patients', patient)).body.patient.id;
});

after(async () => t?.stop());

describe('datos actuales derivados (sin duplicados)', () => {
  it('el expediente no guarda peso ni fechas de visita; se leen del historico', async () => {
    const doc = await t.db.collection('patients').findOne({ _id: pid });
    for (const f of ['weightKg', 'heightCm', 'waistCm', 'nextVisitAt', 'lastVisitAt']) assert.ok(!(f in doc), `${f} no debe guardarse`);
    const p = (await ana.call('GET', `/patients/${pid}`)).body.patient;
    assert.equal(p.weightKg, 90);
    assert.equal(p.heightCm, 175);
  });

  it('una medicion nueva actualiza el peso actual y conserva la estatura anterior', async () => {
    const r = await ana.call('POST', `/patients/${pid}/measurements`, {
      takenAt: new Date().toISOString(),
      weightKg: 88.5,
      method: 'bioimpedancia',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const m = await t.db.collection('mediciones').findOne({ _id: new (await import('mongodb')).ObjectId(r.body.id) });
    assert.equal(m.values.heightCm, null, 'la estatura no se copia en la medicion nueva');
    const p = (await ana.call('GET', `/patients/${pid}`)).body.patient;
    assert.equal(p.weightKg, 88.5);
    assert.equal(p.heightCm, 175);
    assert.equal(p.waistCm, 100);
  });

  it('editar el expediente ya no acepta medidas', async () => {
    const { weightKg, heightCm, waistCm, ...general } = patient;
    const bad = await ana.call('PUT', `/patients/${pid}`, { ...general, weightKg });
    assert.equal(bad.status, 400);
    const ok = await ana.call('PUT', `/patients/${pid}`, { ...general, notes: 'Actualizado' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.patient.weightKg, 88.5);
    assert.ok(heightCm && waistCm);
  });
});

describe('consulta vinculada', () => {
  let consultation;

  it('registrar la consulta vincula la medicion a la cita realizada y agenda la siguiente', async () => {
    const next = new Date(Date.now() + 14 * 86400000).toISOString();
    const r = await ana.call('POST', `/patients/${pid}/visits`, { weightKg: 87.9, waistCm: 97, nextVisit: next });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    consultation = r.body.consultation;
    assert.ok(consultation.appointmentId && consultation.measurementId);
    const p = r.body.patient;
    assert.equal(p.weightKg, 87.9);
    assert.equal(new Date(p.nextVisit).toISOString(), next);
    assert.ok(p.lastVisit, 'la ultima consulta se deriva de la cita realizada');
  });

  it('la nota creada durante la consulta se vincula sola y muestra sus mediciones', async () => {
    const note = await ana.call('POST', `/patients/${pid}/notes`, { consultationAt: new Date().toISOString() });
    assert.equal(note.status, 201, JSON.stringify(note.body));
    assert.equal(note.body.appointmentId, consultation.appointmentId);
    const full = await ana.call('GET', `/patients/${pid}/notes/${note.body.id}`);
    assert.equal(full.body.consultation.appointmentId, consultation.appointmentId);
    assert.equal(full.body.consultation.measurements.length, 1);
    assert.equal(full.body.consultation.measurements[0].values.weightKg, 87.9);
  });

  it('una nota lejana a cualquier consulta queda sin vincular', async () => {
    const note = await ana.call('POST', `/patients/${pid}/notes`, { consultationAt: new Date(Date.now() - 20 * 86400000).toISOString() });
    assert.equal(note.body.appointmentId, null);
  });

  it('cancelar la proxima cita deja al paciente sin proxima consulta', async () => {
    const a = await ana.call('GET', `/patients/${pid}/analysis`);
    const pending = a.body.appointments.find((x) => x.status === 'programada');
    await ana.call('POST', `/patients/${pid}/appointments/${pending.id}/cancel`, { reason: 'Reprogramar' });
    assert.equal((await ana.call('GET', `/patients/${pid}`)).body.patient.nextVisit, null);
  });

  it('la linea de tiempo resume lo registrado en la consulta', async () => {
    const tl = await ana.call('GET', `/patients/${pid}/timeline?types=consulta,primera_consulta`);
    assert.ok(
      tl.body.events.some((e) => /1 medicion\(es\), 1 nota\(s\)/.test(e.detail ?? '')),
      JSON.stringify(tl.body.events),
    );
  });
});

describe('planes alimenticios versionados', () => {
  const food = { name: 'Avena', portion: '40 g', protein: 5, carbs: 27, fat: 3 };
  const meals = (n) => ({ desayuno: Array.from({ length: n }, () => food), colacion1: [], comida: [], colacion2: [], cena: [] });

  it('cada guardado crea una version y conserva la anterior', async () => {
    const v1 = await ana.call('PUT', `/patients/${pid}/meal-plan`, { meals: meals(1), expectedVersion: 0 });
    assert.equal(v1.status, 200, JSON.stringify(v1.body));
    assert.equal(v1.body.version, 1);
    const v2 = await ana.call('PUT', `/patients/${pid}/meal-plan`, { meals: meals(2), reason: 'Ajuste de porciones', expectedVersion: 1 });
    assert.equal(v2.body.version, 2);
    const list = await ana.call('GET', `/patients/${pid}/meal-plan/versions`);
    assert.deepEqual(
      list.body.items.map((v) => [v.version, v.status]),
      [
        [2, 'vigente'],
        [1, 'reemplazado'],
      ],
    );
    assert.equal(list.body.items[0].reason, 'Ajuste de porciones');
    const old = await ana.call('GET', `/patients/${pid}/meal-plan/versions/1`);
    assert.equal(old.body.meals.desayuno.length, 1);
  });

  it('rechaza guardar sobre una version desactualizada', async () => {
    const stale = await ana.call('PUT', `/patients/${pid}/meal-plan`, { meals: meals(3), expectedVersion: 1 });
    assert.equal(stale.status, 409);
    assert.equal((await ana.call('GET', `/patients/${pid}/meal-plan`)).body.version, 2);
  });
});

describe('migracion de la etapa 2', () => {
  it('traslada datos duplicados sin perderlos y es idempotente', async () => {
    const legacyId = 9000;
    const visit = new Date(Date.now() + 5 * 86400000);
    const last = new Date(Date.now() - 40 * 86400000);
    await t.db.collection('patients').insertOne({
      _id: legacyId,
      nutritionistId: 1,
      fullName: 'Paciente Anterior',
      birthDate: `${year - 30}-01-01`,
      sex: 'F',
      weightKg: 61,
      heightCm: 158,
      waistCm: null,
      nextVisitAt: visit,
      lastVisitAt: last,
      activity: 'ligera',
      goal: 'mantener',
      createdAt: last,
      updatedAt: last,
    });
    await t.db.collection('mealPlans').insertOne({
      _id: legacyId,
      items: [{ meal: 'cena', position: 0, ...{ name: 'Sopa', portion: '1 taza', protein: 4, carbs: 10, fat: 2 } }],
      updatedAt: last,
      updatedBy: 1,
    });

    const env = { ...process.env, MONGODB_DB: t.db.databaseName };
    const dry = await run(process.execPath, ['--env-file=.env', 'scripts/migrate-stage2.js'], { cwd: BACKEND, env });
    assert.match(dry.stdout, /SIMULACION/);
    assert.ok('weightKg' in (await t.db.collection('patients').findOne({ _id: legacyId })), 'la simulacion no escribe');

    for (let i = 0; i < 2; i++)
      await run(process.execPath, ['--env-file=.env', 'scripts/migrate-stage2.js', '--apply'], { cwd: BACKEND, env });

    const doc = await t.db.collection('patients').findOne({ _id: legacyId });
    assert.ok(!('weightKg' in doc) && !('nextVisitAt' in doc));
    const ms = await t.db.collection('mediciones').find({ patientId: legacyId }).toArray();
    assert.equal(ms.length, 1, 'una sola medicion migrada aunque se ejecute dos veces');
    assert.deepEqual(ms[0].values, { weightKg: 61, heightCm: 158 });
    assert.equal(ms[0].source, 'migracion');
    const citas = await t.db.collection('citas').find({ patientId: legacyId }).sort({ scheduledAt: 1 }).toArray();
    assert.deepEqual(
      citas.map((c) => c.status),
      ['realizada', 'programada'],
    );
    const plans = await t.db.collection('planesAlimenticios').find({ patientId: legacyId }).toArray();
    assert.equal(plans.length, 1);
    assert.equal(plans[0].version, 1);
    assert.ok(await t.db.collection('mealPlans').findOne({ _id: legacyId }), 'la coleccion anterior se conserva');
  });
});
