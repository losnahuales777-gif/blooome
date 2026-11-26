import { useMemo } from 'react';
import { describePatient } from '../../models/patient.model.js';
import { patientsService } from '../../services/patients.service.js';
import { useResource } from '../hooks/useResource.js';

// Capa BUSINESS: carga los pacientes y les agrega edad, IMC y meta calorica.
export function usePatients() {
  const resource = useResource(() => patientsService.list(), []);
  const patients = useMemo(() => (resource.data ?? []).map(describePatient), [resource.data]);
  return { ...resource, patients };
}

const SIX_WEEKS_MS = 42 * 24 * 60 * 60 * 1000;

export function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

// Necesita seguimiento: sin cita agendada y mas de 6 semanas desde la ultima consulta.
export function needsFollowUp(p, now = Date.now()) {
  return !p.nextVisit && (!p.lastVisit || now - new Date(p.lastVisit).getTime() > SIX_WEEKS_MS);
}
