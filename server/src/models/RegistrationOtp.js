import mongoose from 'mongoose';

const registrationOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, maxlength: 254 },
  name: { type: String, required: true, maxlength: 100 },
  passwordHash: { type: String, required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

registrationOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RegistrationOtp = mongoose.models.RegistrationOtp || mongoose.model('RegistrationOtp', registrationOtpSchema);
