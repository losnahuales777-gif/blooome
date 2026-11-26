import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { AuditBusiness } from '../../business/audit.business.js';
import { ageFrom, MEALS } from '../../business/patients.business.js';
import { collection } from '../../config/database.js';
import { toObjectId } from '../../models/clinical.model.js';
import { DocumentModel } from '../../models/document.model.js';
import { MealPlanModel } from '../../models/mealPlan.model.js';
import { MeasurementModel, GoalModel } from '../../models/clinical.model.js';
import { NotificationModel } from '../../models/notification.model.js';
import { PatientModel } from '../../models/patient.model.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { requireModule } from '../../middlewares/requireModule.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/AppError.js';
import { requestContext as ctx } from '../../utils/requestContext.js';

// Portal del paciente (montado en /api/portal). AISLAMIENTO: el expediente SIEMPRE sale de la sesion
// (req.user.patientId); ninguna ruta acepta el id de un paciente, asi que no se puede pedir el de otro.
// Solo lectura de lo autorizado; el paciente no modifica diagnosticos ni registros clinicos.
const router = Router();
router.use(requireModule('portal_pacientes'), requirePermission(P.PORTAL_SELF));

async function myPatient(req) {
  if (!req.user.patientId) throw new AppError(403, 'Tu cuenta no esta vinculada a un expediente');
  const p = await PatientModel.findById(req.user.patientId);
  if (!p) throw new AppError(404, 'Expediente no encontrado');
  return p;
}

router.get('/me', async (req, res) => {
  const p = await myPatient(req);
  const id = p.identification ?? {};
  res.json({
    fullName: p.full_name,
    age: ageFrom(p.birth_date),
    sex: p.sex,
    phone: p.phone ?? '',
    email: id.email ?? '',
    address: id.address ?? '',
    emergencyContact: { name: '', relationship: '', phone: '', ...id.emergencyContact },
    nutritionistName: p.nutritionist_name ?? null,
  });
});

// Datos personales que el paciente puede actualizar (contacto). Nombre y fecha de nacimiento son oficiales.
const phone = z
  .string()
  .trim()
  .regex(/^[0-9 +()-]{7,20}$/, 'Telefono invalido')
  .or(z.literal(''));
router.put(
  '/me',
  validate({
    body: z.strictObject({
      phone,
      email: z.string().trim().toLowerCase().max(254).pipe(z.email('Correo invalido')).or(z.literal('')),
      address: z.string().trim().max(200),
      emergencyContact: z.strictObject({ name: z.string().trim().max(120), relationship: z.string().trim().max(40), phone }),
    }),
  }),
  async (req, res) => {
    const p = await myPatient(req);
    const { phone: tel, ...rest } = req.valid.body;
    await PatientModel.updateBasic(p.id, { fullName: p.full_name, birthDate: p.birth_date, sex: p.sex, phone: tel });
    await PatientModel.setIdentification(p.id, { ...(p.identification ?? {}), ...rest }, p.record_status);
    await AuditBusiness.record({ ...ctx(req), userId: req.user.id, event: 'PORTAL_PROFILE_UPDATED', details: `paciente=${p.id}` });
    res.json({ updated: true });
  },
);

router.get('/appointments', async (req, res) => {
  const p = await myPatient(req);
  const rows = await collection('citas')
    .find({ patientId: { $eq: p.id } }, { projection: { scheduledAt: 1, status: 1, completedAt: 1 } })
    .sort({ scheduledAt: -1 })
    .limit(100)
    .toArray();
  res.json({
    items: rows.map((a) => ({ id: a._id.toString(), scheduledAt: a.scheduledAt, status: a.status, completedAt: a.completedAt ?? null })),
  });
});

// Historial autorizado: mediciones, plan vigente, objetivos y documentos que el nutriologo compartio.
// No incluye notas clinicas, diagnosticos, antecedentes ni laboratorios no compartidos.
router.get('/summary', async (req, res) => {
  const p = await myPatient(req);
  const [measurements, plan, goals, documents] = await Promise.all([
    MeasurementModel.listCurrent(p.id),
    MealPlanModel.findByPatient(p.id),
    GoalModel.listByPatient(p.id),
    collection('documentos')
      .find({ patientId: { $eq: p.id }, sharedWithPatient: true }, { projection: { title: 1, contentType: 1, createdAt: 1, sharedAt: 1 } })
      .sort({ sharedAt: -1 })
      .toArray(),
  ]);
  await AuditBusiness.record({ ...ctx(req), userId: req.user.id, event: 'PORTAL_VIEWED', details: `paciente=${p.id}` });
  res.json({
    measurements: measurements.map((m) => ({
      takenAt: m.takenAt,
      weightKg: m.values?.weightKg ?? null,
      waistCm: m.values?.waistCm ?? null,
      bodyFatPct: m.values?.bodyFatPct ?? null,
    })),
    plan: plan.version
      ? {
          version: plan.version,
          updatedAt: plan.updatedAt,
          meals: Object.fromEntries(
            MEALS.map((m) => [m, plan.items.filter((i) => i.meal === m).map((i) => ({ name: i.name, portion: i.portion }))]),
          ),
        }
      : null,
    goals: goals.map((g) => ({ description: g.description, status: g.status, targetDate: g.targetDate ?? null })),
    documents: documents.map((d) => ({ id: d._id.toString(), title: d.title, contentType: d.contentType, sharedAt: d.sharedAt })),
  });
});

router.get(
  '/documents/:docId/file',
  validate({ params: z.strictObject({ docId: z.string().regex(/^[a-f0-9]{24}$/i) }) }),
  async (req, res) => {
    const p = await myPatient(req);
    const d = await collection('documentos').findOne({
      _id: toObjectId(req.valid.params.docId),
      patientId: { $eq: p.id },
      sharedWithPatient: true,
    });
    if (!d) throw new AppError(404, 'Documento no encontrado');
    await AuditBusiness.record({
      ...ctx(req),
      userId: req.user.id,
      event: 'DOCUMENT_DOWNLOADED',
      details: `paciente=${p.id} documento=${d._id} portal`,
    });
    res.set({
      'Content-Type': d.contentType,
      'Content-Disposition': `attachment; filename="${d.filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.send(await DocumentModel.readFile(d.fileId));
  },
);

router.get('/notifications', async (req, res) => {
  const rows = await NotificationModel.listByUser(req.user.id);
  res.json({
    items: rows.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      read: Boolean(n.readAt),
    })),
  });
});

router.post(
  '/notifications/:nid/read',
  validate({ params: z.strictObject({ nid: z.string().regex(/^[a-f0-9]{24}$/i) }) }),
  async (req, res) => {
    if (!(await NotificationModel.markRead(req.user.id, req.valid.params.nid))) throw new AppError(404, 'Notificacion no encontrada');
    res.json({ read: true });
  },
);

export default router;
