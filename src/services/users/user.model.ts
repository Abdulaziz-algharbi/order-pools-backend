import { model, Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcrypt';

// used as a reference:

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string; // hashed sha256
  companyName: string;
  role?: 'ADMIN' | 'SUPPLIER' | 'RETAILER';
  commercialRegistration?: string | null;
  vatNumber?: string | null;
  addresses: Types.ObjectId[]; // id addresses and some most retrieval fields
  profileImage?: string | null; // link to the image
  isVerified?: boolean;
  status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true },
    companyName: { type: String, required: true },
    password: { type: String, required: true }, // hashed sha256
    role: {
      type: String,
      enum: ['ADMIN', 'SUPPLIER', 'RETAILER'],
      default: 'RETAILER',
    },
    commercialRegistration: { type: String, default: null },
    vatNumber: { type: String, default: null },
    addresses: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'Address',
          required: true,
        },
      ],
      validate: {
        validator: function (addresses) {
          return addresses.length > 0;
        },
        message: 'At least one address is required.',
      },
      default: [],
    },

    profileImage: { type: String, default: null }, // base64 encoded string
    isVerified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'PENDING'],
      default: 'PENDING',
    },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

export const couldBeUpdated = [
  'firstName',
  'lastName',
  'email',
  'phoneNumber',
  'password',
  'commercialRegistration',
  'vatNumber',
  'profileImage',
];

userSchema.pre('save', async function () {
  // Only hash if the password was changed or it is a new user
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const UserModel = model<IUser>('User', userSchema);

export default UserModel;
