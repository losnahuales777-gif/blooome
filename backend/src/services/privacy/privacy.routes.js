import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { CONSENT_TYPES, PrivacyBusiness } from '../../business/privacy.business.js';
import { exportPatientBundle } from '../../fhir/fhirExport.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { requestContext as ctx } from '../../utils/requestContext.js';
import { id } from '../common.validator.js';

// Consentimientos por paciente y reporte de conservacion (montado en /api).
const router = Router();
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Identificador invalido');

router.get('/patients/:id/consents', requirePermission(P.PATIENTS_VIEW), validate({ params: z.strictObject({ id }) }), async (req, res) => {
  res.json(await PrivacyBusiness.list(req.user, req.valid.params.id));
});

router.post(
  '/patients/:id/consents',
  requirePermission(P.PATIENTS_MANAGE),
  validate({
    params: z.strictObject({ id }),
    body: z.strictObject({
      type: z.enum(Object.keys(CONSENT_TYPES)),
      status: z.enum(['otorgado', 'revocado', 'negado']),
      // Version del aviso de privacidad entregado (por ejemplo "2026-01").
      noticeVersion: z.string().trim().min(1, 'Indica la version del aviso').max(40),
      method: z.enum(['firma_autografa', 'firma_electronica', 'verbal_documentada']),
      evidenceDocumentId: objectId.nullable().default(null),
      notes: z.string().trim().max(500).default(''),
    }),
  }),
  async (req, res) => {
    res.status(201).json(await PrivacyBusiness.record(req.user, req.valid.params.id, req.valid.body, ctx(req)));
  },
);

// Exportacion HL7 FHIR R4 (Bundle de solo lectura) del expediente: tambien sirve para atender el
// derecho de acceso del titular a sus datos.
router.get('/patients/:id/fhir', requirePermission(P.PATIENTS_VIEW), validate({ params: z.strictObject({ id }) }), async (req, res) => {
  res
    .type('application/fhir+json')
    .set('Cache-Control', 'no-store')
    .send(JSON.stringify(await exportPatientBundle(req.user, req.valid.params.id, ctx(req))));
});

// Plazos de conservacion: solo para quien puede consultar la auditoria (super usuario por defecto).
router.get('/privacy/retention', requirePermission(P.AUDIT_VIEW), async (req, res) => {
  res.json(await PrivacyBusiness.retention(req.user));
});

export default router;
