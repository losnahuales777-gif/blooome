import { Router } from 'express';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { AnalysisController as C } from './analysis.controller.js';
import {
  appointmentParams,
  cancelSchema,
  correctionSchema,
  goalParams,
  goalSchema,
  goalStatusSchema,
  intakeSchema,
  labSchema,
  measurementParams,
  measurementSchema,
  overrideSchema,
  patientParams,
  rangeQuery,
} from './analysis.validator.js';

// Montado en /api/patients. Lectura: patients.view. Escritura clinica: patients.manage.
const router = Router();
const view = requirePermission(P.PATIENTS_VIEW);
const manage = requirePermission(P.PATIENTS_MANAGE);

router.get('/:id/analysis', view, validate({ params: patientParams, query: rangeQuery }), C.get);
router.post('/:id/measurements', manage, validate({ params: patientParams, body: measurementSchema }), C.addMeasurement);
router.post(
  '/:id/measurements/:measurementId/corrections',
  manage,
  validate({ params: measurementParams, body: correctionSchema }),
  C.correctMeasurement,
);
router.post('/:id/intake', manage, validate({ params: patientParams, body: intakeSchema }), C.addIntake);
router.post('/:id/labs', manage, validate({ params: patientParams, body: labSchema }), C.addLab);
router.post('/:id/goals', manage, validate({ params: patientParams, body: goalSchema }), C.addGoal);
router.patch('/:id/goals/:goalId', manage, validate({ params: goalParams, body: goalStatusSchema }), C.setGoalStatus);
router.post('/:id/overrides', manage, validate({ params: patientParams, body: overrideSchema }), C.addOverride);
router.post(
  '/:id/appointments/:appointmentId/cancel',
  manage,
  validate({ params: appointmentParams, body: cancelSchema }),
  C.cancelAppointment,
);

export default router;
