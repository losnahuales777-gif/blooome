import { Router } from 'express';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { ChartBusiness } from '../../business/chart.business.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { requestContext } from '../../utils/requestContext.js';
import {
  addendumSchema,
  diagnosisParams,
  diagnosisSchema,
  diagnosisStatusSchema,
  historyParams,
  historySchema,
  verifySchema,
  historyUpdateSchema,
  identificationSchema,
  noteCreateSchema,
  noteDraftSchema,
  noteParams,
  patientParams,
  signSchema,
  timelineQuery,
} from './chart.validator.js';

// Expediente clinico (montado en /api/patients). Lectura: patients.view. Registro: patients.manage.
const router = Router();
const view = requirePermission(P.PATIENTS_VIEW);
const manage = requirePermission(P.PATIENTS_MANAGE);
const pid = (req) => req.valid.params.id;
const ctx = requestContext;

router.get('/:id/chart', view, validate({ params: patientParams }), async (req, res) => {
  res.json(await ChartBusiness.getChart(req.user, pid(req), ctx(req)));
});
router.put('/:id/identification', manage, validate({ params: patientParams, body: identificationSchema }), async (req, res) => {
  res.json(await ChartBusiness.updateIdentification(req.user, pid(req), req.valid.body, ctx(req)));
});

router.post('/:id/history', manage, validate({ params: patientParams, body: historySchema }), async (req, res) => {
  res.status(201).json(await ChartBusiness.addHistory(req.user, pid(req), req.valid.body, ctx(req)));
});
router.put('/:id/history/:historyId', manage, validate({ params: historyParams, body: historyUpdateSchema }), async (req, res) => {
  res.status(201).json(await ChartBusiness.updateHistory(req.user, pid(req), req.valid.params.historyId, req.valid.body, ctx(req)));
});
router.post('/:id/history/verify', manage, validate({ params: patientParams, body: verifySchema }), async (req, res) => {
  res.json(await ChartBusiness.verifyHistory(req.user, pid(req), req.valid.body, ctx(req)));
});
router.get('/:id/history/:historyId/versions', view, validate({ params: historyParams }), async (req, res) => {
  res.json(await ChartBusiness.historyVersions(req.user, pid(req), req.valid.params.historyId, ctx(req)));
});

router.post('/:id/notes', manage, validate({ params: patientParams, body: noteCreateSchema }), async (req, res) => {
  res.status(201).json(await ChartBusiness.createNote(req.user, pid(req), req.valid.body, ctx(req)));
});
router.get('/:id/notes/:noteId', view, validate({ params: noteParams }), async (req, res) => {
  res.json(await ChartBusiness.getNote(req.user, pid(req), req.valid.params.noteId, ctx(req)));
});
router.put('/:id/notes/:noteId/draft', manage, validate({ params: noteParams, body: noteDraftSchema }), async (req, res) => {
  res.json(await ChartBusiness.saveDraft(req.user, pid(req), req.valid.params.noteId, req.valid.body));
});
router.post('/:id/notes/:noteId/sign', manage, validate({ params: noteParams, body: signSchema }), async (req, res) => {
  res.json(await ChartBusiness.signNote(req.user, pid(req), req.valid.params.noteId, ctx(req)));
});
router.post('/:id/notes/:noteId/addenda', manage, validate({ params: noteParams, body: addendumSchema }), async (req, res) => {
  res.status(201).json(await ChartBusiness.addAddendum(req.user, pid(req), req.valid.params.noteId, req.valid.body.text, ctx(req)));
});

router.post('/:id/evaluations', manage, validate({ params: patientParams }), async (req, res) => {
  res.status(201).json(await ChartBusiness.createEvaluation(req.user, pid(req), ctx(req)));
});
router.post('/:id/diagnoses', manage, validate({ params: patientParams, body: diagnosisSchema }), async (req, res) => {
  res.status(201).json(await ChartBusiness.createDiagnosis(req.user, pid(req), req.valid.body, ctx(req)));
});
router.patch(
  '/:id/diagnoses/:diagnosisId',
  manage,
  validate({ params: diagnosisParams, body: diagnosisStatusSchema }),
  async (req, res) => {
    res.json(await ChartBusiness.setDiagnosisStatus(req.user, pid(req), req.valid.params.diagnosisId, req.valid.body, ctx(req)));
  },
);

router.get('/:id/timeline', view, validate({ params: patientParams, query: timelineQuery }), async (req, res) => {
  res.json(await ChartBusiness.getTimeline(req.user, pid(req), req.valid.query, ctx(req)));
});

export default router;
