import { collection } from '../config/database.js';
import { env } from '../config/env.js';
import { AuditModel } from '../models/audit.model.js';

// Configuracion del aplicativo guardada en la base (coleccion "configuracion", documento "general"):
// - modules: modulos activables (superusuario).
// - security: parametros de seguridad (superusuario).
// - technical: parametros tecnicos (administrador de Sistemas).
// Los valores de .env son los valores por defecto. Se cachea unos segundos para no leer en cada peticion.

export const MODULES = Object.freeze({
  portal_pacientes: 'Portal de pacientes',
  asistente_ia: 'Asistente de IA para planes alimenticios',
  alertas: 'Alertas clinicas',
  catalogos: 'Catalogos autorizados',
  reportes_pdf: 'Reportes PDF y documentos',
});

const defaults = () => ({
  modules: Object.fromEntries(Object.keys(MODULES).map((m) => [m, true])),
  security: {
    sessionIdleMinutes: env.SESSION_IDLE_MINUTES,
    loginMaxAttempts: env.LOGIN_MAX_ATTEMPTS,
    loginLockMinutes: env.LOGIN_LOCK_MINUTES,
    // Exigir el consentimiento "ia_asistente" registrado antes de usar el asistente de IA.
    aiRequiresConsent: true,
  },
  technical: { maintenanceMessage: '' },
});

let cache = null;
let cachedAt = 0;
const TTL_MS = 15_000;

export const SettingsBusiness = {
  async get() {
    if (cache && Date.now() - cachedAt < TTL_MS) return cache;
    const doc = (await collection('configuracion').findOne({ _id: 'general' })) ?? {};
    const d = defaults();
    cache = {
      modules: { ...d.modules, ...doc.modules },
      security: { ...d.security, ...doc.security },
      technical: { ...d.technical, ...doc.technical },
      updatedAt: doc.updatedAt ?? null,
    };
    cachedAt = Date.now();
    return cache;
  },

  async isModuleEnabled(name) {
    return (await this.get()).modules[name] !== false;
  },

  // section: modules | security | technical. Cada cambio queda en la auditoria con el valor anterior y el nuevo.
  async update(actor, section, values, ctx) {
    const before = (await this.get())[section];
    const set = Object.fromEntries(Object.entries(values).map(([k, v]) => [`${section}.${k}`, v]));
    await collection('configuracion').updateOne(
      { _id: 'general' },
      { $set: { ...set, updatedAt: new Date(), updatedBy: actor.id } },
      { upsert: true },
    );
    cache = null;
    const diff = Object.entries(values)
      .filter(([k, v]) => before[k] !== v)
      .map(([k, v]) => `${k}:${before[k]}->${v}`)
      .join(' ');
    await AuditModel.log({ ...ctx, userId: actor.id, event: `SETTINGS_${section.toUpperCase()}_UPDATED`, details: diff || 'sin cambios' });
    return this.get();
  },

  invalidate() {
    cache = null;
  },
};
