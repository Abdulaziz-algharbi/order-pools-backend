import { Document, model, Schema, Types } from 'mongoose';

export type SupplierRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SupplierRequest extends Document {
  // The RETAILER asking to also become a SUPPLIER.
  user_ref: Types.ObjectId;
  description: string;
  status: SupplierRequestStatus;
  adminComment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const supplierRequestSchema = new Schema<SupplierRequest>(
  {
    user_ref: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    adminComment: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

// The full set an ADMIN may patch. The owning RETAILER is restricted to a
// smaller subset (description only) while the request is still PENDING —
// see SupplierRequestController.update, since that restriction is
// per-caller and can't be expressed as one static whitelist.
export const couldBeUpdated = ['status', 'adminComment'];

const supplierRequestModel = model<SupplierRequest>(
  'SupplierRequest',
  supplierRequestSchema
);

export default supplierRequestModel;
