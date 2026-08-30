import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createAddressSchema = z.object({
  location: z.url('Invalid Link'),
  region: z.string().trim().min(1).max(50),
  city: z.string().trim().min(1).max(50),
  street: z.string().trim().min(1).max(50).optional(),
  // Only meaningful when the caller is an ADMIN, creating an address on
  // behalf of another user — see AddressController.create. Ignored (and
  // stripped) for every other caller.
  user_ref: objectId('Invalid user ID').optional(),
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
