import { PermissionsBusiness } from '../../business/permissions.business.js';
import { UsersBusiness } from '../../business/users.business.js';
import { requestContext } from '../../utils/requestContext.js';

export const UsersController = {
  async list(req, res) {
    res.json(await UsersBusiness.list(req.user, req.valid.query));
  },

  async create(req, res) {
    res.status(201).json({ user: await UsersBusiness.create(req.user, req.valid.body, requestContext(req)) });
  },

  async update(req, res) {
    const user = await UsersBusiness.update(req.user, req.valid.params.id, req.valid.body, requestContext(req));
    res.json({ user });
  },

  async setStatus(req, res) {
    const { id } = req.valid.params;
    const user = await UsersBusiness.setStatus(req.user, id, req.valid.body.isActive, requestContext(req));
    res.json({ user });
  },

  async changeRole(req, res) {
    const { id } = req.valid.params;
    const user = await UsersBusiness.changeRole(req.user, id, req.valid.body.role, requestContext(req));
    res.json({ user });
  },

  async getPermissions(req, res) {
    res.json(await PermissionsBusiness.getUserAccess(req.user, req.valid.params.id));
  },

  async setPermissions(req, res) {
    const { id } = req.valid.params;
    res.json(await PermissionsBusiness.setDirectPermissions(req.user, id, req.valid.body.permissions, requestContext(req)));
  },

  async transfer(req, res) {
    res.json(await PermissionsBusiness.transferSystems(req.user, req.valid.params.id, req.valid.body, requestContext(req)));
  },
};
