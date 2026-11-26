// Pruebas de integracion contra MongoDB Atlas (MONGODB_URI de .env), en una base TEMPORAL que se
// crea y se elimina en cada ejecucion: nunca toca la base de trabajo.
// Uso: npm run test:integration
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

process.env.MONGODB_DB = `lanutria_prueba_${randomBytes(4).toString('hex')}`;
process.env.NODE_ENV = 'test';
process.env.LOGIN_MAX_ATTEMPTS = '5';

const { app } = await import('../../src/app.js');
const { closeDb, connectDb } = await import('../../src/config/database.js');
const { bootstrapDatabase } = await import('../../src/config/bootstrap.js');
const { UserModel } = await import('../../src/models/user.model.js');
const { hashPassword } = await import('../../src/utils/password.js');

// Contrasena de prueba generada al vuelo; solo existe en la base temporal y nunca se imprime.
const PASS = `Pr#${randomBytes(9).toString('base64url')}9a`;
let db;
let server;
let base;

async function session(email, password = PASS) {
  const jar = {};
  const store = (res) =>
    (res.headers.getSetCookie?.() ?? []).forEach((c) => {
      const [k, v] = c.split(';')[0].split('=');
      jar[k] = v;
    });
  store(await fetch(`${base}/auth/csrf`));
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': jar.csrf_token,
        Cookie: Object.entries(jar)
          .map(([k, v]) => `${k}=${v}`)
          .join('; '),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    store(res);
    return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
  };
  const login = await call('POST', '/auth/login', { email, password });
  return { call, login };
}

const year = new Date().getFullYear();
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const iso = (d) => d.toISOString();
const day = (d) => d.toISOString().slice(0, 10);
let ana;
let luis;
let admin;
let sup;
let patientId;

before(async () => {
  db = await connectDb();
  await bootstrapDatabase();
  const hash = await hashPassword(PASS);
  await UserModel.create({ email: 'super@prueba.test', fullName: 'Super Prueba', passwordHash: hash, roleId: 3, createdBy: null });
  await UserModel.create({ email: 'ana@prueba.test', fullName: 'Ana Prueba', passwordHash: hash, roleId: 1, createdBy: 1 });
  await UserModel.create({ email: 'luis@prueba.test', fullName: 'Luis Prueba', passwordHash: hash, roleId: 1, createdBy: 1 });
  await UserModel.create({ email: 'admin@prueba.test', fullName: 'Admin Prueba', passwordHash: hash, roleId: 2, createdBy: 1 });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  [ana, luis, admin, sup] = await Promise.all(['ana', 'luis', 'admin', 'super'].map((u) => session(`${u}@prueba.test`)));
});

after(async () => {
  server?.close();
  if (db) {
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) await db.collection(name).drop();
  }
  await closeDb();
});

