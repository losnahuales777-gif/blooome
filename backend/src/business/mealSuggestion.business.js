import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { env } from '../config/env.js';
import { DiagnosisModel, HistoryModel } from '../models/chart.model.js';
import { normalize } from '../models/catalog.model.js';
import { AppError } from '../utils/AppError.js';
import { AnalysisBusiness } from './analysis.business.js';
import { AuditBusiness } from './audit.business.js';
import { SettingsBusiness } from './settings.business.js';
import { ageFrom, getAccessible, MEALS } from './patients.business.js';
import { currentConsents } from './privacy.business.js';

// Sugerencia de plan alimenticio con IA, guiada por la skill "nutriplan" (assets/skills/nutriplan.md).
// Proveedor segun AI_PROVIDER: Claude (Anthropic, predeterminado) o Gemini (Google AI Studio).
//
// - Solo se envian datos SIN identificar: nada de nombre, contacto, expediente ni fecha de nacimiento.
// - Consentimiento "ia_asistente": su registro previo es configurable (Sistema > Seguridad); una negativa
//   o revocacion del paciente siempre bloquea.
// - Es una PROPUESTA: no se guarda. El profesional la revisa en el editor y, si la acepta, se guarda
//   como una version del plan con su origen.
// - Con condiciones de riesgo la propuesta lleva advertencias y el profesional debe confirmar su revision.

const SKILL = readFileSync(new URL('../../assets/skills/nutriplan.md', import.meta.url), 'utf8');

// Adaptacion de la skill al uso dentro de Bloome (estable: forma parte del prefijo en cache).
const SYSTEM_PROMPT = `${SKILL}

---

# Uso dentro de Bloome (prevalece sobre la seccion de formato de la skill)

Quien te escribe es un nutriologo que atiende a un paciente adulto (18 a 60 anos) en consulta. Tu propuesta es un borrador que el profesional revisara y ajustara antes de usarlo; no te diriges al paciente.

- Trabaja con los datos sin identificar del perfil. No pidas mas datos: si falta algo, decide un supuesto razonable y anotalo en "assumptions".
- Si el perfil trae condiciones de riesgo de la seccion 2 de la skill (enfermedades, medicamentos, alergias, embarazo o lactancia, TCA), elabora una propuesta general y conservadora, sin dieta terapeutica, y explica en "warnings" que requiere el criterio clinico del profesional. Nunca diagnostiques ni ajustes medicamentos.
- Respeta estrictamente las alergias e intolerancias: no incluyas esos alimentos ni sus derivados.
- Usa la energia y la distribucion de macronutrientes del perfil como referencia aproximada (calculadas por el motor de Bloome); no la presentes como exacta.
- Devuelve un dia tipo con cinco tiempos (desayuno, colacion1, comida, colacion2, cena). Cada alimento lleva: nombre corto (maximo 80 caracteres), porcion domestica (maximo 30 caracteres) y proteina, carbohidratos y grasa en gramos estimados para esa porcion.
- Prioriza alimentos accesibles en Mexico, porciones caseras y preparaciones sencillas.
- "shoppingList" agrupa por las secciones de la skill para 7 dias; "substitutions" da alternativas economicas; "followUp" sugiere que revisar en 1 a 2 semanas.
- Todos los textos en espanol, claros y sin juicios.`;

const food = z.object({
  name: z.string(),
  portion: z.string(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

// Esquema de la respuesta (salida estructurada validada por el SDK).
export const SuggestionSchema = z.object({
  summary: z.string(),
  approach: z.string(),
  warnings: z.array(z.string()),
  assumptions: z.array(z.string()),
  meals: z.object({
    desayuno: z.array(food),
    colacion1: z.array(food),
    comida: z.array(food),
    colacion2: z.array(food),
    cena: z.array(food),
  }),
  shoppingList: z.array(z.object({ section: z.string(), items: z.array(z.string()) })),
  substitutions: z.array(z.string()),
  followUp: z.string(),
});

let client = null;
// Solo para pruebas automaticas: permite simular la respuesta del modelo sin costo ni red.
let testClient = null;
export function setTestClient(c) {
  if (env.NODE_ENV !== 'test') throw new Error('Solo disponible en pruebas');
  testClient = c;
}
const getClient = () => {
  if (testClient) return testClient;
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError(503, 'El asistente de IA no esta configurado: agrega ANTHROPIC_API_KEY en backend/.env');
  }
  // Tiempo maximo por intento y un reintento ante errores transitorios (429/5xx/red).
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 1 });
  return client;
};

