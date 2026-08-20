import { model, Schema, Document, Types } from 'mongoose';

interface Payment extends Document {
  user_ref: Types.ObjectId;
  transactionReference: string; // url to the paper (# may be stored in s3)
  amount: number;
  currency: 'OMR' | 'USD';
  stripePaymentIntentId: string;
  status: 'REQUIRES_CAPTURE' | 'COMPLETED' | 'REFUNDED';
  createdAt: Date;
}

const paymentSchema = new Schema<Payment>(
  {
    // Ref_ID user ID
    user_ref: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    transactionReference: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      enum: ['OMR', 'USD'],
      default: 'OMR',
    },
    stripePaymentIntentId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['REQUIRES_CAPTURE', 'COMPLETED', 'REFUNDED'],
      default: 'REQUIRES_CAPTURE',
    },
  },
  {
    timestamps: true,
  }
);

export const couldBeUpdated = ['amount'];

const paymentModel = model<Payment>('Payment', paymentSchema);

export default paymentModel;
