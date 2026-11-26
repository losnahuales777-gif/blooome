import { http } from './http.js';

const base = (pid) => `/patients/${Number(pid)}`;
const hex = (id) => {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('Identificador invalido');
  return id;
};

// Expediente clinico (etapa 1).
export const chartService = {
  get: (pid) => http.get(`${base(pid)}/chart`),
  updateIdentification: (pid, data) => http.put(`${base(pid)}/identification`, data),
  addHistory: (pid, data) => http.post(`${base(pid)}/history`, data),
  updateHistory: (pid, historyId, data) => http.put(`${base(pid)}/history/${hex(historyId)}`, data),
  verifyHistory: (pid, ids, appointmentId = null) => http.post(`${base(pid)}/history/verify`, { ids, appointmentId }),
  historyVersions: (pid, historyId) => http.get(`${base(pid)}/history/${hex(historyId)}/versions`),
  createNote: (pid, data) => http.post(`${base(pid)}/notes`, data),
  getNote: (pid, noteId) => http.get(`${base(pid)}/notes/${hex(noteId)}`),
  saveDraft: (pid, noteId, data) => http.put(`${base(pid)}/notes/${hex(noteId)}/draft`, data),
  signNote: (pid, noteId) => http.post(`${base(pid)}/notes/${hex(noteId)}/sign`, { confirm: true }),
  addAddendum: (pid, noteId, text) => http.post(`${base(pid)}/notes/${hex(noteId)}/addenda`, { text }),
  createEvaluation: (pid) => http.post(`${base(pid)}/evaluations`),
  createDiagnosis: (pid, data) => http.post(`${base(pid)}/diagnoses`, data),
  setDiagnosisStatus: (pid, id, status, note = '') => http.patch(`${base(pid)}/diagnoses/${hex(id)}`, { status, note }),
  timeline: (pid, query) => http.get(`${base(pid)}/timeline`, query),
};

// Listas de trabajo de las secciones del menu.
export const worklistsService = {
  records: () => http.get('/clinical/records'),
  notes: (query) => http.get('/clinical/notes', query),
  agenda: (query) => http.get('/clinical/agenda', query),
  labs: (query) => http.get('/clinical/labs', query),
  evaluations: (query) => http.get('/clinical/evaluations', query),
};

// Catalogos autorizados (si no hay ninguno cargado, los formularios usan texto libre).
export const catalogService = {
  summary: () => http.get('/catalogs'),
  search: (type, q) => http.get(`/catalogs/${encodeURIComponent(type)}`, { q }),
};

// Alertas clinicas configurables (etapa 4).
const ruleId = (id) => hex(id);
export const alertsService = {
  rules: () => http.get('/alerts/rules'),
  createRule: (data) => http.post('/alerts/rules', data),
  updateRule: (id, data) => http.put(`/alerts/rules/${ruleId(id)}`, data),
  ruleVersions: (id) => http.get(`/alerts/rules/${ruleId(id)}/versions`),
  forPatient: (pid, status = 'pendiente') => http.get(`${base(pid)}/alerts`, { status }),
  review: (pid, key, status, note = '') => http.post(`${base(pid)}/alerts/review`, { key, status, note }),
  worklist: (status = 'pendiente') => http.get('/clinical/alerts', { status }),
};

// Documentos del expediente: reportes PDF y adjuntos (etapa 5).
export const documentsService = {
  list: (pid) => http.get(`${base(pid)}/documents`),
  generate: (pid, data) => http.post(`${base(pid)}/reports`, data),
  upload: (pid, file, description) =>
    http.upload(`${base(pid)}/documents`, file, { 'Content-Type': file.type || 'application/octet-stream', 'X-Document-Description': encodeURIComponent(description) }),
  download: (pid, docId) => http.download(`${base(pid)}/documents/${hex(docId)}/file`),
};

// Privacidad (etapa 6): consentimientos, conservacion y exportacion FHIR.
export const consentsService = {
  list: (pid) => http.get(`${base(pid)}/consents`),
  record: (pid, data) => http.post(`${base(pid)}/consents`, data),
};
export const privacyService = {
  retention: () => http.get('/privacy/retention'),
  fhir: (pid) => http.download(`${base(pid)}/fhir`),
};
