import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createSupplierPayoutSchema = z
  .object({
    pool_ref: objectId('Invalid pool ID'),
    grossAmount: z.number().positive(),
    platformCommission: z.number().nonnegative(),
    netAmount: z.number().positive(),
  })
  .strict();

export type CreateSupplierPayoutInput = z.infer<
  typeof createSupplierPayoutSchema
>;
