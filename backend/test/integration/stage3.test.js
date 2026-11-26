// Etapa 3: catalogos autorizados, verificacion de datos vigentes, objetivos con indicador y linea de
// tiempo con evaluaciones.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';
import { startTestApi } from './helpers.js';

const run = promisify(execFile);
const BACKEND = fileURLToPath(new URL('../../', import.meta.url));

let t;
let ana;
let pid;
let dir;
const year = new Date().getFullYear();

before(async () => {
  t = await startTestApi();
  await t.createUser('ana@prueba.test', 'Ana Prueba', 1);
  ana = await t.session('ana@prueba.test');
  pid = (
    await ana.call('POST', '/patients', {
      fullName: 'Paciente Etapa Tres',
      birthDate: `${year - 45}-06-01`,
      sex: 'F',
      weightKg: 70,
      heightCm: 160,
      waistCm: 85,
      activity: 'ligera',
      goal: 'perder',
    })
  ).body.patient.id;
  dir = await mkdtemp(join(tmpdir(), 'lanutria-catalogo-'));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
  await t?.stop();
});

const importCatalog = (file, extra = []) =>
  run(
    process.execPath,
    [
      '--env-file=.env',
      'scripts/import-catalog.js',
      '--type',
      'medicamento',
      '--source',
      'Fuente de prueba',
      '--version',
      'v1',
      '--file',
      file,
      ...extra,
    ],
    {
      cwd: BACKEND,
      env: { ...process.env, MONGODB_DB: t.db.databaseName },
    },
  );

describe('catalogos autorizados', () => {
  it('sin catalogo cargado la busqueda devuelve vacio (texto libre)', async () => {
    const r = await ana.call('GET', '/catalogs/medicamento?q=te');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.items, []);
    assert.deepEqual((await ana.call('GET', '/catalogs')).body.items, []);
  });

  it('el script valida el archivo y solo importa con --apply', async () => {
    const bad = join(dir, 'malo.csv');
    await writeFile(bad, 'code,name\nA 1,Termino\n');
    await assert.rejects(importCatalog(bad, ['--apply']), (err) => /codigo invalido/.test(err.stdout));

    const good = join(dir, 'bueno.csv');
    await writeFile(good, 'code,name\nT-001,"Termino de prueba, uno"\nT-002,Término dos\n');
    const dry = await importCatalog(good);
    assert.match(dry.stdout, /2 terminos validos/);
    assert.equal(await t.db.collection('catalogos').countDocuments(), 0, 'sin --apply no escribe');
    await importCatalog(good, ['--apply']);
    assert.equal(await t.db.collection('catalogos').countDocuments({ active: true }), 2);
  });

  it('busca sin distinguir acentos y trata la entrada como texto literal', async () => {
    const r = await ana.call('GET', '/catalogs/medicamento?q=termino dos');
    assert.equal(r.body.items.length, 1);
    assert.deepEqual(r.body.items[0], { code: 'T-002', name: 'Término dos', source: 'Fuente de prueba', version: 'v1' });
    const hostile = await ana.call('GET', `/catalogs/medicamento?q=${encodeURIComponent('(a+)+$')}`);
    assert.equal(hostile.status, 200);
    assert.deepEqual(hostile.body.items, []);
    assert.equal((await ana.call('GET', '/catalogs/inventado?q=te')).status, 400);
  });

  it('una version nueva desactiva (no borra) los terminos que ya no vienen', async () => {
    const v2 = join(dir, 'v2.csv');
    await writeFile(v2, 'code,name\nT-001,Termino de prueba uno\n');
    await run(
      process.execPath,
      [
        '--env-file=.env',
        'scripts/import-catalog.js',
        '--type',
        'medicamento',
        '--source',
        'Fuente de prueba',
        '--version',
        'v2',
        '--file',
        v2,
        '--apply',
      ],
      {
        cwd: BACKEND,
        env: { ...process.env, MONGODB_DB: t.db.databaseName },
      },
    );
    assert.equal(await t.db.collection('catalogos').countDocuments(), 2);
    assert.equal(await t.db.collection('catalogos').countDocuments({ active: true }), 1);
    assert.equal((await ana.call('GET', '/catalogs/medicamento?q=dos')).body.items.length, 0);
  });

  it('el antecedente guarda el termino elegido con su fuente y version', async () => {
    const r = await ana.call('POST', `/patients/${pid}/history`, {
      category: 'medicamento',
      description: 'Termino de prueba uno',
      catalog: { code: 'T-001', source: 'Fuente de prueba', version: 'v2' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.catalog, { code: 'T-001', source: 'Fuente de prueba', version: 'v2' });
  });
});

describe('verificacion de datos vigentes', () => {
  let allergy;

  it('confirma antecedentes vigentes sin crear version nueva', async () => {
    allergy = (await ana.call('POST', `/patients/${pid}/history`, { category: 'alergia', description: 'Alergia de prueba' })).body;
    const r = await ana.call('POST', `/patients/${pid}/history/verify`, { ids: [allergy.id] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const chart = await ana.call('GET', `/patients/${pid}/chart`);
    const item = chart.body.history.find((h) => h.id === allergy.id);
    assert.equal(item.version, 1);
    assert.ok(item.lastVerifiedAt);
    const tl = await ana.call('GET', `/patients/${pid}/timeline?types=antecedente`);
    assert.ok(tl.body.events.some((e) => e.title.startsWith('Verificado vigente')));
  });

  it('rechaza verificar una version ya sustituida', async () => {
    await ana.call('PUT', `/patients/${pid}/history/${allergy.id}`, { description: 'Alergia de prueba (actualizada)' });
    const r = await ana.call('POST', `/patients/${pid}/history/verify`, { ids: [allergy.id] });
    assert.equal(r.status, 409);
  });
});

describe('objetivos, diagnosticos y linea de tiempo', () => {
  it('el objetivo guarda indicador y periodo de seguimiento', async () => {
    const r = await ana.call('POST', `/patients/${pid}/goals`, {
      description: 'Reducir cintura',
      targetDate: null,
      periodStart: new Date().toISOString().slice(0, 10),
      indicator: { formula: 'cintura', targetValue: 80, unit: 'cm' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const a = await ana.call('GET', `/patients/${pid}/analysis`);
    const g = a.body.goals.find((x) => x.description === 'Reducir cintura');
    assert.deepEqual(g.indicator, { formula: 'cintura', targetValue: 80, unit: 'cm' });
  });

  it('el diagnostico con termino de catalogo toma su codigo', async () => {
    const ev = (await ana.call('POST', `/patients/${pid}/evaluations`)).body;
    const r = await ana.call('POST', `/patients/${pid}/diagnoses`, {
      evaluationId: ev.id,
      problem: 'Problema de prueba',
      etiology: 'Etiologia de prueba',
      signs: 'Signos de prueba',
      catalog: { code: 'DX-1', source: 'Fuente de prueba', version: 'v1' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.code, 'DX-1');
  });

  it('la linea de tiempo incluye las evaluaciones guardadas', async () => {
    const tl = await ana.call('GET', `/patients/${pid}/timeline?types=evaluacion`);
    assert.equal(tl.status, 200);
    assert.ok(tl.body.events.length >= 1);
    assert.ok(tl.body.events.every((e) => e.type === 'evaluacion' && e.ref.kind === 'evaluacion'));
  });
});
