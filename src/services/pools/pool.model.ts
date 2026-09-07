import { Document, Schema, Types, model } from 'mongoose';

export interface Pool extends Document {
  // Ref to the product offer
  productoffer_ref: Types.ObjectId;
  // Snapshotted from ProductOffer at pool-creation time (see
  // PoolController.create) so a retailer — who has no read access to
  // ProductOffer, since it carries the supplier's wholesale terms — can
  // still see what the pool is actually for. Immutable after creation
  // except that an admin may correct a typo via PATCH (couldBeUpdated).
  productName: string;
  productDescription: string;
  productImageUrl?: string | null;
  unit: 'PIECE' | 'KG' | 'BOX' | 'CARTON';
  supplierName?: string | null;
  // The pool's starting capacity (== currentQuantity at creation),
  // snapshotted once and never changed by couldBeUpdated — this is the
  // fixed denominator a "collected so far" progress display needs, since
  // currentQuantity itself counts down as participants join.
  targetQuantity: number;
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
    productName: { type: String, required: true },
    productDescription: { type: String, required: true },
    productImageUrl: { type: String, default: null },
    unit: {
      type: String,
      enum: ['PIECE', 'KG', 'BOX', 'CARTON'],
      default: 'PIECE',
    },
    supplierName: { type: String, default: null },
    targetQuantity: { type: Number, required: true },
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
  'productName',
  'productDescription',
  'productImageUrl',
  'unit',
  'supplierName',
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
