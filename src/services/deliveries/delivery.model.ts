import { model, Schema, Document, Types } from 'mongoose';

interface Delivery extends Document {
  // One delivery per pool: created by an admin once the pool has reached its
  // target (see DeliveryController.create), never by a retailer/supplier.
  pool_ref: Types.ObjectId;
  deliveryStatus: 'PENDING' | 'DELIVERING' | 'DELIVERED';
  deliveredAt: Date | 'Not Set';
}

const deliverySchema = new Schema<Delivery>({
  pool_ref: {
    type: Types.ObjectId,
    ref: 'Pool',
    required: true,
    unique: true,
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
