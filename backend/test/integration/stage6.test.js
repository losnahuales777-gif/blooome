// Etapa 6: cifrado, sesiones del servidor, respaldos, consentimiento, conservacion y FHIR.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';
import { startTestApi } from './helpers.js';

const run = promisify(execFile);
const BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);

let t;
let sup;
let ana;
let pid;
const year = new Date().getFullYear();

before(async () => {
  t = await startTestApi();
  await t.createUser('super@prueba.test', 'Super Prueba', 3);
  await t.createUser('ana@prueba.test', 'Ana Prueba', 1);
  [sup, ana] = await Promise.all([t.session('super@prueba.test'), t.session('ana@prueba.test')]);
  pid = (
    await ana.call('POST', '/patients', {
      fullName: 'Paciente Etapa Seis',
      birthDate: `${year - 41}-04-04`,
      sex: 'F',
      weightKg: 70,
      heightCm: 165,
      waistCm: 80,
      activity: 'ligera',
      goal: 'mantener',
      phone: '55 1234 5678',
    })
  ).body.patient.id;
});

after(async () => t?.stop());

describe('cifrado de datos sensibles', () => {
  it('telefono e identificacion se guardan cifrados y la API los devuelve legibles', async () => {
    await ana.call('PUT', `/patients/${pid}/identification`, {
      email: 'paciente@correo.test',
      address: 'Domicilio de prueba',
      consultReason: 'Motivo de prueba',
      recordStatus: 'activo',
    });
    const raw = await t.db.collection('patients').findOne({ _id: pid });
    assert.equal(raw.phone._enc, 1);
    assert.equal(raw.identification._enc, 1);
    assert.ok(!JSON.stringify(raw).includes('Domicilio de prueba'));
    const chart = await ana.call('GET', `/patients/${pid}/chart`);
    assert.equal(chart.body.patient.phone, '55 1234 5678');
    assert.equal(chart.body.patient.identification.address, 'Domicilio de prueba');
  });

  it('la nota SOAP, sus versiones y adendas se guardan cifradas; la firma sigue verificando el contenido', async () => {
    const note = (
      await ana.call('POST', `/patients/${pid}/notes`, {
        consultationAt: new Date().toISOString(),
        soap: { s: 'Texto subjetivo secreto', o: 'O', a: 'A', p: 'P' },
      })
    ).body;
    await ana.call('POST', `/patients/${pid}/notes/${note.id}/sign`, { confirm: true });
    await ana.call('POST', `/patients/${pid}/notes/${note.id}/addenda`, { text: 'Adenda secreta de prueba' });
    const { ObjectId } = await import('mongodb');
    const raw = await t.db.collection('notasClinicas').findOne({ _id: new ObjectId(note.id) });
    const versions = await t.db
      .collection('notasVersiones')
      .find({ noteId: new ObjectId(note.id) })
      .toArray();
    assert.ok(!JSON.stringify(raw).includes('secret'));
    assert.ok(!JSON.stringify(versions).includes('secret'));
    const full = await ana.call('GET', `/patients/${pid}/notes/${note.id}`);
    assert.equal(full.body.note.soap.s, 'Texto subjetivo secreto');
    assert.equal(full.body.note.addenda[0].text, 'Adenda secreta de prueba');
    assert.match(full.body.note.contentHash, /^[a-f0-9]{64}$/);
  });

  it('los archivos se guardan cifrados y se descargan identicos', async () => {
    const r = await ana.raw('POST', `/patients/${pid}/documents`, PNG, {
      'Content-Type': 'image/png',
      'X-Document-Description': 'Consentimiento firmado',
    });
    const doc = await r.json();
    const meta = await t.db.collection('documentos').findOne({ _id: new (await import('mongodb')).ObjectId(doc.id) });
    const chunk = await t.db.collection('archivos.chunks').findOne({ files_id: meta.fileId });
    assert.equal(Buffer.from(chunk.data.buffer).subarray(0, 4).toString(), 'LNE1');
    const file = Buffer.from(await (await ana.raw('GET', `/patients/${pid}/documents/${doc.id}/file`)).arrayBuffer());
    assert.ok(file.equals(PNG));
  });

  it('un dato cifrado alterado no se descifra (autenticacion GCM)', async () => {
    const { encryptValue, decryptValue } = await import('../../src/utils/crypto.js');
    const enc = encryptValue({ a: 1 }, 'prueba');
    assert.deepEqual(decryptValue(enc, 'prueba'), { a: 1 });
    assert.throws(() => decryptValue(enc, 'otro.campo'));
    const tampered = {
      ...enc,
      ct: Buffer.from('xx' + enc.ct)
        .toString('base64')
        .slice(0, enc.ct.length),
    };
    assert.throws(() => decryptValue(tampered, 'prueba'));
  });
});

