import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createShipmentSchema = z
  .object({
    pool_ref: objectId('Invalid pool ID'),
    preparedQuantity: z.number().min(1).max(1000),
    expectedReadyDate: z.iso.datetime({ offset: true }),
  })
  .strict();

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

// mirrors shipment.model.ts `couldBeUpdated` — keep both in sync
export const updateShipmentSchema = z
  .object({
    preparedQuantity: z.number().min(1).max(1000).optional(),
    expectedReadyDate: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;
