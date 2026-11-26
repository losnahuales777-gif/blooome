import { collection } from '../config/database.js';
import { NotificationModel } from '../models/notification.model.js';
import { PatientModel } from '../models/patient.model.js';
import { RoleModel } from '../models/role.model.js';
import { UserModel } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { generateCode, hashCode } from '../utils/oneTimeCode.js';
import { PERMISSIONS, ROLES } from './access.business.js';
import { AuditBusiness } from './audit.business.js';
import { recordNumber } from './chart.business.js';
import { AGE_RANGE, ageFrom, getAccessible } from './patients.business.js';
import { SettingsBusiness } from './settings.business.js';

// Cuentas y datos basicos de pacientes (Administrador nivel 2) e invitaciones al portal.
// Nada de este modulo expone informacion clinica.
const INVITE_HOURS = 72;

function assertAge(birthDate) {
  const age = ageFrom(birthDate);
  if (age < AGE_RANGE.min || age > AGE_RANGE.max)
    throw new AppError(400, `La edad debe estar entre ${AGE_RANGE.min} y ${AGE_RANGE.max} anos`);
}

async function assertNutritionist(id) {
  const u = await UserModel.findActiveById(id);
  if (!u || u.role !== ROLES.NUTRITIONIST) throw new AppError(400, 'El profesional asignado debe ser un nutriologo activo');
}

const accountStatus = (acct) => (!acct ? 'sin_cuenta' : acct.isActive ? 'activa' : acct.oneTimeCode ? 'invitacion_pendiente' : 'inactiva');

// Avisa al paciente en su portal (si tiene cuenta activa). Nunca falla la operacion principal.
export async function notifyPatient(patientId, { type, title, body = '' }) {
  try {
    const u = await UserModel.findByPatientId(patientId);
    if (u?.is_active) await NotificationModel.create({ userId: u.id, type, title, body });
  } catch {
    // La notificacion es accesoria.
  }
}

export const PatientAccountsBusiness = {
  async directory(_actor, { q }) {
    const rows = await PatientModel.directory({ q });
    return {
      items: rows.map((p) => ({
        id: p._id,
        recordNumber: recordNumber(p._id),
        fullName: p.fullName,
        birthDate: p.birthDate,
        age: ageFrom(p.birthDate),
        sex: p.sex,
        recordStatus: p.recordStatus ?? (p.isActive === false ? 'inactivo' : 'activo'),
        intakePending: Boolean(p.intakePending),
        nutritionistId: p.nutritionistId,
        nutritionistName: p.nutritionist?.[0]?.fullName ?? null,
        portal: { status: accountStatus(p.acct?.[0]), email: p.acct?.[0]?.email ?? null },
      })),
    };
  },

  async createBasic(actor, data, ctx) {
    assertAge(data.birthDate);
    await assertNutritionist(data.nutritionistId);
    const id = await PatientModel.createBasic(data.nutritionistId, data, actor.id);
    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: 'PATIENT_REGISTERED_BASIC',
      details: `id=${id} nutriologo=${data.nutritionistId}`,
    });
    return { id, recordNumber: recordNumber(id) };
  },

  async updateBasic(actor, patientId, data, ctx) {
    const p = await PatientModel.findById(patientId);
    if (!p) throw new AppError(404, 'Paciente no encontrado');
    assertAge(data.birthDate);
    await PatientModel.updateBasic(patientId, data);
    await AuditBusiness.record({ ...ctx, userId: actor.id, event: 'PATIENT_BASIC_UPDATED', details: `id=${patientId}` });
    return { id: patientId };
  },

  // Invitacion al portal: crea (o renueva) la cuenta del paciente vinculada a SU expediente y devuelve un
  // codigo de un solo uso. El nutriologo solo invita a sus pacientes; el Administrador nivel 2, a cualquiera.
  async invite(actor, patientId, { email }, ctx) {
    if (!(await SettingsBusiness.isModuleEnabled('portal_pacientes'))) throw new AppError(403, 'El portal de pacientes esta desactivado');
    const patient = actor.permissions.has(PERMISSIONS.PATIENTS_BASIC)
      ? await PatientModel.findById(patientId)
      : await getAccessible(actor, patientId);
    if (!patient) throw new AppError(404, 'Paciente no encontrado');

    const role = await RoleModel.findByCode(ROLES.PATIENT);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + INVITE_HOURS * 3600000);
    let account = await UserModel.findByPatientId(patientId);
    if (account?.is_active) throw new AppError(409, 'El paciente ya tiene una cuenta activa en el portal');
    if (!account) {
      const clash = await UserModel.findByEmail(email);
      if (clash) throw new AppError(409, 'Ese correo ya esta registrado');
      const id = await UserModel.create({
        email,
        fullName: patient.full_name,
        passwordHash: null,
        roleId: role.id,
        createdBy: actor.id,
        patientId,
        isActive: false,
      });
      account = await UserModel.findById(id);
    }
    await UserModel.setOneTimeCode(account.id, { codeHash: hashCode(code), purpose: 'invite', expiresAt });
    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: 'PATIENT_INVITED',
      details: `paciente=${patientId} cuenta=${account.id}`,
    });
    return { code, email: account.email, expiresInHours: INVITE_HOURS };
  },

  // El nutriologo comparte (o deja de compartir) un documento con el paciente en su portal.
  async shareDocument(actor, patientId, docId, shared, ctx) {
    await getAccessible(actor, patientId);
    const { toObjectId } = await import('../models/clinical.model.js');
    const r = await collection('documentos').updateOne(
      { _id: toObjectId(docId), patientId: { $eq: patientId } },
      { $set: { sharedWithPatient: shared, sharedAt: shared ? new Date() : null, sharedBy: actor.id } },
    );
    if (!r.matchedCount) throw new AppError(404, 'Documento no encontrado');
    if (shared) await notifyPatient(patientId, { type: 'documento', title: 'Tienes un documento nuevo disponible' });
    await AuditBusiness.record({
      ...ctx,
      userId: actor.id,
      event: shared ? 'DOCUMENT_SHARED' : 'DOCUMENT_UNSHARED',
      details: `paciente=${patientId} documento=${docId}`,
    });
    return { shared };
  },
};
