import { model, Schema, Document, Types } from 'mongoose';

interface SupplierPayout extends Document {
  pool_ref: Types.ObjectId;
  // The supplier's agreed price for the offer (ProductOffer.price at the
  // time the payout is created — see SupplierPayoutController.create).
  // The platform's margin is fixed by the admin up front, baked into
  // Pool.pricePerUnit vs. this price when the pool is created, so it is
  // never recomputed from actual retailer payments here.
  amount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  // Thawani has no vendor/marketplace payout capability (verified against
  // its full API surface — see thawani.gateway.ts) — paying the supplier
  // is a manual transfer an admin performs outside Thawani entirely, and
  // this is that transfer's own reference (a bank transfer id, etc.), not
  // a Thawani transaction id.
  transactionReference?: string | null;
  paidAt?: Date | null;
}

const supplierPayoutSechema = new Schema<SupplierPayout>(
  {
    pool_ref: {
      type: Types.ObjectId,
      ref: 'Pool',
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    transactionReference: {
      type: String,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ADMIN-only, and only the execution-tracking fields — amount itself is
// fixed at creation (see the model interface above).
export const couldBeUpdated = ['status', 'transactionReference', 'paidAt'];

const SupplierPayoutModel = model<SupplierPayout>(
  'SupplierPayout',
  supplierPayoutSechema
);

export default SupplierPayoutModel;
