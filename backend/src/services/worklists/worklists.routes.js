import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { WorklistsBusiness } from '../../business/worklists.business.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { rangeBound } from '../analysis/analysis.validator.js';

// Listas de trabajo de las secciones del menu (montado en /api/clinical).
const router = Router();
const view = requirePermission(P.PATIENTS_VIEW);

const range = (defaultPastDays, defaultFutureDays = 0) =>
  z
    .object({ from: rangeBound('start').optional(), to: rangeBound('end').optional() })
    .transform(({ from, to }) => ({
      from: from ?? new Date(Date.now() - defaultPastDays * 86400000),
      to: to ?? new Date(Date.now() + defaultFutureDays * 86400000),
    }))
    .refine((r) => r.from <= r.to, 'La fecha inicial debe ser anterior a la final');

router.get('/records', view, async (req, res) => {
  res.json({ items: await WorklistsBusiness.records(req.user) });
});

router.get(
  '/notes',
  view,
  validate({ query: z.intersection(range(365), z.object({ status: z.enum(['borrador', 'firmada']).optional() })) }),
  async (req, res) => {
    res.json({ items: await WorklistsBusiness.notes(req.user, req.valid.query) });
  },
);

router.get('/agenda', view, validate({ query: range(7, 30) }), async (req, res) => {
  res.json({ items: await WorklistsBusiness.agenda(req.user, req.valid.query) });
});

router.get('/labs', view, validate({ query: range(365) }), async (req, res) => {
  res.json({ items: await WorklistsBusiness.labs(req.user, req.valid.query) });
});

router.get('/evaluations', view, validate({ query: range(183) }), async (req, res) => {
  res.json({ items: await WorklistsBusiness.evaluations(req.user, req.valid.query) });
});

export default router;
