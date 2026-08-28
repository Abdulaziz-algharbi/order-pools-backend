import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createProductSchema = z
  .object({
    user_ref: objectId('Invalid user ID'),
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().min(1).max(2000),
    brand: z.string().trim().min(1).max(100).nullable().optional(),
    unit: z.enum(['PIECE', 'KG', 'BOX', 'CARTON']).optional(),
    images: z.string().nullable().optional(),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;

// mirrors product.model.ts `couldBeUpdated` — keep both in sync
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    brand: z.string().trim().min(1).max(100).nullable().optional(),
    unit: z.enum(['PIECE', 'KG', 'BOX', 'CARTON']).optional(),
    images: z.string().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
