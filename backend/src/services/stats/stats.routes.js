import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { StatsBusiness } from '../../business/stats.business.js';
import { requireAnyPermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { rangeBound } from '../analysis/analysis.validator.js';

const TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

// Periodo por defecto: ultimos 12 meses. La zona horaria agrupa meses, dias y horas.
const overviewQuery = z
  .object({
    from: rangeBound('start').optional(),
    to: rangeBound('end').optional(),
    tz: z
      .string()
      .refine((t) => TIMEZONES.has(t), 'Zona horaria invalida')
      .default('America/Mexico_City'),
  })
  .transform(({ from, to, tz }) => {
    const end = to ?? new Date();
    const start = from ?? new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
    return { from: start, to: end, tz };
  })
  .refine((r) => r.from <= r.to, 'La fecha inicial debe ser anterior a la final')
  .refine((r) => r.to - r.from <= 5 * 366 * 86400000, 'El periodo maximo es de 5 anos');

const router = Router();

router.get('/overview', requireAnyPermission(P.PATIENTS_VIEW, P.REPORTS_VIEW), validate({ query: overviewQuery }), async (req, res) => {
  res.json(await StatsBusiness.overview(req.user, req.valid.query));
});

export default router;
