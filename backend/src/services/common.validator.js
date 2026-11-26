import { z } from 'zod';

export const id = z.coerce.number().int().positive().max(2_147_483_647);

export const idParams = z.strictObject({ id });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
