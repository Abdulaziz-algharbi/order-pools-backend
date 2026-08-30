import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createPoolParticipantSchema = z
  .object({
    // No user_ref here: a participant is always the authenticated caller
    // (RETAILER, enforced by requireRole on the route).
    // PoolParticipantController.create sets it from the session, never the client.
    pool_ref: objectId('Invalid pool ID'),
    payment_ref: objectId('Invalid payment ID'),
    address_ref: objectId('Invalid address ID'),
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
