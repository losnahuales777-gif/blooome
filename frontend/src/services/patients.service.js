import { http } from './http.js';

const patientPath = (id, suffix = '') => `/patients/${Number(id)}${suffix}`;

export const patientsService = {
  list: async () => (await http.get('/patients')).items,
  get: async (id) => (await http.get(patientPath(id))).patient,
  create: async (data) => (await http.post('/patients', data)).patient,
  update: async (id, data) => (await http.put(patientPath(id), data)).patient,
  recordVisit: async (id, data) => (await http.post(patientPath(id, '/visits'), data)).patient,
};

export const mealPlansService = {
  get: (patientId) => http.get(patientPath(patientId, '/meal-plan')),
  save: (patientId, plan) => http.put(patientPath(patientId, '/meal-plan'), plan),
  // Propuesta de plan con IA (no guarda nada).
  suggest: (patientId, prefs) => http.post(patientPath(patientId, '/meal-plan/suggest'), prefs),
  versions: (patientId) => http.get(patientPath(patientId, '/meal-plan/versions')),
  version: (patientId, version) => http.get(patientPath(patientId, `/meal-plan/versions/${Number(version)}`)),
};
