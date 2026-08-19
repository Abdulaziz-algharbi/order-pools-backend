import { model, Schema, Document, Types } from 'mongoose';

interface Notification extends Document {
  sender_ref: Types.ObjectId | null; // it may be from admin;
  recipient_ref: [Types.ObjectId];
  type: 'PRODUCT_APPROVED' | 'NEW OFFER' | 'NEW COMPLAINT'; // we can add more types as system requires
  title: string;
  message: string;
  actionUrl: string; // meeting url or an url refers to fix issue # Not Certain
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  isRead: boolean;
  readAt: Date;
}

const notificationSchema = new Schema<Notification>({
  sender_ref: {
    type: Types.ObjectId,
    ref: 'User',
    default: null,
    required: true,
  },
  recipient_ref: {
    type: [Types.ObjectId],
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['PRODUCT_APPROVED', 'NEW OFFER', 'NEW COMPLAINT'],
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
  },
  priority: {
    type: String,
    enum: ['LOW', 'NORMAL', 'HIGH'],
    default: 'NORMAL',
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
  },
});

const notificationModel = model<Notification>(
  'Notification',
  notificationSchema
);

export default notificationModel;
