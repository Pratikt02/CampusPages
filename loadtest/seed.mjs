// Creates N throw-away load-test users WITH ready-made sessions (so a load test does not have to hit the rate-limited,
// deliberately slow login). Writes loadtest/cookies.json (git-ignored). TEST DATABASES ONLY.
//   MONGODB_URI=... node loadtest/seed.mjs --users 60
//   MONGODB_URI=... node loadtest/seed.mjs --cleanup
import crypto from 'node:crypto';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { User } from '../server/src/models/User.js';
import { Session } from '../server/src/models/Session.js';
import { hashPassword } from '../server/src/services/password.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI is not set'); process.exit(1); }
if (process.env.NODE_ENV === 'production') { console.error('Refusing to run with NODE_ENV=production.'); process.exit(1); }
if (/mongodb\.net/.test(uri) && !process.argv.includes('--i-know-this-is-a-test-database')) {
  console.error('This looks like an Atlas cluster. Load-test users must only be created in a TEST database. Re-run with --i-know-this-is-a-test-database if that is true.'); process.exit(1);
}
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
try {
  const re = /^loadtest\+\d+@campuspages\.test$/;
  const old = await User.find({ email: re }).select('_id').lean();
  await Session.deleteMany({ user: { $in: old.map((u) => u._id) } }); await User.deleteMany({ email: re });
  if (process.argv.includes('--cleanup')) { console.log(`Removed ${old.length} load-test users and their sessions.`); }
  else {
    const n = Number(arg('users', 50)); const passwordHash = await hashPassword(crypto.randomBytes(24).toString('base64url')); // random: nobody can log in as these users
    const users = await User.insertMany(Array.from({ length: n }, (_, i) => ({ name: `Load Test ${i + 1}`, email: `loadtest+${i + 1}@campuspages.test`, role: 'student', status: 'active', passwordHash })));
    const cookies = []; const now = Date.now(); const docs = [];
    for (const u of users) {
      const token = crypto.randomBytes(32).toString('base64url');
      docs.push({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), user: u._id, csrfToken: crypto.randomBytes(24).toString('base64url'), lastSeenAt: new Date(now), idleExpiresAt: new Date(now + 8 * 3600e3), expiresAt: new Date(now + 8 * 3600e3) });
      cookies.push(`cp_sid=${token}`);
    }
    await Session.insertMany(docs);
    fs.writeFileSync(new URL('./cookies.json', import.meta.url), JSON.stringify({ cookieName: 'cp_sid', cookies }));
    console.log(`Created ${n} users with sessions; wrote loadtest/cookies.json. Remove them afterwards with --cleanup.`);
  }
} finally { await mongoose.disconnect(); }
