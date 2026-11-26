import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { requireModule } from '../../middlewares/requireModule.js';
import { validate } from '../../middlewares/validate.js';
import { CATALOG_TYPES, CatalogModel } from '../../models/catalog.model.js';

// Busqueda rapida en catalogos autorizados (montado en /api/catalogs).
const router = Router();
const view = [requireModule('catalogos'), requirePermission(P.PATIENTS_VIEW)];

// Que catalogos hay cargados (fuente, version y numero de terminos); vacio = solo texto libre.
router.get('/', view, async (_req, res) => {
  res.json({ types: CATALOG_TYPES, items: await CatalogModel.summary() });
});

router.get(
  '/:type',
  view,
  validate({
    params: z.strictObject({ type: z.enum(Object.keys(CATALOG_TYPES)) }),
    query: z.object({ q: z.string().trim().min(2, 'Escribe al menos 2 letras').max(60) }),
  }),
  async (req, res) => {
    res.json({ items: await CatalogModel.search(req.valid.params.type, req.valid.query.q) });
  },
);

export default router;
