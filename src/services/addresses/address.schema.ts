import z from 'zod';

export const createAddressSchema = z.object({
  location: z.url('Invalid Link'),
  region: z.string().trim().min(1).max(50),
  city: z.string().trim().min(1).max(50),
  street: z.string().trim().min(1).max(50).optional(),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