// --- Gemini (Google AI Studio, API REST generateContent con salida JSON validada por el esquema) ---
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// Esquema JSON derivado del mismo esquema zod (sin la clave $schema, que la API no acepta).
const { $schema: _ignored, ...GEMINI_SCHEMA } = z.toJSONSchema(SuggestionSchema);
const GEMINI_RETRYABLE = new Set([403, 429, 500, 503]); // 403 intermitente en proyectos recien habilitados
const GEMINI_BLOCKED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

// Solo para pruebas automaticas: fuerza proveedor y clave de Gemini sin tocar la configuracion.
let providerOverride = null;
export function setTestProvider(o) {
  if (env.NODE_ENV !== 'test') throw new Error('Solo disponible en pruebas');
  providerOverride = o;
}
const aiProvider = () => providerOverride?.provider ?? env.AI_PROVIDER;
const geminiKey = () => providerOverride?.key ?? env.GEMINI_API_KEY;

async function callGemini(userText) {
  if (!geminiKey()) throw new AppError(503, 'El asistente de IA no esta configurado: agrega GEMINI_API_KEY en backend/.env');
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: GEMINI_SCHEMA, maxOutputTokens: 16000 },
  });
  let res;
  let data;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // La clave viaja en cabecera, no en la URL (no queda en registros de proxies).
      res = await fetch(`${GEMINI_URL}/${env.GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey() },
        body,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      if (err.name === 'TimeoutError') throw new AppError(504, 'El asistente tardo demasiado; intenta de nuevo');
      if (attempt === 3) throw new AppError(502, 'No se pudo conectar con el asistente de IA; intenta de nuevo');
      continue;
    }
    data = await res.json().catch(() => ({}));
    if (res.ok || !GEMINI_RETRYABLE.has(res.status) || attempt === 3) break;
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  if (!res.ok) {
    const reason = data?.error?.details?.find((d) => d.reason)?.reason;
    if (res.status === 400 && reason === 'API_KEY_INVALID') throw new AppError(503, 'La clave de Gemini (GEMINI_API_KEY) no es valida');
    if (res.status === 401 || res.status === 403)
      throw new AppError(503, 'La clave de Gemini no tiene acceso al modelo: habilita la API de Gemini en tu proyecto de Google o revisa GEMINI_MODEL');
    if (res.status === 404) throw new AppError(503, `El modelo ${env.GEMINI_MODEL} no esta disponible para esta clave; cambia GEMINI_MODEL`);
    if (res.status === 429) throw new AppError(429, 'El asistente esta saturado o se agoto la cuota gratuita; intenta mas tarde');
    throw new AppError(502, 'El asistente de IA no respondio correctamente; intenta de nuevo');
  }
  const cand = data.candidates?.[0];
  const meta = data.usageMetadata ?? {};
  const usage = { input: meta.promptTokenCount ?? 0, cache: meta.cachedContentTokenCount ?? 0, output: meta.candidatesTokenCount ?? 0 };
  const model = data.modelVersion ?? env.GEMINI_MODEL;
  if (data.promptFeedback?.blockReason || GEMINI_BLOCKED.has(cand?.finishReason)) return { model, usage, outcome: 'refusal' };
  if (cand?.finishReason === 'MAX_TOKENS') return { model, usage, outcome: 'incomplete' };
  const text = (cand?.content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('');
  let parsed;
  try {
    parsed = SuggestionSchema.parse(JSON.parse(text));
  } catch {
    return { model, usage, outcome: 'incomplete' };
  }
  return { model, usage, outcome: 'ok', parsed };
}

// --- Claude (Anthropic SDK, salida estructurada con zod) ---
async function callClaude(userText) {
  let response;
  try {
    response = await getClient().beta.messages.parse({
      model: env.AI_MODEL,
      max_tokens: 16000,
      // Si el modelo declina por politica, la API reintenta con un modelo de respaldo en la misma llamada.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(SuggestionSchema) },
      // La skill es estable: se guarda en cache para abaratar las siguientes sugerencias.
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userText }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AppError(503, 'La clave de la API de Anthropic no es valida');
    if (err instanceof Anthropic.RateLimitError) throw new AppError(429, 'El asistente esta saturado; intenta en unos minutos');
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AppError(504, 'El asistente tardo demasiado; intenta de nuevo');
    if (err instanceof Anthropic.APIError) throw new AppError(502, 'El asistente de IA no respondio correctamente; intenta de nuevo');
    throw err;
  }
  const usage = { input: response.usage.input_tokens, cache: response.usage.cache_read_input_tokens ?? 0, output: response.usage.output_tokens };
  if (response.stop_reason === 'refusal') return { model: response.model, usage, outcome: 'refusal' };
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) return { model: response.model, usage, outcome: 'incomplete' };
  return { model: response.model, usage, outcome: 'ok', parsed: response.parsed_output };
}

// Las pruebas automaticas simulan Claude (setTestClient) sin importar el proveedor configurado.
const callModel = (userText) => (aiProvider() === 'gemini' && !testClient ? callGemini(userText) : callClaude(userText));

const clampNum = (v) => (Number.isFinite(v) ? Math.min(300, Math.max(0, Math.round(v * 10) / 10)) : 0);
const clip = (s, n) =>
  String(s ?? '')
    .trim()
    .slice(0, n);

// Perfil SIN identificar que se envia al modelo (minimo necesario para la skill).
function buildProfile(patient, analysis, history, diagnoses, prefs) {
  const active = (cat) => history.filter((h) => h.category === cat && h.status === 'activo').map((h) => h.description);
  const result = (f) => analysis.evaluation.find((r) => r.formula === f)?.effectiveValue ?? null;
  const conditions = {
    alergias_intolerancias: active('alergia'),
    enfermedades: active('enfermedad'),
    medicamentos: active('medicamento'),
    suplementos: active('suplemento'),
    ginecoobstetricos_vigentes: active('ginecoobstetrico'),
    diagnosticos_nutricionales: diagnoses.filter((d) => d.status === 'activo').map((d) => d.problem),
  };
  const severeAllergy = history.some((h) => h.category === 'alergia' && h.status === 'activo' && h.severity === 'grave');
  const riskFlags = [
    conditions.enfermedades.length && 'Enfermedades registradas',
    conditions.medicamentos.length && 'Medicamentos vigentes',
    severeAllergy && 'Alergia grave registrada',
    conditions.ginecoobstetricos_vigentes.length && 'Antecedentes ginecoobstetricos vigentes',
    conditions.diagnosticos_nutricionales.length && 'Diagnosticos nutricionales activos',
  ].filter(Boolean);
  return {
    profile: {
      edad: ageFrom(patient.birth_date),
      sexo: patient.sex === 'F' ? 'femenino' : 'masculino',
      actividad: patient.activity,
      objetivo: patient.goal,
      peso_kg: patient.weight_kg ?? null,
      estatura_cm: patient.height_cm ?? null,
      cintura_cm: patient.waist_cm ?? null,
      peso_objetivo_kg: patient.target_weight_kg ?? null,
      energia_objetivo_kcal_aprox: result('objetivo_energetico'),
      macronutrientes_aprox_g: result('distribucion_macronutrientes'),
      condiciones: conditions,
      preferencias: prefs,
      region: 'Mexico',
    },
    riskFlags,
    allergyTerms: conditions.alergias_intolerancias,
  };
}

export const MealSuggestionBusiness = {
  async suggest(actor, patientId, prefs, ctx) {
    const patient = await getAccessible(actor, patientId);
    const consent = (await currentConsents([patientId])).get(patientId)?.ia_asistente;
    // Una negativa o revocacion expresa del paciente siempre bloquea. Exigir el registro previo del
    // consentimiento es configurable por el superusuario (Sistema > Seguridad).
    if (consent?.status === 'negado' || consent?.status === 'revocado') {
      throw new AppError(409, 'El paciente nego o revoco su consentimiento para usar el asistente de IA; no se puede usar con su expediente.');
    }
    const { aiRequiresConsent } = (await SettingsBusiness.get()).security;
    if (aiRequiresConsent !== false && consent?.status !== 'otorgado') {
      throw new AppError(
        409,
        'El paciente aun no ha otorgado su consentimiento para usar el asistente de IA. Registralo en Historia clinica > Privacidad y consentimiento.',
      );
    }
    const [analysis, history, diagnoses] = await Promise.all([
      AnalysisBusiness.getAnalysis(actor, patientId, { from: new Date(Date.now() - 183 * 86400000), to: new Date() }),
      HistoryModel.listCurrent(patientId),
      DiagnosisModel.listByPatient(patientId),
    ]);
    const { profile, riskFlags, allergyTerms } = buildProfile(patient, analysis, history, diagnoses, prefs);

    const response = await callModel(
      `Perfil del paciente (sin datos identificativos):\n${JSON.stringify(profile, null, 2)}\n\nElabora la propuesta de plan alimenticio.`,
    );
    if (response.outcome === 'refusal') throw new AppError(422, 'El asistente no pudo elaborar una propuesta para este perfil');
    if (response.outcome !== 'ok') throw new AppError(502, 'La propuesta llego incompleta; intenta de nuevo');

    // Normaliza y aplica las alergias registradas como filtro duro.
    const s = response.parsed;
    const warnings = [...s.warnings.map((w) => clip(w, 400))];
    const removed = [];
    const meals = Object.fromEntries(
      MEALS.map((m) => [
        m,
        (s.meals[m] ?? [])
          .filter((f) => {
            const hit = allergyTerms.find((a) => normalize(f.name).includes(normalize(a)) || normalize(a).includes(normalize(f.name)));
            if (hit) removed.push(`${f.name} (coincide con "${hit}")`);
            return !hit;
          })
          .slice(0, 20)
          .map((f) => ({
            name: clip(f.name, 80),
            portion: clip(f.portion, 30),
            protein: clampNum(f.protein),
            carbs: clampNum(f.carbs),
            fat: clampNum(f.fat),
          }))
          .filter((f) => f.name && f.portion),
      ]),
    );
    if (removed.length) warnings.unshift(`Se quitaron alimentos que coinciden con alergias registradas: ${removed.join(', ')}.`);
    if (riskFlags.length) warnings.unshift(`Condiciones que requieren criterio profesional: ${riskFlags.join(', ')}.`);

    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: 'AI_MEAL_PLAN_SUGGESTED',
      details: `paciente=${patientId} proveedor=${testClient ? 'anthropic' : aiProvider()} modelo=${response.model} entrada=${response.usage.input} cache=${response.usage.cache} salida=${response.usage.output}`,
    });

    return {
      model: response.model,
      generatedAt: new Date(),
      requiresReview: riskFlags.length > 0,
      riskFlags,
      summary: clip(s.summary, 1500),
      approach: clip(s.approach, 2000),
      warnings,
      assumptions: s.assumptions.map((a) => clip(a, 300)).slice(0, 20),
      meals,
      shoppingList: s.shoppingList
        .slice(0, 10)
        .map((g) => ({ section: clip(g.section, 60), items: g.items.map((i) => clip(i, 80)).slice(0, 30) })),
      substitutions: s.substitutions.map((x) => clip(x, 300)).slice(0, 15),
      followUp: clip(s.followUp, 800),
      // Lo que se envio (para transparencia ante el paciente): perfil sin identificar.
      sentProfile: profile,
    };
  },
};
