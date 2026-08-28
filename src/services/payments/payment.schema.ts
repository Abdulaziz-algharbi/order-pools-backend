import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createPaymentSchema = z
  .object({
    user_ref: objectId('Invalid user ID'),
    transactionReference: z.string().trim().min(1),
    amount: z.number().positive(),
    currency: z.enum(['OMR', 'USD']).optional(),
    stripePaymentIntentId: z.string().trim().min(1),
  })
  .strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// mirrors payment.model.ts `couldBeUpdated` — keep both in sync
export const updatePaymentSchema = z
  .object({
    amount: z.number().positive(),
  })
  .strict();

export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
