import { http } from './http.js';

const base = (patientId) => `/patients/${Number(patientId)}`;
const hex = (id) => {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('Identificador invalido');
  return id;
};

export const analysisService = {
  get: (patientId, range) => http.get(`${base(patientId)}/analysis`, range),
  addMeasurement: (patientId, data) => http.post(`${base(patientId)}/measurements`, data),
  correctMeasurement: (patientId, measurementId, data) =>
    http.post(`${base(patientId)}/measurements/${hex(measurementId)}/corrections`, data),
  addIntake: (patientId, data) => http.post(`${base(patientId)}/intake`, data),
  addLab: (patientId, data) => http.post(`${base(patientId)}/labs`, data),
  addGoal: (patientId, data) => http.post(`${base(patientId)}/goals`, data),
  setGoalStatus: (patientId, goalId, status) => http.patch(`${base(patientId)}/goals/${hex(goalId)}`, { status }),
  addOverride: (patientId, data) => http.post(`${base(patientId)}/overrides`, data),
  cancelAppointment: (patientId, appointmentId, reason) =>
    http.post(`${base(patientId)}/appointments/${hex(appointmentId)}/cancel`, { reason }),
};

export const statsService = {
  overview: (range) =>
    http.get('/stats/overview', { ...range, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
};
