import { model, Schema, Document, Types } from 'mongoose';

interface Complaint extends Document {
  // The retailer or supplier who filed the complaint.
  creator_ref: Types.ObjectId;
  // Admin walks Pool -> ProductOffer/PoolParticipant/Delivery from here to
  // get the details needed to act, instead of the complaint carrying a
  // direct delivery_ref.
  pool_ref: Types.ObjectId;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'UNDER REVIEW' | 'RESOLVED';
  resolution: string;
}

const complaintSchema = new Schema<Complaint>({
  creator_ref: {
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  },
  pool_ref: {
    type: Types.ObjectId,
    ref: 'Pool',
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

// The full set an ADMIN may patch. A non-admin owner is restricted to a
// smaller subset (title/description/priority) — see
// ComplaintController.update, since that restriction is per-caller and
// can't be expressed as one static whitelist.
export const couldBeUpdated = [
  'title',
  'description',
  'priority',
  'resolution',
  'status',
];

const complaintModel = model<Complaint>('Complaint', complaintSchema);

export default complaintModel;
