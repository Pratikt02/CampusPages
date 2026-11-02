import mongoose from 'mongoose';

export const ROLES = ['student', 'admin'];
export const STATUSES = ['active', 'disabled'];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  studentId: { type: String, trim: true, maxlength: 40, unique: true, sparse: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, required: true, default: 'student' },
  status: { type: String, enum: STATUSES, required: true, default: 'active' },
}, { timestamps: true });

userSchema.index({ role: 1, status: 1 });
export const User = mongoose.models.User || mongoose.model('User', userSchema);
