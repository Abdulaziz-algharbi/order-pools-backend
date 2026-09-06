import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createPoolParticipantSchema = z
  .object({
    // No user_ref here: a participant is always the authenticated caller
    // (RETAILER, enforced by requireRole on the route).
    // PoolParticipantController.create sets it from the session, never the client.
    // No payment_ref either — PoolParticipantController.create creates the
    // Payment itself (server-computed amount, Thawani checkout session)
    // and links it, rather than trusting a client-supplied payment.
    pool_ref: objectId('Invalid pool ID'),
    address_ref: objectId('Invalid address ID'),
    quantity: z.number().positive(),
  })
  .strict();

export type CreatePoolParticipantInput = z.infer<
  typeof createPoolParticipantSchema
>;
