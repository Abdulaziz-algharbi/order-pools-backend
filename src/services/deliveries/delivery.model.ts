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
    type: Schema.Types.Mixed,
    validate: {
      validator: function (v) {
        return typeof v === 'string' || v instanceof Date;
      },
      message: (props) => `${props.value} is not a valid string or date`,
    },
    default: 'Not Set',
  },
});

export const couldBeUpdated = ['deliveryStatus', 'deliveredAt'];

const deliveryModel = model<Delivery>('Delivery', deliverySchema);

export default deliveryModel;
