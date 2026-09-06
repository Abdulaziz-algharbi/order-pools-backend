import { model, Schema, Document, Types } from 'mongoose';

export type PaymentStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'REFUND_FAILED';

export interface Payment extends Document {
  pool_ref: Types.ObjectId;
  poolParticipant_ref: Types.ObjectId;
  user_ref: Types.ObjectId;
  // OMR — the retailer's contribution (quantity * Pool.pricePerUnit at
  // join time), always computed server-side, never client-supplied.
  amount: number;
  currency: 'OMR';
  thawaniSessionId: string;
  // Set once Thawani's `payments` resource resolves for this session
  // (needed as the `payment_id` a refund request targets).
  thawaniPaymentId?: string | null;
  thawaniRefundId?: string | null;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<Payment>(
  {
    pool_ref: {
      type: Types.ObjectId,
      ref: 'Pool',
      required: true,
    },
    poolParticipant_ref: {
      type: Types.ObjectId,
      ref: 'PoolParticipant',
      required: true,
    },
    user_ref: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      enum: ['OMR'],
      default: 'OMR',
    },
    thawaniSessionId: {
      type: String,
      required: true,
    },
    thawaniPaymentId: { type: String, default: null },
    thawaniRefundId: { type: String, default: null },
    status: {
      type: String,
      enum: [
        'PENDING',
        'COMPLETED',
        'FAILED',
        'REFUND_PENDING',
        'REFUNDED',
        'REFUND_FAILED',
      ],
      default: 'PENDING',
    },
  },
  {
    timestamps: true,
  }
);

// No client-facing PATCH — every transition (confirm/cancel/refund) goes
// through a dedicated PaymentController action tied to an actual Thawani
// confirmation, never a generic field write. See payments.controller.ts.
export const couldBeUpdated: string[] = [];

const paymentModel = model<Payment>('Payment', paymentSchema);

export default paymentModel;
