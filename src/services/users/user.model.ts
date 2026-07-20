import { model, Schema, Document } from 'mongoose';

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

// userSchema.index({ email: 1 }, { unique: true }); // Ensure email is unique

userSchema.pre('save', function () {
  // salt and hash password here
  // if (!this.isModified('password')) {
  // }
});

const UserModel = model<IUser>('User', userSchema);

export default UserModel;

// User
// PK id: int
// firstName: string
// lastName: string
// email: string
// phoneNumber: string
// passwordHash: string
// role: ADMIN | SUPPLIER | RETAILER
// companyName: string
// commercialRegistration: string
// vatNumber: string
// address: string
// city: string
// country: string
// profileImage: byte
// isVerified: boolean
// status: ACTIVE | SUSPENDED | PENDING
// createdAt: DATETIME
// updatedAt: DATETIME
// deletedAt: DATETIME
