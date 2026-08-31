import z from 'zod';

export const createProductOfferSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().min(1).max(2000),
    brand: z.string().trim().min(1).max(100).nullable().optional(),
    unit: z.enum(['PIECE', 'KG', 'BOX', 'CARTON']).optional(),
    images: z.string().nullable().optional(),
    wholeQuantity: z.number().positive(),
    price: z.number().positive(),
  })
  .strict();

export type CreateProductOfferInput = z.infer<typeof createProductOfferSchema>;

// mirrors product.offer.model.ts `couldBeUpdated`. Which of these a given
// caller may actually set is enforced in ProductOfferController.update
// (SUPPLIER: name/description/brand/unit/images/wholeQuantity/price; ADMIN:
// status/adminComment) — this schema only validates shape, not who's
// allowed to send what.
export const updateProductOfferSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    brand: z.string().trim().min(1).max(100).nullable().optional(),
    unit: z.enum(['PIECE', 'KG', 'BOX', 'CARTON']).optional(),
    images: z.string().nullable().optional(),
    wholeQuantity: z.number().positive().optional(),
    price: z.number().positive().optional(),
    status: z
      .enum(['PENDING', 'NEGOTIATION', 'APPROVED', 'REJECTED'])
      .optional(),
    adminComment: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateProductOfferInput = z.infer<typeof updateProductOfferSchema>;
