import { z } from 'zod';
import { PASSWORD_POLICY } from '../../utils/password.js';
import { id } from '../common.validator.js';

// Los roles son dinamicos (catalogo en la base): se valida el formato y la existencia en la capa Business.
const role = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{2,39}$/, 'Rol invalido');
const fullName = z.string().trim().min(2, 'Nombre demasiado corto').max(120);

export const createUserSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Correo invalido')),
  fullName,
  password: z.string().regex(PASSWORD_POLICY, 'Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo'),
  role,
});

export const updateUserSchema = z.strictObject({ fullName });

export const statusSchema = z.strictObject({ isActive: z.boolean() });

export const roleSchema = z.strictObject({ role });

export const permissionsSchema = z.strictObject({
  permissions: z.array(z.string().max(60)).max(50),
});

export const listUsersQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(80).optional(),
  role: role.optional(),
});

export const temporaryPermissionSchema = z.strictObject({
  permission: z.string().trim().max(60),
  justification: z.string().trim().min(20, 'Explica el motivo (minimo 20 caracteres)').max(500),
  hours: z.number().int().min(1).max(72),
});

export const transferSchema = z.strictObject({
  targetUserId: id,
  deactivateSource: z.boolean().default(false),
});