describe('sesiones del servidor', () => {
  it('cerrar sesion invalida el token aunque no haya caducado', async () => {
    await t.createUser('temp@prueba.test', 'Temporal Prueba', 1);
    const s = await t.session('temp@prueba.test');
    assert.equal((await s.call('GET', '/auth/me')).status, 200);
    await s.call('POST', '/auth/logout');
    const replay = await s.raw('GET', '/auth/me');
    assert.equal(replay.status, 401);
  });

  it('cerrar las otras sesiones deja activa solo la actual', async () => {
    const a = await t.session('ana@prueba.test');
    const b = await t.session('ana@prueba.test');
    const list = await a.call('GET', '/auth/sessions');
    assert.ok(list.body.items.filter((x) => x.current).length === 1 && list.body.items.length >= 2);
    assert.ok(
      list.body.items.every((x) => x.id.length === 8),
      'no expone el identificador completo',
    );
    await a.call('POST', '/auth/sessions/revoke-others');
    assert.equal((await b.call('GET', '/auth/me')).status, 401);
    assert.equal((await a.call('GET', '/auth/me')).status, 200);
    ana = a;
  });

  it('la sesion se cierra por inactividad', async () => {
    const s = await t.session('super@prueba.test');
    await t.db
      .collection('sesiones')
      .updateMany({ revokedAt: null, userAgent: { $exists: true } }, { $set: { lastSeenAt: new Date(Date.now() - 31 * 60000) } });
    const r = await s.call('GET', '/auth/me');
    assert.equal(r.status, 401);
    assert.match(r.body.error, /inactividad/);
    sup = await t.session('super@prueba.test');
    ana = await t.session('ana@prueba.test');
  });
});

describe('consentimiento y conservacion', () => {
  it('falta de consentimiento genera alerta; registrarlo con evidencia la resuelve', async () => {
    const pending = async () =>
      (await ana.call('GET', `/patients/${pid}/alerts`)).body.items.some((a) => a.type === 'consentimiento_pendiente');
    assert.ok(await pending());
    const base = { noticeVersion: '2026-01', method: 'firma_autografa', status: 'otorgado' };
    assert.equal(
      (await ana.call('POST', `/patients/${pid}/consents`, { ...base, type: 'datos_sensibles' })).status,
      400,
      'exige evidencia',
    );
    const evidence = (await ana.call('GET', `/patients/${pid}/documents`)).body.items.find((d) => d.kind === 'adjunto').id;
    for (const type of ['aviso_privacidad', 'datos_sensibles']) {
      const r = await ana.call('POST', `/patients/${pid}/consents`, { ...base, type, evidenceDocumentId: evidence });
      assert.equal(r.status, 201, JSON.stringify(r.body));
    }
    const c = await ana.call('GET', `/patients/${pid}/consents`);
    assert.deepEqual(c.body.missing, []);
    assert.ok(!(await pending()));
    await ana.call('POST', `/patients/${pid}/consents`, {
      ...base,
      type: 'datos_sensibles',
      status: 'revocado',
      method: 'verbal_documentada',
    });
    assert.ok(await pending(), 'la revocacion vuelve a dejarlo pendiente');
    assert.equal((await ana.call('GET', `/patients/${pid}/consents`)).body.history.length, 3);
  });

  it('el reporte de conservacion calcula el plazo y es solo para auditoria', async () => {
    assert.equal((await ana.call('GET', '/privacy/retention')).status, 403);
    const r = await sup.call('GET', '/privacy/retention');
    assert.equal(r.status, 200);
    const row = r.body.items.find((x) => x.patientId === pid);
    assert.equal(new Date(row.retainUntil).getFullYear() - new Date(row.lastActivity).getFullYear(), r.body.years);
    assert.equal(row.retentionDue, false);
  });
});

describe('exportacion FHIR', () => {
  it('genera un Bundle R4 con codigos LOINC, sin texto de las notas', async () => {
    await ana.call('POST', `/patients/${pid}/history`, { category: 'alergia', description: 'Alergia de prueba' });
    const res = await ana.raw('GET', `/patients/${pid}/fhir`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/fhir\+json/);
    const text = await res.text();
    const bundle = JSON.parse(text);
    assert.equal(bundle.resourceType, 'Bundle');
    const of = (type) => bundle.entry.map((e) => e.resource).filter((r) => r.resourceType === type);
    assert.equal(of('Patient')[0].identifier[0].value, `BL-${String(pid).padStart(6, '0')}`);
    const weight = of('Observation').find((o) => o.code.coding?.[0]?.code === '29463-7');
    assert.deepEqual(weight.valueQuantity, { value: 70, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' });
    assert.equal(of('AllergyIntolerance').length, 1);
    assert.equal(of('Consent').length, 3);
    assert.ok(bundle.entry.every((e) => e.fullUrl.startsWith('urn:uuid:')));
    assert.ok(!text.includes('Texto subjetivo secreto'));
  });
});

describe('respaldo y restauracion', () => {
  it('respalda cifrado, restaura en una base nueva y no sobrescribe una con datos', async () => {
    const env = { ...process.env, MONGODB_DB: t.db.databaseName };
    const out = await run(process.execPath, ['--env-file=.env', 'scripts/backup.js'], { cwd: BACKEND, env });
    const file = out.stdout.match(/backups\/(\S+\.lnbak)/)[1];
    const target = `${t.db.databaseName}_r`;
    try {
      const restored = await run(
        process.execPath,
        ['--env-file=.env', 'scripts/restore.js', '--file', `backups/${file}`, '--target', target],
        { cwd: BACKEND, env },
      );
      assert.match(restored.stdout, /colecciones verificadas/);
      const copy = t.db.client.db(target);
      assert.equal(await copy.collection('patients').countDocuments(), await t.db.collection('patients').countDocuments());
      const again = run(process.execPath, ['--env-file=.env', 'scripts/restore.js', '--file', `backups/${file}`, '--target', target], {
        cwd: BACKEND,
        env,
      });
      await assert.rejects(again, /no esta vacia/);
    } finally {
      await t.db.client.db(target).dropDatabase();
      for (const f of await readdir(new URL('../../backups/', import.meta.url))) {
        if (f.startsWith(file)) await rm(new URL(`../../backups/${f}`, import.meta.url));
      }
    }
  });
});
