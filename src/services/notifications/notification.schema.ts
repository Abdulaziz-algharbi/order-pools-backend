import z from 'zod';
import { objectId } from '../../utils/zod.util';

const notificationTypeSchema = z.enum(['DELIVERY_ASSIGNED']);
const notificationPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH']);

// POST /notifications — ADMIN only. sender_ref is always derived from the
// caller's token (see NotificationController.create), never accepted here.
export const createNotificationSchema = z
  .object({
    recipient_ref: z
      .array(objectId('Invalid recipient ID'))
      .min(1, 'At least one recipient is required'),
    type: notificationTypeSchema,
    title: z.string().trim().min(1).max(255),
    message: z.string().trim().min(1).max(2000),
    actionUrl: z.string().trim().optional(),
    priority: notificationPrioritySchema.optional(),
  })
  .strict();

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

// PATCH /notifications/:_id — shared by ADMIN (title/message/actionUrl/
// priority) and the owning recipient (isRead only); which fields a given
// caller may actually set is enforced in NotificationController.update.
export const updateNotificationSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    message: z.string().trim().min(1).max(2000).optional(),
    actionUrl: z.string().trim().optional(),
    priority: notificationPrioritySchema.optional(),
    isRead: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;
