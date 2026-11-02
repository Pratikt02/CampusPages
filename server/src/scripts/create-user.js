import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Usage (no web endpoint exists for this):
//   node --env-file=.env src/scripts/create-user.js --role admin --email a@b.edu --name "Ada Admin"
// Password: read from CAMPUSPAGES_NEW_PASSWORD, else prompted (input is hidden). Never passed as an argument.
import readline from 'node:readline';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { hashPassword, validatePasswordPolicy } from '../services/password.js';

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };

function promptHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

const role = arg('role') ?? 'student', email = arg('email'), name = arg('name'), studentId = arg('student-id');
if (!['admin', 'student'].includes(role) || !email || !name) {
  console.error('Required: --email, --name; optional: --role admin|student, --student-id'); process.exit(1);
}
const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI is not set'); process.exit(1); }

const password = process.env.CAMPUSPAGES_NEW_PASSWORD || await promptHidden('Password (10-128 chars): ');
if (!validatePasswordPolicy(password)) { console.error('Password must be 10-128 characters.'); process.exit(1); }

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
try {
  await User.syncIndexes();
  await User.create({ name, email, studentId, role, passwordHash: await hashPassword(password) });
  console.log(`Created ${role}: ${email.toLowerCase()}`);
} catch (e) {
  console.error(e.code === 11000 ? 'A user with that email or student ID already exists.' : `Failed: ${e.message}`);
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
