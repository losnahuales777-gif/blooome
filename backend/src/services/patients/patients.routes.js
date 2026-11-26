import { Router } from 'express';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { z } from 'zod';
import { id, idParams } from '../common.validator.js';
import { MealSuggestionBusiness } from '../../business/mealSuggestion.business.js';
import { aiLimiter } from '../../middlewares/rateLimiter.js';
import { requireModule } from '../../middlewares/requireModule.js';
import { requestContext } from '../../utils/requestContext.js';
import { PatientsController } from './patients.controller.js';
import { mealPlanSchema, patientSchema, patientUpdateSchema, visitSchema } from './patients.validator.js';

const router = Router();

router.get('/', requirePermission(P.PATIENTS_VIEW), PatientsController.list);
router.post('/', requirePermission(P.PATIENTS_MANAGE), validate({ body: patientSchema }), PatientsController.create);
router.get('/:id', requirePermission(P.PATIENTS_VIEW), validate({ params: idParams }), PatientsController.get);
router.put(
  '/:id',
  requirePermission(P.PATIENTS_MANAGE),
  validate({ params: idParams, body: patientUpdateSchema }),
  PatientsController.update,
);
router.post(
  '/:id/visits',
  requirePermission(P.PATIENTS_MANAGE),
  validate({ params: idParams, body: visitSchema }),
  PatientsController.recordVisit,
);
router.get('/:id/meal-plan', requirePermission(P.PATIENTS_VIEW), validate({ params: idParams }), PatientsController.getMealPlan);
router.put(
  '/:id/meal-plan',
  requirePermission(P.MEAL_PLANS_MANAGE),
  validate({ params: idParams, body: mealPlanSchema }),
  PatientsController.saveMealPlan,
);

router.get(
  '/:id/meal-plan/versions',
  requirePermission(P.PATIENTS_VIEW),
  validate({ params: idParams }),
  PatientsController.mealPlanVersions,
);
router.get(
  '/:id/meal-plan/versions/:version',
  requirePermission(P.PATIENTS_VIEW),
  validate({ params: z.strictObject({ id, version: z.coerce.number().int().min(1).max(100000) }) }),
  PatientsController.mealPlanVersion,
);

// Sugerencia de plan con IA (skill nutriplan). No guarda nada: devuelve una propuesta para revisar.
const prefText = z.string().trim().max(300).default('');
router.post(
  '/:id/meal-plan/suggest',
  requirePermission(P.MEAL_PLANS_MANAGE),
  requireModule('asistente_ia'),
  aiLimiter,
  validate({
    params: idParams,
    body: z.strictObject({
      preferences: prefText,
      dislikes: prefText,
      budget: prefText,
      cookingTime: prefText,
      schedule: prefText,
    }),
  }),
  async (req, res) => {
    res.json(await MealSuggestionBusiness.suggest(req.user, req.valid.params.id, req.valid.body, requestContext(req)));
  },
);

export default router;
