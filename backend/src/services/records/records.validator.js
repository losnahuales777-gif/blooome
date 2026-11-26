import { z } from 'zod';

export const createRecordSchema = z.strictObject({
  title: z.string().trim().min(1, 'El titulo es obligatorio').max(150),
  description: z.string().trim().max(2000).default(''),
});
