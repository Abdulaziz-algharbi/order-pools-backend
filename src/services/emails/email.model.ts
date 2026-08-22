import { model, Schema, Document } from 'mongoose';

export interface IEmail extends Document {
  to: string;
  subject: string;
  text: string;
  html?: string;
  sentAt: Date;
}

const emailSchema = new Schema<IEmail>({
  to: { type: String, required: true },
  subject: { type: String, required: true },
  text: { type: String, required: true },
  html: { type: String },
  sentAt: { type: Date, default: Date.now },
});

emailSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }); // Emails will be removed after 7 days

const EmailModel = model<IEmail>('Email', emailSchema);

export default EmailModel;
