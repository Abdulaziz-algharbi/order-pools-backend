import { Document, model, Schema, Types } from 'mongoose';

export interface ProductOffer extends Document {
  // The supplier who created this offer.
  user_ref: Types.ObjectId;
  name: string;
  description: string;
  brand?: string;
  unit: 'PIECE' | 'KG' | 'BOX' | 'CARTON';
  images?: string | null; // link to the images
  wholeQuantity: number;
  price: number;
  status: 'PENDING' | 'NEGOTIATION' | 'APPROVED' | 'REJECTED';
  adminComment?: string;
  // Set when an ADMIN moves status to REJECTED, cleared if it moves away
  // from REJECTED again (see ProductOfferController.update). Drives the TTL
  // index below — null/absent values never expire.
  rejectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const productOfferSchema = new Schema<ProductOffer>(
  {
    user_ref: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: { type: String, required: true },
    description: { type: String, required: true },
    brand: { type: String, default: null },
    unit: {
      type: String,
      enum: ['PIECE', 'KG', 'BOX', 'CARTON'],
      default: 'PIECE',
    },
    images: { type: String, default: null },
    wholeQuantity: { type: Number, required: true },
    price: { type: Number, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'NEGOTIATION', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    adminComment: { type: String, default: null },
    rejectedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// A rejected offer is auto-deleted 7 days after rejection (mirrors the
// Email model's TTL pattern). rejectedAt stays null outside REJECTED, so
// the index never fires for any other status.
productOfferSchema.index(
  { rejectedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 7 }
);

export const couldBeUpdated = [
  'name',
  'description',
  'brand',
  'unit',
  'images',
  'wholeQuantity',
  'price',
  'status',
  'adminComment',
];

const productOfferModel = model<ProductOffer>(
  'ProductOffer',
  productOfferSchema
);

export default productOfferModel;
