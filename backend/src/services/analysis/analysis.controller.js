import { AnalysisBusiness } from '../../business/analysis.business.js';
import { requestContext } from '../../utils/requestContext.js';

const pid = (req) => req.valid.params.id;

export const AnalysisController = {
  async get(req, res) {
    res.json(await AnalysisBusiness.getAnalysis(req.user, pid(req), req.valid.query));
  },

  async addMeasurement(req, res) {
    res.status(201).json(await AnalysisBusiness.addMeasurement(req.user, pid(req), req.valid.body, requestContext(req)));
  },

  async correctMeasurement(req, res) {
    const { measurementId } = req.valid.params;
    res.status(201).json(await AnalysisBusiness.correctMeasurement(req.user, pid(req), measurementId, req.valid.body, requestContext(req)));
  },

  async addIntake(req, res) {
    res.status(201).json(await AnalysisBusiness.addIntake(req.user, pid(req), req.valid.body, requestContext(req)));
  },

  async addLab(req, res) {
    res.status(201).json(await AnalysisBusiness.addLab(req.user, pid(req), req.valid.body, requestContext(req)));
  },

  async addGoal(req, res) {
    res.status(201).json(await AnalysisBusiness.addGoal(req.user, pid(req), req.valid.body, requestContext(req)));
  },

  async setGoalStatus(req, res) {
    const { goalId } = req.valid.params;
    res.json(await AnalysisBusiness.setGoalStatus(req.user, pid(req), goalId, req.valid.body.status, requestContext(req)));
  },

  async addOverride(req, res) {
    res.status(201).json(await AnalysisBusiness.addOverride(req.user, pid(req), req.valid.body, requestContext(req)));
  },

  async cancelAppointment(req, res) {
    const { appointmentId } = req.valid.params;
    res.json(await AnalysisBusiness.cancelAppointment(req.user, pid(req), appointmentId, req.valid.body.reason, requestContext(req)));
  },
};
