import z from 'zod';

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    email: z.email('Invalid Email').trim().max(50),
    // e164
    phoneNumber: z
      .string()
      .trim()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid Phone Number'),
    companyName: z.string().trim().min(1).max(100),
    password: z.string().trim().min(8).max(100),
    addresses: z
      .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid address ID'))
      .min(1, 'At least one address is required'),
  })
  .strict();

export type RegisterSchema = z.infer<typeof registerSchema>;