describe('seguridad y modulos existentes', () => {
  it('login: credenciales incorrectas e inyeccion NoSQL', async () => {
    assert.equal((await session('ana@prueba.test', 'Incorrecta#2026')).login.status, 401);
    assert.equal((await session({ $ne: null }, { $ne: null })).login.status, 400);
    assert.equal(ana.login.status, 200);
  });

  it('alta de paciente: rango de edad y registro inicial', async () => {
    const tooYoung = await ana.call('POST', '/patients', {
      fullName: 'Menor Edad',
      birthDate: `${year - 16}-01-15`,
      sex: 'M',
      weightKg: 60,
      heightCm: 170,
      activity: 'ligera',
      goal: 'mantener',
    });
    assert.equal(tooYoung.status, 400);

    const created = await ana.call('POST', '/patients', {
      fullName: 'Paciente Analisis',
      birthDate: `${year - 30}-01-15`,
      sex: 'F',
      weightKg: 72,
      heightCm: 165,
      waistCm: 86,
      activity: 'ligera',
      goal: 'perder',
      nextVisit: iso(new Date(Date.now() + 3 * 86400000)),
      targetWeightKg: 62,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    patientId = created.body.patient.id;
    assert.equal(created.body.patient.targetWeightKg, 62);
    assert.equal(created.body.patient.isActive, true);
  });

  it('control de acceso: otro nutriologo y el administrador no ven el expediente', async () => {
    assert.equal((await luis.call('GET', `/patients/${patientId}/analysis`)).status, 404);
    assert.equal((await admin.call('GET', `/patients/${patientId}/analysis`)).status, 403);
    assert.equal(
      (await luis.call('POST', `/patients/${patientId}/measurements`, { takenAt: iso(new Date()), weightKg: 70, method: 'bascula' }))
        .status,
      404,
    );
  });
});

describe('historico clinico', () => {
  let firstMeasurementId;

  it('registra mediciones en distintas fechas y rechaza fechas futuras o registros vacios', async () => {
    for (const [d, w, waist, hip] of [
      [60, 71, 85, 101],
      [30, 69.5, 83, 100],
      [7, 68, 82, 99],
    ]) {
      const r = await ana.call('POST', `/patients/${patientId}/measurements`, {
        takenAt: iso(daysAgo(d)),
        weightKg: w,
        waistCm: waist,
        hipCm: hip,
        bodyFatPct: 31,
        muscleMassKg: 24,
        method: 'bioimpedancia',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      firstMeasurementId ??= r.body.id;
    }
    const future = await ana.call('POST', `/patients/${patientId}/measurements`, {
      takenAt: iso(daysAgo(-2)),
      weightKg: 68,
      method: 'bascula',
    });
    assert.equal(future.status, 400);
    const empty = await ana.call('POST', `/patients/${patientId}/measurements`, { takenAt: iso(new Date()), method: 'bascula' });
    assert.equal(empty.status, 400);
  });

  it('una correccion conserva el registro original (no sobrescribe)', async () => {
    const r = await ana.call('POST', `/patients/${patientId}/measurements/${firstMeasurementId}/corrections`, {
      weightKg: 70.8,
      reason: 'Error de captura en la bascula',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const again = await ana.call('POST', `/patients/${patientId}/measurements/${firstMeasurementId}/corrections`, {
      weightKg: 70.7,
      reason: 'Segunda correccion sobre la version vieja',
    });
    assert.equal(again.status, 409);
    const stored = await db.collection('mediciones').countDocuments({ patientId });
    assert.equal(stored, 5); // inicial + 3 + correccion: el original sigue guardado
  });

  it('consulta: agrega medicion, cierra la cita y agenda la siguiente (transaccion)', async () => {
    const r = await ana.call('POST', `/patients/${patientId}/visits`, {
      weightKg: 67.5,
      waistCm: 81,
      hipCm: 99,
      nextVisit: iso(new Date(Date.now() + 14 * 86400000)),
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const citas = await db.collection('citas').find({ patientId }).toArray();
    assert.equal(citas.filter((c) => c.status === 'realizada').length, 1);
    assert.equal(citas.filter((c) => c.status === 'programada').length, 1);
  });

  it('consumo, laboratorio, objetivos y validaciones', async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await ana.call('POST', `/patients/${patientId}/intake`, {
        date: day(daysAgo(i)),
        kcal: 1600 + i * 50,
        proteinG: 80,
        carbsG: 180,
        fatG: 55,
        waterMl: 1800 + i * 100,
        activityMinutes: 30,
        activityType: 'caminata',
        mealsPlanned: 5,
        mealsFollowed: i % 2 ? 4 : 5,
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    }
    const bad = await ana.call('POST', `/patients/${patientId}/intake`, { date: day(new Date()), mealsPlanned: 3, mealsFollowed: 5 });
    assert.equal(bad.status, 400);

    assert.equal(
      (
        await ana.call('POST', `/patients/${patientId}/labs`, {
          takenAt: iso(daysAgo(10)),
          analyte: 'Glucosa en ayuno',
          value: 92,
          unit: 'mg/dL',
          referenceRange: '70-99',
        })
      ).status,
      201,
    );

    const g1 = await ana.call('POST', `/patients/${patientId}/goals`, { description: 'Caminar 30 minutos diarios', targetDate: null });
    await ana.call('POST', `/patients/${patientId}/goals`, { description: 'Reducir 4 kg', targetDate: day(daysAgo(-60)) });
    assert.equal((await ana.call('PATCH', `/patients/${patientId}/goals/${g1.body.id}`, { status: 'cumplido' })).status, 200);
  });

  it('ajuste profesional justificado y rechazo de indicadores inexistentes', async () => {
    assert.equal(
      (await ana.call('POST', `/patients/${patientId}/overrides`, { formula: 'inventada', adjustedValue: 1, reason: 'Prueba' })).status,
      400,
    );
    const r = await ana.call('POST', `/patients/${patientId}/overrides`, {
      formula: 'gasto_energetico_total',
      adjustedValue: 2000,
      reason: 'Trabajo con alta demanda fisica',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  });
});

describe('dashboard individual', () => {
  it('devuelve series, evaluacion trazable, metas y variaciones del periodo', async () => {
    const r = await ana.call('GET', `/patients/${patientId}/analysis`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const a = r.body;
    assert.equal(a.series.weightKg.length, 5); // inicial + 3 (una corregida, solo cuenta la vigente) + consulta
    assert.ok(a.series.weightKg.every((p) => p.kind === 'medido'));
    assert.equal(a.series.bmi[0].kind, 'calculado');
    assert.ok(
      a.series.fatMassKg.length >= 3,
      JSON.stringify({ fat: a.series.fatMassKg, bf: a.series.bodyFatPct, m: a.measurements.map((x) => x.values) }),
    );
    const get = a.evaluation.find((x) => x.formula === 'gasto_energetico_total');
    assert.equal(get.effectiveValue, 2000);
    assert.ok(get.override.reason.includes('demanda'));
    assert.ok(a.evaluation.every((x) => x.version && x.kind));
    assert.equal(a.targets.kcal, 1500); // 2000 ajustado - 500 por objetivo
    assert.equal(a.intake.length, 5);
    assert.equal(a.labs.length, 1);
    assert.equal(a.goals.length, 2);
    assert.equal(a.evaluation.find((x) => x.formula === 'cumplimiento_objetivos').value, 50);
    assert.ok(a.appointments.length >= 2);
    assert.ok(a.variation.weightMonthly.length >= 2);
    assert.ok(a.evaluations.length >= 4, 'cada medicion deja una evaluacion con version de formula');
  });

  it('filtra por periodo y valida fechas', async () => {
    const from = day(daysAgo(10));
    const r = await ana.call('GET', `/patients/${patientId}/analysis?from=${from}&to=${day(new Date())}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.series.weightKg.every((p) => new Date(p.date) >= new Date(`${from}T00:00:00Z`)));
    assert.equal((await ana.call('GET', `/patients/${patientId}/analysis?from=2026-12-01&to=2026-01-01`)).status, 400);
  });

  it('respeta la zona horaria del usuario al delimitar el dia (consulta registrada en la noche)', async () => {
    // Fin del dia de hoy en hora de Mexico (UTC-6), con offset explicito como lo envia el frontend.
    const mx = new Date(Date.now() - 6 * 3600000);
    const endMx = `${mx.toISOString().slice(0, 10)}T23:59:59.999-06:00`;
    const r = await ana.call('GET', `/patients/${patientId}/analysis?to=${encodeURIComponent(endMx)}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const last = r.body.series.weightKg.at(-1);
    assert.equal(last.value, 67.5, 'la medicion de la consulta de hoy debe estar en el periodo');
  });

  it('cancela una cita programada (sin borrarla)', async () => {
    const { body } = await ana.call('GET', `/patients/${patientId}/analysis`);
    const pending = body.appointments.find((c) => c.status === 'programada');
    const r = await ana.call('POST', `/patients/${patientId}/appointments/${pending.id}/cancel`, {
      reason: 'El paciente pidio reprogramar',
    });
    assert.equal(r.status, 200);
    assert.equal(await db.collection('citas').countDocuments({ patientId, status: 'cancelada' }), 1);
  });
});

describe('dashboard administrativo', () => {
  it('estadisticas por agregacion con alcance por rol', async () => {
    const own = await ana.call('GET', '/stats/overview');
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.scope, 'own');
    assert.equal(own.body.kpis.activePatients, 1, JSON.stringify(own.body.kpis));
    assert.equal(own.body.kpis.appointments.done, 1, JSON.stringify(own.body.kpis));
    assert.equal(own.body.kpis.appointments.cancelled, 1);
    assert.equal(own.body.kpis.attendancePct, 50);
    assert.equal(own.body.kpis.adherencePct, 88);
    assert.equal(own.body.goals.perder, 1);
    assert.ok(own.body.indicators.length >= 1);
    assert.equal(own.body.ageBmi.length, 1);
    assert.ok(
      own.body.ageBmi.every((p) => !('fullName' in p)),
      'los puntos agregados no llevan nombres',
    );

    const others = await luis.call('GET', '/stats/overview');
    assert.equal(others.body.kpis.activePatients, 0);
    const all = await sup.call('GET', '/stats/overview');
    assert.equal(all.body.scope, 'all');
    assert.equal((await admin.call('GET', '/stats/overview')).status, 403);
    assert.equal((await ana.call('GET', '/stats/overview?tz=Marte/Olympus')).status, 400);
  });

  it('auditoria registra los eventos clinicos sin datos de salud', async () => {
    const r = await sup.call('GET', '/access/audit?page=1&pageSize=100');
    const events = new Set(r.body.items.map((e) => e.event));
    for (const e of [
      'MEASUREMENT_RECORDED',
      'MEASUREMENT_CORRECTED',
      'INTAKE_RECORDED',
      'LAB_RECORDED',
      'CLINICAL_OVERRIDE',
      'APPOINTMENT_CANCELLED',
    ]) {
      assert.ok(events.has(e), e);
    }
    assert.ok(r.body.items.every((e) => !/kg|mg\/dL|glucosa/i.test(e.details ?? '')));
  });
});
