import { model, Schema, Document, Types } from 'mongoose';

export interface PoolParticipant extends Document {
  user_ref: Types.ObjectId;
  pool_ref: Types.ObjectId;
  payment_ref: Types.ObjectId;
  address_ref: Types.ObjectId;
  quantity: number;
  status: 'WAITING' | 'REFUNDED' | 'DELIVERED';
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
      enum: ['WAITING', 'REFUNDED', 'DELIVERED'],
      default: 'WAITING',
    },
  },
  {
    timestamps: true,
  }
);

export const couldBeUpdated = ['quantity'];

const poolParticipantModel = model<PoolParticipant>(
  'PoolParticipant',
  poolParticipantSchema
);

export default poolParticipantModel;
