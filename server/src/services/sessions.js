import crypto from 'node:crypto';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const TOUCH_EVERY_MS = 60_000;

export async function createSession(userId, config, now = new Date()) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  await Session.create({
    tokenHash: sha256(token), user: userId, csrfToken, lastSeenAt: now,
    idleExpiresAt: new Date(+now + config.sessionIdleMinutes * 60_000),
    expiresAt: new Date(+now + config.sessionAbsoluteHours * 3_600_000),
  });
  return { token, csrfToken };
}

// Returns { session, user } or null. Checks revocation, both expiries, and the CURRENT account status in the database.
// One round trip ($lookup) instead of two (find + populate): this runs on every authenticated request, and the free MongoDB Atlas tier
// allows only ~100 operations per second. passwordHash is never read.
export async function resolveSession(token, config, now = new Date()) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const [row] = await Session.aggregate([
    { $match: { tokenHash: sha256(token) } },
    { $lookup: { from: User.collection.name, localField: 'user', foreignField: '_id', as: 'u' } },
    { $unwind: '$u' },
    { $project: { csrfToken: 1, lastSeenAt: 1, idleExpiresAt: 1, expiresAt: 1, revokedAt: 1, 'u._id': 1, 'u.name': 1, 'u.email': 1, 'u.role': 1, 'u.status': 1 } },
  ]);
  if (!row || row.revokedAt || row.expiresAt <= now || row.idleExpiresAt <= now) return null;
  if (row.u.status !== 'active') return null;
  if (now - row.lastSeenAt > TOUCH_EVERY_MS) {
    await Session.updateOne({ _id: row._id }, { lastSeenAt: now, idleExpiresAt: new Date(Math.min(+row.expiresAt, +now + config.sessionIdleMinutes * 60_000)) });
  }
  return { session: { _id: row._id, csrfToken: row.csrfToken }, user: row.u };
}

export const revokeSession = (id) => Session.updateOne({ _id: id }, { revokedAt: new Date() });
export const revokeAllForUser = (userId) =>
  Session.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });

// Keeps at most `max` live sessions per user by revoking the oldest (limits the blast radius of leaked/forgotten sessions).
export async function enforceSessionCap(userId, max, now = new Date()) {
  const live = await Session.find({ user: userId, revokedAt: null, expiresAt: { $gt: now } }).sort({ createdAt: 1, _id: 1 }).select('_id').lean();
  const excess = live.length - max;
  if (excess > 0) await Session.updateMany({ _id: { $in: live.slice(0, excess).map((x) => x._id) } }, { revokedAt: now });
}
