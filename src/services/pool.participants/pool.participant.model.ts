import { model, Schema, Document, Types } from 'mongoose';

export interface PoolParticipant extends Document {
  user_ref: Types.ObjectId;
  pool_ref: Types.ObjectId;
  payment_ref: Types.ObjectId;
  address_ref: Types.ObjectId;
  quantity: number;
  // PENDING_PAYMENT: quantity reserved, Thawani checkout not yet confirmed
  // paid. WAITING: payment confirmed, waiting on the pool/delivery
  // outcome (the field's original meaning, unchanged). PAYMENT_FAILED:
  // checkout was cancelled/never completed — reservation released, no
  // money was ever collected. REFUNDED/DELIVERED: unchanged.
  status:
    'PENDING_PAYMENT' | 'WAITING' | 'PAYMENT_FAILED' | 'REFUNDED' | 'DELIVERED';
  joinedAt: Date;
}

const poolParticipantSchema = new Schema<PoolParticipant>(
  {
    // Ref_ID user ID, pool ID and payment ID (hold) are required
    user_ref: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    pool_ref: {
      type: Types.ObjectId,
      ref: 'Pool',
      required: true,
    },
    payment_ref: {
      type: Types.ObjectId,
      ref: 'Payment',
      required: true,
    },
    // Delivery address for this participant's share of the pool — must be
    // one of user_ref's own addresses (checked in the controller, since
    // Mongoose validators can't reach across User.addresses here).
    address_ref: {
      type: Types.ObjectId,
      ref: 'Address',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: [
        'PENDING_PAYMENT',
        'WAITING',
        'PAYMENT_FAILED',
        'REFUNDED',
        'DELIVERED',
      ],
      default: 'PENDING_PAYMENT',
    },
  },
  {
    timestamps: true,
  }
);

// `quantity` is deliberately no longer patchable: it's what the retailer's
// already-created Thawani checkout session was priced against (see
// PoolParticipantController.create), so changing it after the fact would
// desync the claimed quantity from the amount actually charged. Changing
// how much you're contributing now means withdrawing (DELETE, while the
// pool is still OPEN — releases the reservation/refunds if already paid)
// and joining again fresh.
export const couldBeUpdated: string[] = [];

const poolParticipantModel = model<PoolParticipant>(
  'PoolParticipant',
  poolParticipantSchema
);

export default poolParticipantModel;
