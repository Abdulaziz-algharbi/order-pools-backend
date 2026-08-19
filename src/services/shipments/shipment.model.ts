import { model, Schema, Document, Types } from 'mongoose';

interface Shipment extends Document {
  pool_ref: Types.ObjectId;
  preparedQuantity: number;
  expectedReadyDate: Date;
  actualReadyDate: Date | 'Not Set';
  pickUpDate: Date | 'Not Set';
  pickedUpAt: Date | 'No Set';
  status:
    | 'PREPARATION'
    | 'READY_FOR_PICKUP'
    | 'PICKED_UP'
    | 'DISTRIBUTING'
    | 'COMPLETED';
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const shipmentSchema = new Schema<Shipment>(
  {
    pool_ref: {
      type: Types.ObjectId,
      ref: 'Pool',
      required: true,
    },
    preparedQuantity: {
      type: Number,
      min: 1,
      max: 1000,
      required: true,
    },
    expectedReadyDate: {
      type: Date,
      required: true,
    },
    actualReadyDate: {
      type: Date,
      default: 'Not Set',
    },
    pickUpDate: {
      type: Date,
      default: 'Not Set',
    },
    pickedUpAt: {
      type: Date,
      default: 'No Set',
    },
    status: {
      type: String,
      enum: [
        'PREPARATION',
        'READY_FOR_PICKUP',
        'PICKED_UP',
        'DISTRIBUTING',
        'COMPLETED',
      ],
      default: 'PREPARATION',
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const couldBeUpdated = ['preparedQuantity', 'expectedReadyDate'];

const shipmentModel = model<Shipment>('Shipment', shipmentSchema);

export default shipmentModel;
