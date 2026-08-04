import { model, Schema, Document } from 'mongoose';

export interface Meeting extends Document {
  // Ref_id productOfferId
  meeting: string; // meeting url
  scheduledAt: Date;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  meetingNotes?: string;
}

const meetingSchema = new Schema<Meeting>({
  meeting: { type: String, required: true },
  scheduledAt: { type: Date, required: true },
  status: {
    type: String,
    enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
    default: 'SCHEDULED',
  },
  meetingNotes: { type: String, default: null },
});

export const couldBeUpdated = ['meeting', 'scheduledAt', 'meetingNotes'];

const meetingModel = model<Meeting>('Meeting', meetingSchema);

export default meetingModel;
