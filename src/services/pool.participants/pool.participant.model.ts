import { model, Schema, Document, Types } from 'mongoose';

export interface PoolParticipant extends Document {
  user_ref: Types.ObjectId;
  pool_ref: Types.ObjectId;
  payment_ref: Types.ObjectId;
  delivery_ref: Types.ObjectId | 'NOT SET';
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
    delivery_ref: {
      type: Schema.Types.Mixed,
      validate: {
        validator: function (v) {
          return typeof v === 'string' || v instanceof Types.ObjectId;
        },
        message: (props) => `${props.value} is not a valid string or date`,
      },
      ref: 'Delivery',
      default: 'NOT SET',
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
