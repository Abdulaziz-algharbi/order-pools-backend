import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createPoolParticipantSchema = z
  .object({
    user_ref: objectId('Invalid user ID'),
    pool_ref: objectId('Invalid pool ID'),
    payment_ref: objectId('Invalid payment ID'),
    delivery_ref: objectId('Invalid delivery ID').optional(),
    quantity: z.number().positive(),
  })
  .strict();

export type CreatePoolParticipantInput = z.infer<
  typeof createPoolParticipantSchema
>;

// mirrors pool.participant.model.ts `couldBeUpdated` — keep both in sync
export const updatePoolParticipantSchema = z
  .object({
    quantity: z.number().positive(),
  })
  .strict();

export type UpdatePoolParticipantInput = z.infer<
  typeof updatePoolParticipantSchema
>;
