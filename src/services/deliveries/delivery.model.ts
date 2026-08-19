import { model, Schema, Document, Types } from 'mongoose';

interface Delivery extends Document {
  batch_ref: Types.ObjectId;
  deliveryStatus: 'PENDING' | 'DELIVERING' | 'DELIVERED';
  deliveredAt: Date | 'Not Set';
}

const deliverySchema = new Schema<Delivery>({
  batch_ref: {
    type: Types.ObjectId,
    ref: 'Batch',
    required: true,
  },
  deliveryStatus: {
    type: String,
    enum: ['PENDING', 'DELIVERING', 'DELIVERED'],
    default: 'PENDING',
  },
  deliveredAt: {
    type: Date,
    default: 'Not Set',
  },
});

const deliveryModel = model<Delivery>('Delivery', deliverySchema);

export default deliveryModel;
