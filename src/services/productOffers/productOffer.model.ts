import { model, Schema, Document } from 'mongoose';

export interface ProductOffer extends Document {
  // Ref_ID product ID
  wholeQuantity: number;
  price: number;
  status: 'PENDING' | 'NEGOTIATION' | 'APPROVED' | 'REJECTED';
  adminComment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const productOfferSchema = new Schema<ProductOffer>(
  {
    // Ref_ID product ID is required
    wholeQuantity: { type: Number, required: true },
    price: { type: Number, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'NEGOTIATION', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    adminComment: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

export const couldBeUpdated = ['wholeQuantity', 'price', 'adminComment'];

const productOfferModel = model<ProductOffer>(
  'ProductOffer',
  productOfferSchema
);

export default productOfferModel;
