import { model, Schema, Document, Types } from 'mongoose';

// eslint-disable-next-line no-unused-vars
import Product from '../products/product.model';

export interface ProductOffer extends Document {
  // Ref_ID product ID
  product_ref: Types.ObjectId;
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
    product_ref: {
      type: Types.ObjectId,
      ref: 'Product',
    },
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
