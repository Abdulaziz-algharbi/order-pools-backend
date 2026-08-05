import { model, Schema, Document, Types } from 'mongoose';

// eslint-disable-next-line no-unused-vars
import ProductOffer from '../productOffers/productOffer.model';

export interface Meeting extends Document {
  // Ref_id productOfferId
  productOffer_ref: Types.ObjectId;
  meeting: string; // meeting url
  scheduledAt: Date;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  meetingNotes?: string;
}

const meetingSchema = new Schema<Meeting>({
  productOffer_ref: {
    type: Types.ObjectId,
    ref: 'ProductOffer',
  },
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
