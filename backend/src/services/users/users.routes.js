import { Router } from 'express';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { idParams } from '../common.validator.js';
import { requestContext } from '../../utils/requestContext.js';
import { PermissionsBusiness } from '../../business/permissions.business.js';
import { UsersBusiness } from '../../business/users.business.js';
import { UsersController } from './users.controller.js';
import {
  createUserSchema,
  listUsersQuery,
  permissionsSchema,
  roleSchema,
  statusSchema,
  temporaryPermissionSchema,
  transferSchema,
  updateUserSchema,
} from './users.validator.js';

const router = Router();

router.get('/', requirePermission(P.USERS_VIEW), validate({ query: listUsersQuery }), UsersController.list);
router.post('/', requirePermission(P.USERS_CREATE), validate({ body: createUserSchema }), UsersController.create);
router.patch('/:id', requirePermission(P.USERS_UPDATE), validate({ params: idParams, body: updateUserSchema }), UsersController.update);
router.patch(
  '/:id/status',
  requirePermission(P.USERS_UPDATE),
  validate({ params: idParams, body: statusSchema }),
  UsersController.setStatus,
);

// Gobierno de accesos: reservado al super usuario por defecto.
router.patch('/:id/role', requirePermission(P.ROLES_ASSIGN), validate({ params: idParams, body: roleSchema }), UsersController.changeRole);
router.get('/:id/permissions', requirePermission(P.PERMISSIONS_MANAGE), validate({ params: idParams }), UsersController.getPermissions);
router.put(
  '/:id/permissions',
  requirePermission(P.PERMISSIONS_MANAGE),
  validate({ params: idParams, body: permissionsSchema }),
  UsersController.setPermissions,
);
router.post(
  '/:id/transfer',
  requirePermission(P.SYSTEMS_TRANSFER),
  validate({ params: idParams, body: transferSchema }),
  UsersController.transfer,
);

// Restablecimiento seguro (codigo de un solo uso) y baja logica.
router.post('/:id/reset-password', requirePermission(P.USERS_RESET_PASSWORD), validate({ params: idParams }), async (req, res) => {
  res.json(await UsersBusiness.resetPassword(req.user, req.valid.params.id, requestContext(req)));
});
router.delete('/:id', requirePermission(P.USERS_DELETE), validate({ params: idParams }), async (req, res) => {
  res.json(await UsersBusiness.remove(req.user, req.valid.params.id, requestContext(req)));
});
// Permiso temporal y justificado (acceso de emergencia).
router.post(
  '/:id/permissions/temporary',
  requirePermission(P.PERMISSIONS_MANAGE),
  validate({ params: idParams, body: temporaryPermissionSchema }),
  async (req, res) => {
    res.json(await PermissionsBusiness.grantTemporary(req.user, req.valid.params.id, req.valid.body, requestContext(req)));
  },
);

export default router;
