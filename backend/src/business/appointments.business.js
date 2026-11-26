import { AppointmentModel } from '../models/clinical.model.js';

// Mantiene la coleccion "citas" alineada con la "proxima cita" del expediente.
// Las citas nunca se borran: cambian de estado (programada -> realizada | cancelada) o se reprograman.
export async function syncScheduledAppointment({ patientId, nutritionistId, nextVisitAt, actorId }, session) {
  const pending = await AppointmentModel.findPending(patientId, session);

  if (!nextVisitAt) {
    if (pending) {
      await AppointmentModel.update(
        pending._id,
        { status: 'cancelada', cancelledAt: new Date(), cancelledBy: actorId, cancelReason: 'Retirada del expediente' },
        session,
      );
    }
    return;
  }

  if (pending) {
    if (pending.scheduledAt.getTime() !== nextVisitAt.getTime()) {
      await AppointmentModel.update(
        pending._id,
        { scheduledAt: nextVisitAt, rescheduledFrom: pending.scheduledAt, rescheduledBy: actorId },
        session,
      );
    }
    return;
  }

  await AppointmentModel.insert({ patientId, nutritionistId, scheduledAt: nextVisitAt, status: 'programada', createdBy: actorId }, session);
}

// Consulta atendida: cierra la cita pendiente (o registra una realizada si no habia) y agenda la siguiente.
export async function completeAppointment({ patientId, nutritionistId, nextVisitAt, actorId }, session) {
  const now = new Date();
  const pending = await AppointmentModel.findPending(patientId, session);
  let appointmentId;
  if (pending) {
    await AppointmentModel.update(pending._id, { status: 'realizada', completedAt: now, completedBy: actorId }, session);
    appointmentId = pending._id;
  } else {
    appointmentId = await AppointmentModel.insert(
      { patientId, nutritionistId, scheduledAt: now, status: 'realizada', completedAt: now, completedBy: actorId, createdBy: actorId },
      session,
    );
  }
  if (nextVisitAt) {
    await AppointmentModel.insert(
      { patientId, nutritionistId, scheduledAt: nextVisitAt, status: 'programada', createdBy: actorId },
      session,
    );
  }
  // La cita realizada es la "consulta": mediciones y notas de ese encuentro se vinculan a ella.
  return appointmentId;
}
