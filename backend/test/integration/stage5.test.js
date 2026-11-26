// Etapa 5: reportes PDF versionados y documentos adjuntos seguros.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestApi } from './helpers.js';

let t;
let ana;
let luis;
let pid;
let noteId;
const year = new Date().getFullYear();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

before(async () => {
  t = await startTestApi();
  await t.createUser('ana@prueba.test', 'Ana Prueba', 1);
  await t.createUser('luis@prueba.test', 'Luis Prueba', 1);
  [ana, luis] = await Promise.all([t.session('ana@prueba.test'), t.session('luis@prueba.test')]);
  pid = (
    await ana.call('POST', '/patients', {
      fullName: 'Paciente Etapa Cinco',
      birthDate: `${year - 29}-09-09`,
      sex: 'F',
      weightKg: 64,
      heightCm: 160,
      waistCm: 78,
      activity: 'moderada',
      goal: 'mantener',
    })
  ).body.patient.id;
  await ana.call('POST', `/patients/${pid}/visits`, { weightKg: 63.2, waistCm: 77 });
  await ana.call('POST', `/patients/${pid}/history`, { category: 'alergia', description: 'Alergia de prueba' });
  await ana.call('POST', `/patients/${pid}/goals`, { description: 'Objetivo de prueba', targetDate: null });
  await ana.call('POST', `/patients/${pid}/evaluations`);
  await ana.call('PUT', `/patients/${pid}/meal-plan`, {
    meals: {
      desayuno: [{ name: 'Alimento de prueba', portion: '1 taza', protein: 5, carbs: 20, fat: 2 }],
      colacion1: [],
      comida: [],
      colacion2: [],
      cena: [],
    },
  });
  noteId = (
    await ana.call('POST', `/patients/${pid}/notes`, {
      consultationAt: new Date().toISOString(),
      soap: { s: 'S de prueba', o: 'O', a: 'A', p: 'P' },
    })
  ).body.id;
});

after(async () => t?.stop());

// Descarga cruda (la sesion de prueba devuelve JSON; aqui se necesita el binario y las cabeceras).
async function download(session, path) {
  const res = await session.raw('GET', path);
  return { status: res.status, headers: res.headers, body: Buffer.from(await res.arrayBuffer()) };
}

describe('reportes PDF', () => {
  it('genera los 7 tipos de reporte de uso clinico como PDF versionado', async () => {
    for (const type of ['historia', 'consulta', 'evaluacion', 'plan', 'evolucion', 'antropometria', 'objetivos']) {
      const r = await ana.call('POST', `/patients/${pid}/reports`, { type, audience: 'clinico', ...(type === 'consulta' && { noteId }) });
      assert.equal(r.status, 201, `${type}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.version, 1);
      assert.equal(r.body.contentType, 'application/pdf');
      assert.match(r.body.sha256, /^[a-f0-9]{64}$/);
      const file = await download(ana, `/patients/${pid}/documents/${r.body.id}/file`);
      assert.equal(file.status, 200);
      assert.equal(file.body.subarray(0, 5).toString(), '%PDF-', `${type} es un PDF`);
      assert.match(file.headers.get('content-disposition'), /^attachment;/);
      assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    }
  });

  it('cada nueva generacion incrementa la version y conserva la anterior', async () => {
    const r = await ana.call('POST', `/patients/${pid}/reports`, { type: 'plan', audience: 'clinico' });
    assert.equal(r.body.version, 2);
    const list = await ana.call('GET', `/patients/${pid}/documents`);
    assert.deepEqual(
      list.body.items
        .filter((d) => d.reportType === 'plan')
        .map((d) => d.version)
        .sort(),
      [1, 2],
    );
  });

  it('los reportes clinicos no se generan para terceros; los permitidos usan datos minimos', async () => {
    for (const type of ['historia', 'consulta', 'evaluacion']) {
      assert.equal((await ana.call('POST', `/patients/${pid}/reports`, { type, audience: 'terceros', noteId })).status, 400);
    }
    const r = await ana.call('POST', `/patients/${pid}/reports`, { type: 'plan', audience: 'terceros' });
    assert.equal(r.status, 201);
    assert.equal(r.body.audience, 'terceros');
    const { identificationLines } = await import('../../src/reports/reports.business.js');
    const patient = { id: pid, full_name: 'X', birth_date: '1990-01-01', sex: 'F', nutritionist_name: 'Y' };
    assert.deepEqual(
      identificationLines(patient, 'terceros').map(([k]) => k),
      ['Paciente', 'Edad'],
    );
  });

  it('otro nutriologo no puede generar ni descargar documentos del paciente', async () => {
    assert.equal((await luis.call('POST', `/patients/${pid}/reports`, { type: 'plan' })).status, 404);
    const doc = (await ana.call('GET', `/patients/${pid}/documents`)).body.items[0];
    assert.equal((await download(luis, `/patients/${pid}/documents/${doc.id}/file`)).status, 404);
  });
});

describe('adjuntos', () => {
  it('acepta PNG verificado por contenido y lo devuelve identico', async () => {
    const r = await ana.raw('POST', `/patients/${pid}/documents`, PNG, {
      'Content-Type': 'image/png',
      'X-Document-Description': encodeURIComponent('Estudio de prueba'),
    });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.contentType, 'image/png');
    assert.match(body.filename, /_adjunto_\d+\.png$/);
    const file = await download(ana, `/patients/${pid}/documents/${body.id}/file`);
    assert.ok(file.body.equals(PNG));
  });

  it('rechaza archivos cuyo contenido no es PDF, PNG ni JPG aunque digan serlo', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const r = await ana.raw('POST', `/patients/${pid}/documents`, html, {
      'Content-Type': 'application/pdf',
      'X-Document-Description': 'Documento',
    });
    assert.equal(r.status, 415);
  });

  it('rechaza archivos de mas de 5 MB y sin descripcion', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 10)]);
    assert.equal(
      (await ana.raw('POST', `/patients/${pid}/documents`, big, { 'Content-Type': 'application/pdf', 'X-Document-Description': 'Grande' }))
        .status,
      413,
    );
    assert.equal((await ana.raw('POST', `/patients/${pid}/documents`, PNG, { 'Content-Type': 'image/png' })).status, 400);
  });
});
