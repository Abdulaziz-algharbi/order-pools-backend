import z from 'zod';
import { objectId } from '../../utils/zod.util';

const assignedDriver = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1).max(20),
});

export const createDistributionBatchSchema = z
  .object({
    shipment_ref: objectId('Invalid shipment ID'),
    deliveryDate: z.iso.datetime({ offset: true }),
    region: z.string().trim().min(1).max(100),
    assignedDriver,
  })
  .strict();

export type CreateDistributionBatchInput = z.infer<
  typeof createDistributionBatchSchema
>;

// mirrors distribution.batch.model.ts `couldBeUpdated` — keep both in sync
export const updateDistributionBatchSchema = z
  .object({
    deliveryDate: z.iso.datetime({ offset: true }).optional(),
    assignedDriver: assignedDriver.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateDistributionBatchInput = z.infer<
  typeof updateDistributionBatchSchema
>;
