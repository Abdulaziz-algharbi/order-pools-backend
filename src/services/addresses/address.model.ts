import { model, Schema, Document } from 'mongoose';

export interface Address extends Document {
  // Ref_ID userID one supllier could have many address (many stores)
  location: string; // url location (.e.g google map)
  region: string;
  city: string;
  street?: string;
}

const addressSchema = new Schema<Address>({
  location: { type: String, required: true },
  region: { type: String, required: true },
  city: { type: String, required: true },
  street: { type: String, default: null },
});

export const couldBeUpdated = ['location', 'region', 'city', 'street'];

const AddressModel = model<Address>('Address', addressSchema);

export default AddressModel;
