import { model, Schema, Document, Types } from 'mongoose';

// used as a reference:

export interface IAuth extends Document {
  refreshToken: string;
  userId: Types.ObjectId; // Reference to the User model
  createdAt: Date;
  updatedAt: Date;
}

const authSchema = new Schema<IAuth>(
  {
    refreshToken: { type: String, required: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// authSchema.index({ email: 1 }, { unique: true }); // Ensure email is unique

const AuthModel = model<IAuth>('Auth', authSchema);

export default AuthModel;
