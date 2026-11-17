import mongoose from 'mongoose';

const passwordResetOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, maxlength: 254 },
  codeHash: { type: String, required: true },
  attempts: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

passwordResetOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PasswordResetOtp = mongoose.models.PasswordResetOtp || mongoose.model('PasswordResetOtp', passwordResetOtpSchema);
