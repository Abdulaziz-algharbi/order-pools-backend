import { model, Schema, Document, Types } from 'mongoose';

interface Shipment extends Document {
  pool_ref: Types.ObjectId;
  preparedQuantity: number;
  expectedReadyDate: Date;
  actualReadyDate: Date | 'Not Set';
  pickUpDate: Date | 'Not Set';
  pickedUpAt: Date | 'Not Set';
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
      type: Schema.Types.Mixed,
      validate: {
        validator: function (v) {
          return typeof v === 'string' || v instanceof Date;
        },
        message: (props) => `${props.value} is not a valid string or date`,
      },
      default: 'Not Set',
    },
    pickUpDate: {
      type: Schema.Types.Mixed,
      validate: {
        validator: function (v) {
          return typeof v === 'string' || v instanceof Date;
        },
        message: (props) => `${props.value} is not a valid string or date`,
      },
      default: 'Not Set',
    },
    pickedUpAt: {
      type: Schema.Types.Mixed,
      validate: {
        validator: function (v) {
          return typeof v === 'string' || v instanceof Date;
        },
        message: (props) => `${props.value} is not a valid string or date`,
      },
      default: 'Not Set',
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
