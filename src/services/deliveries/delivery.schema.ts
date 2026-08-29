import z from 'zod';
import { objectId } from '../../utils/zod.util';

// deliveredAt mirrors the model's Mixed field: either a date/time string or
// left unset — see delivery.model.ts's custom validator
const deliveredAt = z.union([z.iso.datetime({ offset: true }), z.string()]);

export const createDeliverySchema = z
  .object({
    pool_ref: objectId('Invalid pool ID'),
    deliveryStatus: z.enum(['PENDING', 'DELIVERING', 'DELIVERED']).optional(),
  })
  .strict();

export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>;

// mirrors delivery.model.ts `couldBeUpdated` — keep both in sync
export const updateDeliverySchema = z
  .object({
    deliveryStatus: z.enum(['PENDING', 'DELIVERING', 'DELIVERED']).optional(),
    deliveredAt: deliveredAt.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateDeliveryInput = z.infer<typeof updateDeliverySchema>;
