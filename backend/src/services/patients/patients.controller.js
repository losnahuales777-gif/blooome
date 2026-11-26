import { PatientsBusiness } from '../../business/patients.business.js';
import { requestContext } from '../../utils/requestContext.js';

export const PatientsController = {
  async list(req, res) {
    res.json(await PatientsBusiness.list(req.user));
  },

  async get(req, res) {
    res.json({ patient: await PatientsBusiness.get(req.user, req.valid.params.id) });
  },

  async create(req, res) {
    res.status(201).json({ patient: await PatientsBusiness.create(req.user, req.valid.body, requestContext(req)) });
  },

  async update(req, res) {
    const patient = await PatientsBusiness.update(req.user, req.valid.params.id, req.valid.body, requestContext(req));
    res.json({ patient });
  },

  async recordVisit(req, res) {
    res.json(await PatientsBusiness.recordVisit(req.user, req.valid.params.id, req.valid.body, requestContext(req)));
  },

  async getMealPlan(req, res) {
    res.json(await PatientsBusiness.getMealPlan(req.user, req.valid.params.id));
  },

  async saveMealPlan(req, res) {
    const { id } = req.valid.params;
    res.json(await PatientsBusiness.saveMealPlan(req.user, id, req.valid.body, requestContext(req)));
  },

  async mealPlanVersions(req, res) {
    res.json(await PatientsBusiness.mealPlanVersions(req.user, req.valid.params.id));
  },

  async mealPlanVersion(req, res) {
    const { id, version } = req.valid.params;
    res.json(await PatientsBusiness.mealPlanVersion(req.user, id, version));
  },
};
