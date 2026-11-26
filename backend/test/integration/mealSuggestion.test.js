// Sugerencia de plan con IA (skill nutriplan): consentimiento, datos sin identificar, filtro de
// alergias y advertencias. El modelo se simula: estas pruebas no llaman a la API ni tienen costo.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestApi } from './helpers.js';

let t;
let ana;
let pid;
let requests = [];
const year = new Date().getFullYear();
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 3)]);
const food = (name) => ({ name, portion: '1 taza', protein: 5, carbs: 20, fat: 2 });

const fakeClient = {
  beta: {
    messages: {
      parse: async (params) => {
        requests.push(params);
        return {
          model: 'modelo-simulado',
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 },
          parsed_output: {
            summary: 'Resumen de prueba',
            approach: 'Enfoque de prueba',
            warnings: ['Advertencia del modelo'],
            assumptions: ['Supuesto de prueba'],
            meals: {
              desayuno: [food('Avena con fruta'), food('Cacahuate tostado')],
              colacion1: [food('Manzana')],
              comida: [food('Frijoles')],
              colacion2: [],
              cena: [food('Quesadilla')],
            },
            shoppingList: [{ section: 'Frutas y verduras', items: ['Manzana'] }],
            substitutions: ['Sustitucion de prueba'],
            followUp: 'Revisar en dos semanas',
          },
        };
      },
    },
  },
};

before(async () => {
  t = await startTestApi();
  await t.createUser('ana@prueba.test', 'Ana Prueba', 1);
  ana = await t.session('ana@prueba.test');
  pid = (
    await ana.call('POST', '/patients', {
      fullName: 'Paciente Nombre Privado',
      birthDate: `${year - 33}-08-08`,
      sex: 'F',
      weightKg: 68,
      heightCm: 162,
      waistCm: 82,
      activity: 'ligera',
      goal: 'perder',
      phone: '55 9999 0000',
    })
  ).body.patient.id;
  await ana.call('POST', `/patients/${pid}/history`, { category: 'alergia', description: 'Cacahuate', severity: 'grave' });
});

after(async () => t?.stop());

