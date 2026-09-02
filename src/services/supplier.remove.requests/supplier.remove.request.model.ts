import { Document, model, Schema, Types } from 'mongoose';

export type SupplierRemoveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SupplierRemoveRequest extends Document {
  // The SUPPLIER (or dual-role SUPPLIER+RETAILER) account asking to be
  // removed. Created by AuthController.remove — never posted directly by
  // a client — since a SUPPLIER can't self-delete the way a plain
  // RETAILER can (see auth.controller.ts).
  user_ref: Types.ObjectId;
  reason: string;
  status: SupplierRemoveRequestStatus;
  adminComment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const supplierRemoveRequestSchema = new Schema<SupplierRemoveRequest>(
  {
    user_ref: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: { type: String, required: true },
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

// ADMIN-only patch target (approve/reject) — see
// SupplierRemoveRequestController.update. The owner never patches their own
// request (there's nothing for them to edit once reason is submitted); they
// may only withdraw it via delete while it's still PENDING.
export const couldBeUpdated = ['status', 'adminComment'];

const supplierRemoveRequestModel = model<SupplierRemoveRequest>(
  'SupplierRemoveRequest',
  supplierRemoveRequestSchema
);

export default supplierRemoveRequestModel;
