import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createProductOfferSchema = z
  .object({
    product_ref: objectId('Invalid product ID'),
    wholeQuantity: z.number().positive(),
    price: z.number().positive(),
  })
  .strict();

export type CreateProductOfferInput = z.infer<typeof createProductOfferSchema>;

// mirrors product.offer.model.ts `couldBeUpdated` — keep both in sync
export const updateProductOfferSchema = z
  .object({
    wholeQuantity: z.number().positive().optional(),
    price: z.number().positive().optional(),
    adminComment: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateProductOfferInput = z.infer<typeof updateProductOfferSchema>;
