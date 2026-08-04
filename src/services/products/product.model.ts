import { model, Schema, Document } from 'mongoose';

export interface Product extends Document {
  // Ref_ID supplier user ID
  name: string;
  description: string;
  brand?: string;
  unit: 'PIECE' | 'KG' | 'BOX' | 'CARTON';
  images?: string | null; // link to the images
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
}

const productSchema = new Schema<Product>(
  {
    // Ref_ID supplier user ID is required
    name: { type: String, required: true },
    description: { type: String, required: true },
    brand: { type: String, default: null },
    unit: {
      type: String,
      enum: ['PIECE', 'KG', 'BOX', 'CARTON'],
      default: 'PIECE',
    },
    images: { type: String, default: null },
    deletedAt: { type: Date, default: null },
  },

  {
    timestamps: true,
  }
);

export const couldBeUpdated = [
  'name',
  'description',
  'brand',
  'unit',
  'images',
];

const productModel = model<Product>('Product', productSchema);

export default productModel;
