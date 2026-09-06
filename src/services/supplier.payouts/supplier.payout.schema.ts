import z from 'zod';
import { objectId } from '../../utils/zod.util';

// amount is looked up server-side from the pool's ProductOffer.price (see
// SupplierPayoutController.create) — not accepted from the client.
export const createSupplierPayoutSchema = z
  .object({
    pool_ref: objectId('Invalid pool ID'),
  })
  .strict();

export type CreateSupplierPayoutInput = z.infer<
  typeof createSupplierPayoutSchema
>;

// mirrors supplier.payout.model.ts `couldBeUpdated` — keep both in sync
export const updateSupplierPayoutSchema = z
  .object({
    status: z.enum(['PROCESSING', 'COMPLETED', 'FAILED']).optional(),
    transactionReference: z.string().trim().min(1).optional(),
    paidAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateSupplierPayoutInput = z.infer<
  typeof updateSupplierPayoutSchema
>;
