import z from 'zod';

export const createAddressSchema = z.object({
  location: z.url('Invalid Link'),
  region: z.string().trim().min(1).max(50),
  city: z.string().trim().min(1).max(50),
  street: z.string().trim().min(1).max(50).optional(),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = z
  .object({
    location: z.url('Invalid Link').optional(),
    region: z.string().trim().min(1).max(50).optional(),
    city: z.string().trim().min(1).max(50).optional(),
    street: z.string().trim().min(1).max(50).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