describe('sugerencia de plan con IA', () => {
  it('exige el consentimiento de IA del paciente', async () => {
    const r = await ana.call('POST', `/patients/${pid}/meal-plan/suggest`, {});
    assert.equal(r.status, 409);
    assert.match(r.body.error, /consentimiento/);
  });

  it('sin clave de API la funcion responde que no esta configurada', async () => {
    const doc = await (
      await ana.raw('POST', `/patients/${pid}/documents`, PNG, {
        'Content-Type': 'image/png',
        'X-Document-Description': 'Consentimiento IA',
      })
    ).json();
    const c = await ana.call('POST', `/patients/${pid}/consents`, {
      type: 'ia_asistente',
      status: 'otorgado',
      noticeVersion: '2026-01',
      method: 'firma_autografa',
      evidenceDocumentId: doc.id,
    });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const { env } = await import('../../src/config/env.js');
    if (env.ANTHROPIC_API_KEY) return; // con clave real no se prueba este caso (evita costo)
    assert.equal((await ana.call('POST', `/patients/${pid}/meal-plan/suggest`, {})).status, 503);
  });

  it('envia solo datos sin identificar, quita alergenos y marca la revision obligatoria', async () => {
    const { setTestClient } = await import('../../src/business/mealSuggestion.business.js');
    setTestClient(fakeClient);
    requests = [];
    const r = await ana.call('POST', `/patients/${pid}/meal-plan/suggest`, { preferences: 'Le gusta la avena', budget: 'Bajo' });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const sent = JSON.stringify(requests[0].messages);
    for (const secret of ['Paciente Nombre Privado', '55 9999 0000', `${year - 33}-08-08`, 'BL-'])
      assert.ok(!sent.includes(secret), `no envia ${secret}`);
    assert.ok(sent.includes('Cacahuate') && sent.includes('Le gusta la avena'));
    assert.equal(requests[0].system[0].cache_control.type, 'ephemeral');
    assert.match(requests[0].system[0].text, /NutriPlan/);

    assert.deepEqual(
      r.body.meals.desayuno.map((f) => f.name),
      ['Avena con fruta'],
      'quita el alimento con alergeno',
    );
    assert.ok(r.body.warnings.some((w) => /alergias registradas/.test(w)));
    assert.equal(r.body.requiresReview, true);
    assert.ok(r.body.riskFlags.includes('Alergia grave registrada'));

    const audit = await t.db.collection('auditLog').findOne({ event: 'AI_MEAL_PLAN_SUGGESTED' });
    assert.ok(audit && !audit.details.includes('Cacahuate'), 'la auditoria no guarda datos clinicos');
    setTestClient(null);
  });

  it('una negativa del modelo o una respuesta incompleta no se presentan como propuesta', async () => {
    const { setTestClient } = await import('../../src/business/mealSuggestion.business.js');
    setTestClient({ beta: { messages: { parse: async () => ({ stop_reason: 'refusal', usage: {}, parsed_output: null }) } } });
    assert.equal((await ana.call('POST', `/patients/${pid}/meal-plan/suggest`, {})).status, 422);
    setTestClient({ beta: { messages: { parse: async () => ({ stop_reason: 'max_tokens', usage: {}, parsed_output: null }) } } });
    assert.equal((await ana.call('POST', `/patients/${pid}/meal-plan/suggest`, {})).status, 502);
    setTestClient(null);
  });

  it('con AI_PROVIDER=gemini usa Gemini con salida JSON, sin datos identificativos y con el filtro de alergias', async () => {
    const { setTestProvider } = await import('../../src/business/mealSuggestion.business.js');
    const KEY = 'clave-de-prueba-gemini-000000000';
    setTestProvider({ provider: 'gemini', key: KEY });
    const realFetch = globalThis.fetch;
    const calls = [];
    let mode = 'ok';
    const okBody = {
      modelVersion: 'gemini-simulado',
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 60 },
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [
              {
                text: JSON.stringify({
                  summary: 'Resumen Gemini',
                  approach: 'Enfoque',
                  warnings: [],
                  assumptions: [],
                  meals: { desayuno: [food('Avena'), food('Cacahuate garapinado')], colacion1: [], comida: [food('Arroz')], colacion2: [], cena: [food('Sopa')] },
                  shoppingList: [],
                  substitutions: [],
                  followUp: 'Revisar',
                }),
              },
            ],
          },
        },
      ],
    };
    globalThis.fetch = async (url, init) => {
      if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return realFetch(url, init);
      calls.push({ url: String(url), init });
      if (mode === 'flaky' && calls.length === 1) return new Response(JSON.stringify({ error: { code: 403 } }), { status: 403 });
      if (mode === 'blocked') return new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }), { status: 200 });
      if (mode === 'badjson') return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"summary":' }] } }] }), { status: 200 });
      return new Response(JSON.stringify(okBody), { status: 200 });
    };
    try {
      const r = await ana.call('POST', `/patients/${pid}/meal-plan/suggest`, { preferences: 'Le gusta la avena' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.model, 'gemini-simulado');
      assert.deepEqual(r.body.meals.desayuno.map((f) => f.name), ['Avena'], 'quita el alimento con alergeno');
      const sent = calls[0].init.body;
      for (const secret of ['Paciente Nombre Privado', '55 9999 0000', 'BL-']) assert.ok(!sent.includes(secret), `no envia ${secret}`);
      assert.equal(calls[0].init.headers['x-goog-api-key'], KEY, 'la clave va en cabecera');
      assert.ok(!calls[0].url.includes('key='), 'la clave no va en la URL');
      assert.equal(JSON.parse(sent).generationConfig.responseMimeType, 'application/json');

      mode = 'flaky';
      calls.length = 0;
      assert.equal((await ana.call('POST', `/patients/${pid}/meal-plan/suggest`, {})).status, 200, 'reintenta un 403 intermitente');
      mode = 'blocked';
      assert.equal((await ana.call('POST', `/patients/${pid}/meal-plan/suggest`, {})).status, 422);
      mode = 'badjson';
      assert.equal((await ana.call('POST', `/patients/${pid}/meal-plan/suggest`, {})).status, 502);
    } finally {
      globalThis.fetch = realFetch;
      setTestProvider(null);
    }
  });

  it('el superusuario puede quitar el requisito de consentimiento; una negativa del paciente sigue bloqueando', async () => {
    await t.createUser('root@prueba.test', 'Root Prueba', 3);
    const root = await t.session('root@prueba.test');
    const other = (
      await ana.call('POST', '/patients', {
        fullName: 'Otra Paciente',
        birthDate: `${year - 40}-02-02`,
        sex: 'F',
        weightKg: 70,
        heightCm: 160,
        activity: 'ligera',
        goal: 'mantener',
      })
    ).body.patient.id;
    assert.equal((await ana.call('POST', `/patients/${other}/meal-plan/suggest`, {})).status, 409, 'sin consentimiento, con el requisito activo');
    // Solo el superusuario cambia el ajuste.
    assert.equal((await ana.call('PUT', '/system/settings/security', { aiRequiresConsent: false })).status, 403);
    assert.equal((await root.call('PUT', '/system/settings/security', { aiRequiresConsent: false })).status, 200);

    const { setTestClient } = await import('../../src/business/mealSuggestion.business.js');
    setTestClient(fakeClient);
    const ok = await ana.call('POST', `/patients/${other}/meal-plan/suggest`, {});
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    const neg = await ana.call('POST', `/patients/${other}/consents`, { type: 'ia_asistente', status: 'negado', noticeVersion: '2026-01', method: 'verbal_documentada' });
    assert.equal(neg.status, 201, JSON.stringify(neg.body));
    const blocked = await ana.call('POST', `/patients/${other}/meal-plan/suggest`, {});
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error, /nego o revoco/);
    setTestClient(null);
    assert.ok(await t.db.collection('auditLog').findOne({ event: 'SETTINGS_SECURITY_UPDATED', details: /aiRequiresConsent:true->false/ }));
  });
});
