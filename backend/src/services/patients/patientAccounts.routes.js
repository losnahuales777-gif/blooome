import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { PatientAccountsBusiness } from '../../business/patientAccounts.business.js';
import { requireAnyPermission, requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { requestContext as ctx } from '../../utils/requestContext.js';
import { id } from '../common.validator.js';

// Pacientes: directorio y datos basicos (Administrador nivel 2), invitaciones al portal y documentos
// compartidos (montado en /api/patients antes de las rutas clinicas: /directory y /basic no chocan con /:id).
const router = Router();
const phone = z
  .string()
  .trim()
  .regex(/^[0-9 +()-]{7,20}$/, 'Telefono invalido')
  .or(z.literal(''))
  .default('');
const basic = {
  fullName: z.string().trim().min(3, 'Escribe nombre y apellido').max(120),
  birthDate: z.iso.date('Fecha de nacimiento invalida'),
  sex: z.enum(['F', 'M']),
  phone,
};

router.get(
  '/directory',
  requirePermission(P.PATIENTS_BASIC),
  validate({ query: z.object({ q: z.string().trim().max(80).optional() }) }),
  async (req, res) => res.json(await PatientAccountsBusiness.directory(req.user, req.valid.query)),
);
router.post(
  '/basic',
  requirePermission(P.PATIENTS_BASIC),
  validate({ body: z.strictObject({ ...basic, nutritionistId: id }) }),
  async (req, res) => {
    res.status(201).json(await PatientAccountsBusiness.createBasic(req.user, req.valid.body, ctx(req)));
  },
);
router.put(
  '/:id/basic',
  requirePermission(P.PATIENTS_BASIC),
  validate({ params: z.strictObject({ id }), body: z.strictObject(basic) }),
  async (req, res) => {
    res.json(await PatientAccountsBusiness.updateBasic(req.user, req.valid.params.id, req.valid.body, ctx(req)));
  },
);
router.post(
  '/:id/portal-invite',
  requireAnyPermission(P.PATIENTS_INVITE),
  validate({
    params: z.strictObject({ id }),
    body: z.strictObject({ email: z.string().trim().toLowerCase().max(254).pipe(z.email('Correo invalido')) }),
  }),
  async (req, res) => res.status(201).json(await PatientAccountsBusiness.invite(req.user, req.valid.params.id, req.valid.body, ctx(req))),
);
router.patch(
  '/:id/documents/:docId/share',
  requirePermission(P.PATIENTS_MANAGE),
  validate({ params: z.strictObject({ id, docId: z.string().regex(/^[a-f0-9]{24}$/i) }), body: z.strictObject({ shared: z.boolean() }) }),
  async (req, res) =>
    res.json(
      await PatientAccountsBusiness.shareDocument(req.user, req.valid.params.id, req.valid.params.docId, req.valid.body.shared, ctx(req)),
    ),
);

export default router;
