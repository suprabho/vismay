import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'viewer' | 'editor' | 'admin';

export interface IUser extends Document {
  firebaseUid:  string;
  email:        string;
  displayName:  string;
  role:         UserRole;
  photoURL:     string | null;
  bio:          string | null;
  createdAt:    Date;
  updatedAt:    Date;
}

const UserSchema = new Schema<IUser>(
  {
    firebaseUid:  { type: String, required: true, unique: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName:  { type: String, required: true, maxlength: 80, trim: true },
    role:         { type: String, enum: ['viewer', 'editor', 'admin'], default: 'viewer' },
    photoURL:     { type: String, default: null },
    bio:          { type: String, maxlength: 400, default: null },
  },
  { timestamps: true }
);

UserSchema.index({ createdAt: -1 });

export const User = mongoose.model<IUser>('User', UserSchema);
