import { Document, Schema, Types, model } from 'mongoose';

export interface Pool extends Document {
  // Ref to the product offer
  productoffer_ref: Types.ObjectId;
  currentQuantity: number;
  minimumContribution: number;
  pricePerUnit: number;
  startDate: Date;
  endDate: Date;
  status:
    'OPEN' | 'TARGET_REACHED' | 'DISTRIBUTING' | 'COMPLETED' | 'CANCELLED';
  supplierPaymentStatus: 'NOT_PAID' | 'PAID';
  createdAt: Date;
  updatedAt: Date;
}

const poolSchema = new Schema<Pool>(
  {
    productoffer_ref: {
      type: Types.ObjectId,
      ref: 'ProductOffer',
      required: true,
    },
    currentQuantity: { type: Number, required: true },
    minimumContribution: { type: Number, required: true },
    pricePerUnit: { type: Number, required: true },
    // Defaults to creation time, like createdAt — but unlike createdAt,
    // an admin may reset it (via couldBeUpdated) if a CANCELLED pool is
    // reopened back to OPEN, since the pool's collection window is
    // effectively restarting.
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        'OPEN',
        'TARGET_REACHED',
        'DISTRIBUTING',
        'COMPLETED',
        'CANCELLED',
      ],
      default: 'OPEN',
    },
    supplierPaymentStatus: {
      type: String,
      enum: ['NOT_PAID', 'PAID'],
      default: 'NOT_PAID',
    },
  },
  {
    timestamps: true,
  }
);

export const couldBeUpdated = [
  'currentQuantity',
  'minimumContribution',
  'pricePerUnit',
  'startDate',
  'endDate',
  'status',
  'supplierPaymentStatus',
];

const PoolModel = model<Pool>('Pool', poolSchema);

export default PoolModel;
