import { http } from './http.js';

const pid = (id) => Number(id);
const hex = (id) => {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('Identificador invalido');
  return id;
};

// Sistema, configuracion y actividad (paneles de administracion).
export const systemService = {
  public: () => http.get('/system/public'),
  settings: () => http.get('/system/settings'),
  updateModules: (data) => http.put('/system/settings/modules', data),
  updateSecurity: (data) => http.put('/system/settings/security', data),
  updateTechnical: (data) => http.put('/system/settings/technical', data),
  health: () => http.get('/system/health'),
  errors: () => http.get('/system/errors'),
  backups: () => http.get('/system/backups'),
  createBackup: () => http.post('/system/backups'),
  activity: () => http.get('/system/activity'),
};

// Pacientes: directorio y datos basicos (Administrador nivel 2), invitaciones y documentos compartidos.
export const patientAccountsService = {
  directory: (q) => http.get('/patients/directory', q ? { q } : undefined),
  createBasic: (data) => http.post('/patients/basic', data),
  updateBasic: (id, data) => http.put(`/patients/${pid(id)}/basic`, data),
  invite: (id, email) => http.post(`/patients/${pid(id)}/portal-invite`, { email }),
  share: (id, docId, shared) => http.patch(`/patients/${pid(id)}/documents/${hex(docId)}/share`, { shared }),
};

// Portal del paciente: todo se refiere a su propio expediente (lo decide el servidor).
export const portalService = {
  me: () => http.get('/portal/me'),
  updateMe: (data) => http.put('/portal/me', data),
  appointments: () => http.get('/portal/appointments'),
  summary: () => http.get('/portal/summary'),
  documentFile: (docId) => http.download(`/portal/documents/${hex(docId)}/file`),
  notifications: () => http.get('/portal/notifications'),
  markRead: (id) => http.post(`/portal/notifications/${hex(id)}/read`),
};
