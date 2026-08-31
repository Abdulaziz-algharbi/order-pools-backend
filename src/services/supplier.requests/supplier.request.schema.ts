import z from 'zod';

export const createSupplierRequestSchema = z
  .object({
    description: z.string().trim().min(1).max(2000),
  })
  .strict();

export type CreateSupplierRequestInput = z.infer<
  typeof createSupplierRequestSchema
>;

// PATCH /supplier-requests/:_id — shared by the owning RETAILER (may only
// set `description`, and only while the request is still PENDING) and
// ADMIN (may only set `status`/`adminComment`). This validates shape only;
// which fields a given caller may actually set is enforced in
// SupplierRequestController.update, the same split-permission approach
// used by ComplaintController.update. Setting status to APPROVED is what
// actually adds SUPPLIER onto the requester's roles.
export const updateSupplierRequestSchema = z
  .object({
    description: z.string().trim().min(1).max(2000).optional(),
    status: z.enum(['APPROVED', 'REJECTED']).optional(),
    adminComment: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateSupplierRequestInput = z.infer<
  typeof updateSupplierRequestSchema
>;
