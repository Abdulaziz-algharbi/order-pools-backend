import z from 'zod';
import { objectId } from '../../utils/zod.util';

export const createNotificationSchema = z
  .object({
    sender_ref: objectId('Invalid sender ID'),
    recipient_ref: z
      .array(objectId('Invalid recipient ID'))
      .min(1, 'At least one recipient is required'),
    type: z.enum(['PRODUCT_APPROVED', 'NEW OFFER', 'NEW COMPLAINT']).optional(),
    title: z.string().trim().min(1).max(255),
    message: z.string().trim().min(1).max(2000),
    actionUrl: z.string().trim().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  })
  .strict();

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

// mirrors notification.model.ts `couldBeUpdated` — keep both in sync
export const updateNotificationSchema = z
  .object({
    isRead: z.boolean().optional(),
    readAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;
