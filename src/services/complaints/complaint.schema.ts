import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createComplaintSchema = z
  .object({
    pool_ref: objectId('Invalid pool ID'),
    // No creator_ref here: a complaint is always filed by the authenticated
    // caller (RETAILER/SUPPLIER, enforced by requireRole on the route).
    // ComplaintController.create sets it from the session, never the client.
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(2000),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  })
  .strict();

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

// mirrors complaint.model.ts `couldBeUpdated` — keep both in sync
export const updateComplaintSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    resolution: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;
