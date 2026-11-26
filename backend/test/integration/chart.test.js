// Etapa 1 del expediente clinico: identificacion, antecedentes versionados, notas SOAP,
// diagnosticos vinculados, linea de tiempo, listas de trabajo y registro de accesos.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestApi } from './helpers.js';

let t;
let ana;
let luis;
let sup;
let pid;
const year = new Date().getFullYear();

before(async () => {
  t = await startTestApi();
  await t.createUser('super@prueba.test', 'Super Prueba', 3);
  await t.createUser('ana@prueba.test', 'Ana Prueba', 1);
  await t.createUser('luis@prueba.test', 'Luis Prueba', 1);
  [ana, luis, sup] = await Promise.all(['ana', 'luis', 'super'].map((u) => t.session(`${u}@prueba.test`)));
  const r = await ana.call('POST', '/patients', {
    fullName: 'Paciente Expediente',
    birthDate: `${year - 40}-05-20`,
    sex: 'F',
    weightKg: 74,
    heightCm: 162,
    waistCm: 88,
    activity: 'ligera',
    goal: 'perder',
  });
  pid = r.body.patient.id;
});

after(async () => t?.stop());

describe('identificacion y ficha', () => {
  it('la ficha senala datos faltantes sin inventarlos', async () => {
    const r = await ana.call('GET', `/patients/${pid}/chart`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.patient.recordNumber, `BL-${String(pid).padStart(6, '0')}`);
    assert.ok(r.body.missing.includes('Contacto de emergencia'));
    assert.ok(r.body.missing.some((m) => m.startsWith('Alergias')));
  });

  it('actualiza la identificacion ampliada y valida el correo', async () => {
    const bad = await ana.call('PUT', `/patients/${pid}/identification`, { email: 'no-es-correo' });
    assert.equal(bad.status, 400);
    const ok = await ana.call('PUT', `/patients/${pid}/identification`, {
      email: 'paciente@correo.test',
      occupation: 'Docente',
      consultReason: 'Control de peso',
      emergencyContact: { name: 'Contacto Prueba', relationship: 'Hermana', phone: '55 1111 2222' },
      recordStatus: 'activo',
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const chart = await ana.call('GET', `/patients/${pid}/chart`);
    assert.equal(chart.body.patient.identification.occupation, 'Docente');
    assert.ok(!chart.body.missing.includes('Contacto de emergencia'));
  });

  it('otro nutriologo no puede ver ni modificar el expediente', async () => {
    assert.equal((await luis.call('GET', `/patients/${pid}/chart`)).status, 404);
    assert.equal((await luis.call('POST', `/patients/${pid}/history`, { category: 'alergia', description: 'Prueba' })).status, 404);
  });
});

describe('antecedentes versionados', () => {
  let allergy;

  it('registra antecedentes estructurados y rechaza categorias o fechas invalidas', async () => {
    const r = await ana.call('POST', `/patients/${pid}/history`, {
      category: 'alergia',
      description: 'Cacahuate',
      severity: 'grave',
      onsetDate: '2010-01-01',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    allergy = r.body;
    assert.equal(allergy.version, 1);
    assert.equal((await ana.call('POST', `/patients/${pid}/history`, { category: 'inventada', description: 'x' })).status, 400);
    assert.equal(
      (
        await ana.call('POST', `/patients/${pid}/history`, {
          category: 'medicamento',
          description: 'Metformina',
          onsetDate: '2024-05-01',
          endDate: '2023-01-01',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await ana.call('POST', `/patients/${pid}/history`, {
          category: 'medicamento',
          description: 'Metformina 850 mg',
          dose: '850 mg',
          frequency: 'cada 12 h',
        })
      ).status,
      201,
    );
  });

  it('actualizar crea una version nueva y conserva la anterior', async () => {
    const r = await ana.call('PUT', `/patients/${pid}/history/${allergy.id}`, {
      description: 'Cacahuate y nueces',
      severity: 'grave',
      notes: 'Confirmada por alergologo',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.version, 2);
    assert.equal((await ana.call('PUT', `/patients/${pid}/history/${allergy.id}`, { description: 'Sobre version vieja' })).status, 409);
    const versions = await ana.call('GET', `/patients/${pid}/history/${r.body.id}/versions`);
    assert.deepEqual(
      versions.body.map((v) => v.version),
      [2, 1],
    );
    assert.equal(versions.body[1].description, 'Cacahuate');
    const chart = await ana.call('GET', `/patients/${pid}/chart`);
    const current = chart.body.history.filter((h) => h.category === 'alergia');
    assert.equal(current.length, 1, 'la ficha vigente muestra solo la version actual');
    assert.ok(chart.body.alerts.some((a) => a.type === 'alergia_registrada' && a.reason.includes('nueces')));
  });
});

describe('notas SOAP', () => {
  let note;

  it('crea un borrador y lo autoguarda con control de version', async () => {
    const r = await ana.call('POST', `/patients/${pid}/notes`, {
      consultationAt: new Date().toISOString(),
      soap: { s: 'Refiere ansiedad por comer en la noche', o: '', a: '', p: '' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    note = r.body;
    assert.equal(note.status, 'borrador');
    const saved = await ana.call('PUT', `/patients/${pid}/notes/${note.id}/draft`, {
      expectedVersion: note.version,
      soap: {
        s: 'Refiere ansiedad por comer en la noche',
        o: 'Peso 74 kg, cintura 88 cm',
        a: 'Ingesta nocturna elevada',
        p: 'Distribuir colaciones; registro de ingesta',
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.version, 2);
    const stale = await ana.call('PUT', `/patients/${pid}/notes/${note.id}/draft`, {
      expectedVersion: 1,
      soap: { s: 'vieja', o: '', a: '', p: '' },
    });
    assert.equal(stale.status, 409, 'un guardado con version vieja no sobrescribe');
    note = saved.body;
  });

  it('solo el autor edita o firma; la firma exige confirmacion', async () => {
    assert.equal(
      (await sup.call('PUT', `/patients/${pid}/notes/${note.id}/draft`, { expectedVersion: 2, soap: { s: 'x', o: 'x', a: 'x', p: 'x' } }))
        .status,
      403,
    );
    assert.equal((await ana.call('POST', `/patients/${pid}/notes/${note.id}/sign`, {})).status, 400);
  });

  it('no firma una nota incompleta', async () => {
    const draft = await ana.call('POST', `/patients/${pid}/notes`, {
      consultationAt: new Date().toISOString(),
      soap: { s: 'Solo subjetivo', o: '', a: '', p: '' },
    });
    const r = await ana.call('POST', `/patients/${pid}/notes/${draft.body.id}/sign`, { confirm: true });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /O, A, P/);
  });

  it('firma: queda inmutable, con huella y solo admite adendas', async () => {
    const signed = await ana.call('POST', `/patients/${pid}/notes/${note.id}/sign`, { confirm: true });
    assert.equal(signed.status, 200, JSON.stringify(signed.body));
    assert.equal(signed.body.status, 'firmada');
    assert.match(signed.body.contentHash, /^[a-f0-9]{64}$/);
    assert.equal(
      (
        await ana.call('PUT', `/patients/${pid}/notes/${note.id}/draft`, {
          expectedVersion: signed.body.version,
          soap: { s: 'cambio', o: '', a: '', p: '' },
        })
      ).status,
      409,
    );
    const add = await ana.call('POST', `/patients/${pid}/notes/${note.id}/addenda`, { text: 'Correccion: la cintura medida fue 87.5 cm' });
    assert.equal(add.status, 201);
    const detail = await ana.call('GET', `/patients/${pid}/notes/${note.id}`);
    assert.equal(detail.body.note.soap.o, 'Peso 74 kg, cintura 88 cm', 'el texto original no cambia');
    assert.equal(detail.body.note.addenda.length, 1);
    assert.deepEqual(
      detail.body.versions.map((v) => v.kind),
      ['firma', 'borrador', 'creacion'],
    );
  });
});

describe('evaluacion, diagnostico y objetivos vinculados', () => {
  let evaluationId;
  let diagnosisId;

  it('el diagnostico exige una evaluacion del mismo paciente', async () => {
    const e = await ana.call('POST', `/patients/${pid}/evaluations`);
    assert.equal(e.status, 201);
    evaluationId = e.body.id;
    const other = await luis.call('POST', '/patients', {
      fullName: 'Otro Paciente',
      birthDate: `${year - 30}-01-01`,
      sex: 'M',
      weightKg: 80,
      heightCm: 175,
      activity: 'ligera',
      goal: 'mantener',
    });
    const otherEval = await luis.call('POST', `/patients/${other.body.patient.id}/evaluations`);
    const cross = await ana.call('POST', `/patients/${pid}/diagnoses`, {
      evaluationId: otherEval.body.id,
      problem: 'Exceso de ingesta energetica',
      etiology: 'x x x',
      signs: 'x x x',
    });
    assert.equal(cross.status, 400);
    const d = await ana.call('POST', `/patients/${pid}/diagnoses`, {
      evaluationId,
      problem: 'Ingesta energetica excesiva',
      etiology: 'Ingesta nocturna elevada',
      signs: 'IMC 28.2 y aumento de cintura',
    });
    assert.equal(d.status, 201, JSON.stringify(d.body));
    diagnosisId = d.body.id;
    assert.equal(d.body.evaluationId, evaluationId);
  });

  it('el objetivo se vincula a su diagnostico, indicador y periodo', async () => {
    const g = await ana.call('POST', `/patients/${pid}/goals`, {
      description: 'Reducir cintura a 84 cm',
      diagnosisId,
      indicator: { formula: 'cintura', targetValue: 84, unit: 'cm' },
      periodStart: new Date().toISOString().slice(0, 10),
      targetDate: `${year + 1}-03-01`,
    });
    assert.equal(g.status, 201, JSON.stringify(g.body));
    const chart = await ana.call('GET', `/patients/${pid}/chart`);
    assert.equal(chart.body.goals[0].diagnosisId, diagnosisId);
  });

  it('resolver un diagnostico conserva su historial', async () => {
    const r = await ana.call('PATCH', `/patients/${pid}/diagnoses/${diagnosisId}`, {
      status: 'resuelto',
      note: 'Ingesta nocturna controlada',
    });
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.body.statusHistory.map((s) => s.status),
      ['activo', 'resuelto'],
    );
  });
});

describe('linea de tiempo, listas de trabajo y accesos', () => {
  it('la linea de tiempo integra eventos y filtra por tipo', async () => {
    const all = await ana.call('GET', `/patients/${pid}/timeline`);
    assert.equal(all.status, 200, JSON.stringify(all.body));
    const types = new Set(all.body.events.map((e) => e.type));
    for (const tp of ['nota', 'medicion', 'diagnostico', 'antecedente', 'tratamiento', 'objetivo']) assert.ok(types.has(tp), tp);
    assert.ok(
      all.body.events.every((e) => e.ref?.kind && e.ref?.id),
      'cada evento abre su registro original',
    );
    const notes = await ana.call('GET', `/patients/${pid}/timeline?types=nota`);
    assert.ok(notes.body.events.length >= 1 && notes.body.events.every((e) => e.type === 'nota'));
    assert.equal((await ana.call('GET', `/patients/${pid}/timeline?types=invalido`)).status, 400);
  });

  it('listas de trabajo con alcance por rol', async () => {
    const records = await ana.call('GET', '/clinical/records');
    assert.equal(records.body.items.length, 1);
    assert.equal(records.body.items[0].drafts, 1);
    assert.equal(records.body.items[0].signedNotes, 1);
    const drafts = await ana.call('GET', '/clinical/notes?status=borrador');
    assert.equal(drafts.body.items.length, 1);
    assert.equal((await sup.call('GET', '/clinical/records')).body.items.length, 2);
    assert.equal((await ana.call('GET', '/clinical/evaluations')).body.items.length, 1);
  });

  it('cada consulta del expediente queda registrada en la auditoria (sin contenido clinico)', async () => {
    const r = await sup.call('GET', '/access/audit?page=1&pageSize=100');
    const views = r.body.items.filter((e) => e.event === 'PATIENT_RECORD_VIEWED');
    assert.ok(views.length >= 3);
    assert.ok(views.every((e) => /^paciente=\d+ seccion=[a-z-]+$/.test(e.details)));
    assert.ok(r.body.items.every((e) => !/cacahuate|ansiedad|metformina/i.test(e.details ?? '')));
  });
});
