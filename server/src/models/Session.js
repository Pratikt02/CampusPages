import mongoose from 'mongoose';

// Only the SHA-256 hash of the cookie token is stored; a DB leak does not yield usable sessions.
const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  csrfToken: { type: String, required: true },
  lastSeenAt: { type: Date, required: true },
  readingDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
  readingToken: { type: String, default: null },
  readingStartedAt: { type: Date, default: null },
  readingUpdatedAt: { type: Date, default: null },
  idleExpiresAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }, // absolute expiry; TTL index removes the doc
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ revokedAt: 1, lastSeenAt: 1 });
sessionSchema.index({ readingUpdatedAt: 1, readingDocument: 1 });
export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
