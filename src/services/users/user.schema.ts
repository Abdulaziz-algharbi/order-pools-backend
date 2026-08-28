import z from 'zod';

export const createUserSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, 'First name is required')
      .max(50, 'First name must not exceed 50 characters'),
    lastName: z
      .string()
      .trim()
      .min(1, 'Last name is required')
      .max(50, 'Last name must not exceed 50 characters'),
    email: z.email({ message: 'Invalid email address' }),
    phoneNumber: z
      .string()
      .trim()
      .min(8, 'Invalid phone number')
      .max(20, 'Invalid phone number'),

    companyName: z
      .string()
      .trim()
      .min(1, 'Company name is required')
      .max(150, 'Company name must not exceed 150 characters'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters'),

    commercialRegistration: z.string().trim().max(50).nullable().optional(),

    vatNumber: z.string().trim().max(50).nullable().optional(),
    profileImage: z.string().nullable().optional(),
    addresses: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid address ID'))
      .min(1, 'At least one address is required'),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;

// mirrors user.model.ts `couldBeUpdated` — keep both in sync
export const updateUserSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, 'First name is required')
      .max(50, 'First name must not exceed 50 characters')
      .optional(),
    lastName: z
      .string()
      .trim()
      .min(1, 'Last name is required')
      .max(50, 'Last name must not exceed 50 characters')
      .optional(),
    email: z.email({ message: 'Invalid email address' }).optional(),
    phoneNumber: z
      .string()
      .trim()
      .min(8, 'Invalid phone number')
      .max(20, 'Invalid phone number')
      .optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must not exceed 128 characters')
      .optional(),
    commercialRegistration: z.string().trim().max(50).nullable().optional(),
    vatNumber: z.string().trim().max(50).nullable().optional(),
    profileImage: z.string().nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
