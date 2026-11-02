import mongoose from 'mongoose';

// Limited, secret-free security events. No passwords, tokens, or IPs are stored in Phase 2.
const schema = new mongoose.Schema({
  type: { type: String, required: true, maxlength: 60 },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  detail: { type: String, maxlength: 200, default: '' },
  at: { type: Date, default: Date.now, index: { expireAfterSeconds: 60 * 60 * 24 * 90 } },
});
export const AuditEvent = mongoose.models.AuditEvent || mongoose.model('AuditEvent', schema);
export const audit = (type, user = null, detail = '') =>
  AuditEvent.create({ type, user, detail: String(detail).slice(0, 200) }).catch(() => {});
