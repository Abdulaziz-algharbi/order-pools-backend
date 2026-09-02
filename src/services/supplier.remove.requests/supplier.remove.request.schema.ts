import z from 'zod';

// PATCH /supplier-remove-requests/:_id — ADMIN only (see
// SupplierRemoveRequestController.update). Approving is what actually
// deletes the requesting user's account.
export const updateSupplierRemoveRequestSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']).optional(),
    adminComment: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateSupplierRemoveRequestInput = z.infer<
  typeof updateSupplierRemoveRequestSchema
>;
