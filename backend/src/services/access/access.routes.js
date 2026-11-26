import { Router } from 'express';
import { PERMISSIONS as P } from '../../business/access.business.js';
import { requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { paginationQuery } from '../common.validator.js';
import { z } from 'zod';
import { RolesBusiness } from '../../business/roles.business.js';
import { requestContext } from '../../utils/requestContext.js';
import { AccessController } from './access.controller.js';

const router = Router();

// Catalogo de roles y permisos (necesario para formularios de alta y gestion de accesos).
router.get('/catalog', requirePermission(P.USERS_VIEW), AccessController.catalog);
router.get('/audit', requirePermission(P.AUDIT_VIEW), validate({ query: paginationQuery }), AccessController.audit);

// Gestion de roles (superusuario).
const roleCode = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{2,39}$/, 'Codigo invalido (minusculas, numeros y _)');
const perms = z.array(z.string().trim().max(60)).max(60);
router.get('/roles', requirePermission(P.ROLES_MANAGE), async (_req, res) => res.json(await RolesBusiness.list()));
router.post(
  '/roles',
  requirePermission(P.ROLES_MANAGE),
  validate({
    body: z.strictObject({
      code: roleCode,
      name: z.string().trim().min(3).max(80),
      description: z.string().trim().max(300).default(''),
      // Por debajo del superusuario (100); un rol personalizado nunca lo iguala.
      level: z.number().int().min(1).max(99),
      permissions: perms,
    }),
  }),
  async (req, res) => res.status(201).json(await RolesBusiness.create(req.user, req.valid.body, requestContext(req))),
);
router.patch(
  '/roles/:roleId',
  requirePermission(P.ROLES_MANAGE),
  validate({
    params: z.strictObject({ roleId: z.coerce.number().int().positive() }),
    body: z.strictObject({
      name: z.string().trim().min(3).max(80).optional(),
      description: z.string().trim().max(300).optional(),
      permissions: perms.optional(),
      active: z.boolean().optional(),
    }),
  }),
  async (req, res) => res.json(await RolesBusiness.update(req.user, req.valid.params.roleId, req.valid.body, requestContext(req))),
);

export default router;
