import { model, Schema, Document, Types } from 'mongoose';

interface SupplierPayout extends Document {
  pool_ref: Types.ObjectId;
  grossAmount: number;
  platformCommission: number;
  netAmount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  transactionReference: string; // url to s3 service that saves paper transactions
  paidAt: Date;
}

const supplierPayoutSechema = new Schema<SupplierPayout>(
  // need to be reviewed to do the calculation in the backend!
  {
    pool_ref: {
      type: Types.ObjectId,
      ref: 'Pool',
      required: true,
    },
    grossAmount: {
      type: Number,
      required: true,
    },
    platformCommission: {
      type: Number,
      required: true,
    },
    netAmount: {
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
    },
  },
  {
    timestamps: true,
  }
);

const SupplierPayoutModel = model<SupplierPayout>(
  'SupplierPayout',
  supplierPayoutSechema
);

export default SupplierPayoutModel;
