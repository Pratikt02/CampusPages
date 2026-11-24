import mongoose from 'mongoose';

export const ROLES = ['student', 'admin'];
export const STATUSES = ['active', 'disabled'];
export const ENGINEERING_BRANCHES = ['CS', 'IT', 'ENTC', 'MECH', 'Civil', 'AIDS'];
export const PREFERRED_LANGUAGES = ['en', 'hi', 'mr', 'gu'];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  studentId: { type: String, trim: true, maxlength: 40, unique: true, sparse: true },
  course: { type: String, trim: true, maxlength: 120, default: '' },
  semester: { type: Number, min: 1, max: 12, default: null },
  branch: { type: String, enum: ENGINEERING_BRANCHES, default: null },
  preferredLanguage: { type: String, enum: PREFERRED_LANGUAGES, default: 'en' },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, required: true, default: 'student' },
  status: { type: String, enum: STATUSES, required: true, default: 'active' },
}, { timestamps: true });

userSchema.index({ role: 1, status: 1 });
export const User = mongoose.models.User || mongoose.model('User', userSchema);
