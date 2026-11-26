import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { AlertsBusiness, RULE_TYPES, setParamsValidator } from '../../business/alerts.business.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { requireModule } from '../../middlewares/requireModule.js';
import { validate } from '../../middlewares/validate.js';
import { requestContext as ctx } from '../../utils/requestContext.js';
import { id } from '../common.validator.js';

// Alertas clinicas configurables (montado en /api). Reglas: /alerts/rules; alertas: por paciente y global.
const router = Router();
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Identificador invalido');
const days = (max) => z.number().int().min(0).max(max);
const term = z.string().trim().min(2).max(80);

// Parametros de cada tipo de regla. Las reglas clinicas no tienen valores por defecto.
const PARAMS = {
  alergia_registrada: z.strictObject({}),
  seguimiento_pendiente: z.strictObject({ overdueDays: days(365) }),
  consulta_no_realizada: z.strictObject({ days: days(365) }),
  datos_incompletos: z.strictObject({}),
  objetivo_sin_revision: z.strictObject({ graceDays: days(365) }),
  nota_sin_firmar: z.strictObject({
    hours: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
  }),
  consentimiento_pendiente: z.strictObject({}),
  cambio_antropometrico: z.strictObject({
    field: z.enum(['weightKg', 'waistCm', 'hipCm', 'bodyFatPct']),
    pctChange: z.number().min(0.5).max(100),
    windowDays: z.number().int().min(1).max(365),
  }),
  laboratorio_fuera_rango: z
    .strictObject({
      analyte: z.string().trim().min(2).max(80),
      unit: z.string().trim().min(1).max(20),
      min: z.number().nullable().default(null),
      max: z.number().nullable().default(null),
    })
    .refine((p) => p.min !== null || p.max !== null, 'Indica al menos un limite')
    .refine((p) => p.min === null || p.max === null || p.min < p.max, 'El minimo debe ser menor que el maximo'),
  interaccion_revision: z.strictObject({ termsA: z.array(term).min(1).max(20), termsB: z.array(term).min(1).max(20) }),
};
setParamsValidator((type, params) => PARAMS[type]?.safeParse(params).success ?? false);

const common = {
  name: z.string().trim().min(3, 'Escribe un nombre para la regla').max(120),
  priority: z.enum(['alta', 'media', 'baja']),
  enabled: z.boolean(),
  // Protocolo, guia o acuerdo clinico que respalda la regla y el umbral (obligatorio para activar reglas clinicas).
  validationReference: z.string().trim().max(300).optional(),
};

const ruleCreate = z
  .strictObject({ type: z.enum(Object.keys(RULE_TYPES)), params: z.record(z.string(), z.unknown()), ...common })
  .superRefine((r, c) => {
    const parsed = PARAMS[r.type].safeParse(r.params);
    if (!parsed.success) c.addIssue({ code: 'custom', path: ['params'], message: parsed.error.issues.map((i) => i.message).join('. ') });
    else r.params = parsed.data;
  });

const ruleUpdate = z.strictObject({
  expectedVersion: z.number().int().min(1),
  name: common.name.optional(),
  priority: common.priority.optional(),
  enabled: z.boolean().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  validationReference: common.validationReference,
});

const configure = [requireModule('alertas'), requirePermission(P.ALERTS_CONFIGURE)];
const view = requirePermission(P.PATIENTS_VIEW);
const statusQuery = z.object({ status: z.enum(['pendiente', 'revisada', 'descartada', 'todas']).default('pendiente') });

router.get('/alerts/rules', view, async (_req, res) => res.json(await AlertsBusiness.listRules()));
router.post('/alerts/rules', configure, validate({ body: ruleCreate }), async (req, res) => {
  res.status(201).json(await AlertsBusiness.createRule(req.user, req.valid.body, ctx(req)));
});
router.put(
  '/alerts/rules/:ruleId',
  configure,
  validate({ params: z.strictObject({ ruleId: objectId }), body: ruleUpdate }),
  async (req, res) => {
    res.json(await AlertsBusiness.updateRule(req.user, req.valid.params.ruleId, req.valid.body, ctx(req)));
  },
);
router.get('/alerts/rules/:ruleId/versions', view, validate({ params: z.strictObject({ ruleId: objectId }) }), async (req, res) => {
  res.json(await AlertsBusiness.ruleVersions(req.valid.params.ruleId));
});

router.get('/clinical/alerts', view, validate({ query: statusQuery }), async (req, res) => {
  res.json(await AlertsBusiness.worklist(req.user, req.valid.query));
});
router.get('/patients/:id/alerts', view, validate({ params: z.strictObject({ id }), query: statusQuery }), async (req, res) => {
  res.json(await AlertsBusiness.forPatient(req.user, req.valid.params.id, req.valid.query, ctx(req)));
});
router.post(
  '/patients/:id/alerts/review',
  requirePermission(P.PATIENTS_MANAGE),
  validate({
    params: z.strictObject({ id }),
    body: z.strictObject({
      key: z.string().trim().min(5).max(200),
      status: z.enum(['revisada', 'descartada', 'pendiente']),
      note: z.string().trim().max(500).default(''),
    }),
  }),
  async (req, res) => {
    res.json(await AlertsBusiness.review(req.user, req.valid.params.id, req.valid.body, ctx(req)));
  },
);

export default router;
