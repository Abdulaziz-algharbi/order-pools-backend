import { model, Schema, Document, Types } from 'mongoose';

interface DistributionBatch extends Document {
  shipment_ref: Types.ObjectId;
  deliveryDate: Date;
  region: string;
  assignedDriver: {
    name: string;
    phone: string;
  };
}

const distributionBatchSchema = new Schema<DistributionBatch>({
  shipment_ref: {
    type: Types.ObjectId,
    ref: 'Shipment',
    required: true,
  },
  deliveryDate: {
    type: Date,
    required: true,
  },
  region: {
    type: String,
    required: true,
  },
  assignedDriver: {
    type: {
      name: String,
      phone: String,
    },
    required: true,
  },
});

export const couldBeUpdated = ['deliveryDate', 'assignedDriver'];

const distributionBatchModel = model<DistributionBatch>(
  'Batch',
  distributionBatchSchema
);

export default distributionBatchModel;
