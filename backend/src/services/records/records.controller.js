import { RecordsBusiness } from '../../business/records.business.js';

export const RecordsController = {
  async list(req, res) {
    res.json(await RecordsBusiness.list(req.user, req.valid.query));
  },

  async create(req, res) {
    res.status(201).json({ record: await RecordsBusiness.create(req.user, req.valid.body) });
  },
};
