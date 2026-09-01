import { Document, Schema, Types, model } from 'mongoose';

// Extend this as new triggers are wired up (see NotificationController.listeners()).
export type NotificationType = 'DELIVERY_ASSIGNED';

export interface NotificationRecipient {
  user_ref: Types.ObjectId;
  isRead: boolean;
  readAt: Date | null;
}

export interface Notification extends Document {
  // The admin who triggered this notification, or null when there is no
  // single responsible human actor (e.g. a fully automated event).
  sender_ref: Types.ObjectId | null;
  // One entry per recipient, each carrying its own read state — read/
  // unread is per-recipient, never a single flag shared by everyone a
  // notification was sent to.
  recipients: NotificationRecipient[];
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  createdAt: Date;
  updatedAt: Date;
}

const notificationRecipientSchema = new Schema<NotificationRecipient>(
  {
    user_ref: { type: Types.ObjectId, ref: 'User', required: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { _id: false }
);

const notificationSchema = new Schema<Notification>(
  {
    sender_ref: {
      type: Types.ObjectId,
      ref: 'User',
      default: null,
    },
    recipients: {
      type: [notificationRecipientSchema],
      required: true,
      validate: {
        validator: (recipients: NotificationRecipient[]) =>
          recipients.length > 0,
        message: 'At least one recipient is required.',
      },
    },
    type: {
      type: String,
      enum: ['DELIVERY_ASSIGNED'],
      required: true,
    },
    title: {
      type: String,
      maxLength: 255,
      required: true,
    },
    message: {
      type: String,
      maxLength: 2000,
      required: true,
    },
    actionUrl: {
      type: String,
      default: null,
    },
    priority: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH'],
      default: 'NORMAL',
    },
  },
  {
    timestamps: true,
  }
);

// ADMIN-only content fields — see NotificationController.update, which
// additionally lets a recipient patch only their own recipients[].isRead.
// That can't be expressed as a static whitelist (it's a nested field keyed
// by which caller is asking), so it's handled directly in the controller.
export const couldBeUpdated = ['title', 'message', 'actionUrl', 'priority'];

const notificationModel = model<Notification>(
  'Notification',
  notificationSchema
);

export default notificationModel;
