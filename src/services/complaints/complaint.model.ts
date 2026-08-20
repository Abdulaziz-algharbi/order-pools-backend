import { model, Schema, Document, Types } from 'mongoose';

interface Complaint extends Document {
  delivery_ref: Types.ObjectId;
  retailer_ref: Types.ObjectId;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'UNDER REVIEW' | 'RESOLVED';
  resolution: string;
}

const complaintSchema = new Schema<Complaint>({
  delivery_ref: {
    type: Types.ObjectId,
    ref: 'Delivery',
    required: true,
  },
  retailer_ref: {
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    maxLength: 255,
    required: true,
  },
  description: {
    type: String,
    maxLength: 2000,
    required: true,
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM',
  },
  status: {
    type: String,
    enum: ['OPEN', 'UNDER REVIEW', 'RESOLVED'],
    default: 'OPEN',
  },
  resolution: {
    type: String,
    maxLength: 2000,
  },
});

export const couldBeUpdated = [
  'title',
  'description',
  'priority',
  'resolution',
];

const complaintModel = model<Complaint>('Complaint', complaintSchema);

export default complaintModel;
