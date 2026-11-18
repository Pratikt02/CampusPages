// One-time (and safe to repeat) database initialisation: creates/updates every index declared by the models.
// Usage: npm run init-db   (needs MONGODB_URI). Does not create users: see create-user.js.
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Subject } from '../models/Subject.js';
import { Document } from '../models/Document.js';
import { AuditEvent } from '../models/AuditEvent.js';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI is not set'); process.exit(1); }
await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
try {
  for (const m of [User, Session, Subject, Document, AuditEvent]) {
    await m.syncIndexes();
    const idx = await m.collection.indexes();
    console.log(`${m.modelName}: ${idx.map((i) => i.name).join(', ')}`);
  }
  console.log('Indexes are up to date.');
} catch (e) { console.error(`Failed: ${e.message.split('\n')[0]}`); process.exitCode = 1; } finally { await mongoose.disconnect(); }
