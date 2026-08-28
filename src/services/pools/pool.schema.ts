import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createPoolSchema = z
  .object({
    productoffer_ref: objectId('Invalid product offer ID'),
    currentQuantity: z.number().nonnegative(),
    minimumContribution: z.number().positive(),
    pricePerUnit: z.number().positive(),
    startDate: z.iso.datetime({ offset: true }).optional(),
    endDate: z.iso.datetime({ offset: true }),
  })
  .strict();

export type CreatePoolInput = z.infer<typeof createPoolSchema>;

// mirrors pool.model.ts `couldBeUpdated` — keep both in sync
export const updatePoolSchema = z
  .object({
    currentQuantity: z.number().nonnegative().optional(),
    minimumContribution: z.number().positive().optional(),
    pricePerUnit: z.number().positive().optional(),
    startDate: z.iso.datetime({ offset: true }).optional(),
    endDate: z.iso.datetime({ offset: true }).optional(),
    status: z
      .enum([
        'OPEN',
        'TARGET_REACHED',
        'DISTRIBUTING',
        'COMPLETED',
        'CANCELLED',
      ])
      .optional(),
    supplierPaymentStatus: z.enum(['NOT_PAID', 'PAID']).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdatePoolInput = z.infer<typeof updatePoolSchema>;
