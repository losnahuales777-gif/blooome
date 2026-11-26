import { AuditBusiness } from '../../business/audit.business.js';
import { PermissionsBusiness } from '../../business/permissions.business.js';

export const AccessController = {
  async catalog(_req, res) {
    res.json(await PermissionsBusiness.catalog());
  },

  async audit(req, res) {
    res.json(await AuditBusiness.list(req.valid.query));
  },
};
