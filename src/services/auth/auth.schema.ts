import z from 'zod';

export const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.string().trim().email('Invalid Email').max(50),
  // e164
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid Phone Number'),
  companyName: z.string().trim().min(1).max(100),
  password: z.string().trim().min(8).max(100),
  // addresses:
});

export type RegisterSchema = z.infer<typeof registerSchema>;
