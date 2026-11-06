import http from 'node:http';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createMemoryStorage } from '../src/storage/memoryAdapter.js';
import { flushAll } from '../src/cache/index.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Subject } from '../src/models/Subject.js';
import { Document } from '../src/models/Document.js';
import { hashPassword } from '../src/services/password.js';

const ORIGIN = 'http://localhost:5173';
const PW = 'correct-horse-battery';
const BASE = { NODE_ENV: 'test', CLIENT_ORIGINS: ORIGIN, LOGIN_MAX_PER_15MIN: '1000' };
let mongod, app, storage, server, port, subject, admin, student, student2, S, S2, A;

async function boot(extra = {}) {
  if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
  storage = createMemoryStorage();
  app = createApp(loadConfig({ ...BASE, ...extra }), { storage });
  server = app.listen(0); port = server.address().port;
}
async function login(email) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').set('Origin', ORIGIN).send({ email, password: PW });
  return { agent, csrf: r.body.csrfToken, cookie: r.headers['set-cookie'][0].split(';')[0] };
}
async function seed({ size = 50_000, over = {}, put = true } = {}) {
  const data = crypto.randomBytes(size);
  const _id = new mongoose.Types.ObjectId();
  const objectKey = `campuspages/documents/${_id}/abcdef0123456789abcdef01.pdf`;
  const doc = await Document.create({ _id, title: 'Doc', subject: subject._id, fileType: 'pdf', mimeType: 'application/pdf', fileSize: size, pageCount: 3, objectKey,
    uploader: admin._id, processingStatus: 'ready', publicationStatus: 'published', ...over });
  if (put) storage.objects.set(objectKey, data);
  return { doc, data, key: objectKey, url: `/api/documents/${_id}/content` };
}
// Raw HTTP helper (collects body; reports whether the transfer completed).
const raw = (path, cookie, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ port, path, method, headers: { Cookie: cookie, ...headers } }, (res) => {
    const chunks = []; res.on('data', (c) => chunks.push(c));
    res.on('error', () => {}); // aborted transfers
    res.on('close', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), complete: res.complete }));
  });
  req.on('error', reject); req.end();
});
const until = async (fn, ms = 4000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout waiting'); await new Promise((r) => setTimeout(r, 20)); } };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri());
  await Promise.all([User, Session, Subject, Document].map((m) => m.syncIndexes()));
});
afterAll(async () => { if (server) await new Promise((r) => server.close(r)); await mongoose.disconnect(); await mongod.stop(); });
beforeEach(async () => {
  await Promise.all([User, Session, Subject, Document].map((m) => m.deleteMany({}))); flushAll();
  await boot();
  const passwordHash = await hashPassword(PW);
  admin = await User.create({ name: 'A', email: 'admin@example.edu', role: 'admin', passwordHash });
  student = await User.create({ name: 'S', email: 'student@example.edu', role: 'student', passwordHash });
  student2 = await User.create({ name: 'T', email: 'student2@example.edu', role: 'student', passwordHash });
  subject = await Subject.create({ name: 'OS', slug: 'os' });
  S = await login('student@example.edu'); S2 = await login('student2@example.edu'); A = await login('admin@example.edu');
});
afterEach(() => { storage.hooks.hold = null; });

describe('authorization on every content request', () => {
  it('guests get 401 and no bytes', async () => {
    const f = await seed();
    const r = await request(app).get(f.url);
    expect(r.status).toBe(401); expect(storage.state.getCalls).toBe(0);
  });
  it('allows authenticated users to view documents but prevents downloads', async () => {
  const f = await seed({ size: 256 });

  // Authenticated users can view documents.
  const view = await S.agent.get(f.url);

  expect(view.status).toBe(200);
  expect(view.headers['content-disposition']).toBe('inline');
  expect(view.body).toEqual(f.data);

  // Download requests must be rejected.
  const download = await S.agent.get(`${f.url}?download=true`);
  expect(download.status).toBe(400);

  const downloadYes = await S.agent.get(`${f.url}?download=yes`);
  expect(downloadYes.status).toBe(400);

  // Unauthenticated users cannot access documents.
  const guest = await request(app).get(f.url);
  expect(guest.status).toBe(401);
});
  it('disabled accounts and revoked sessions are blocked on the next request', async () => {
    const f = await seed();
    expect((await S.agent.get(f.url)).status).toBe(200);
    await User.updateOne({ _id: student._id }, { status: 'disabled' });
    expect((await S.agent.get(f.url)).status).toBe(401);
    await User.updateOne({ _id: student._id }, { status: 'active' });
    expect((await S.agent.get(f.url)).status).toBe(200);
    await Session.updateMany({ user: student._id }, { revokedAt: new Date() });
    expect((await S.agent.get(f.url)).status).toBe(401);
    expect((await S2.agent.get(f.url)).status).toBe(200); // other users unaffected
  });
  it('unpublishing or deleting blocks the very next request, including range requests on the same session', async () => {
    const f = await seed();
    expect((await S.agent.get(f.url).set('Range', 'bytes=0-9')).status).toBe(206);
    await A.agent.patch(`/api/admin/documents/${f.doc.id}/publish`).set('Origin', ORIGIN).set('X-CSRF-Token', A.csrf).send({ published: false });
    expect((await S.agent.get(f.url).set('Range', 'bytes=10-19')).status).toBe(404);
    await A.agent.patch(`/api/admin/documents/${f.doc.id}/publish`).set('Origin', ORIGIN).set('X-CSRF-Token', A.csrf).send({ published: true });
    expect((await S.agent.get(f.url)).status).toBe(200);
    await A.agent.delete(`/api/admin/documents/${f.doc.id}`).set('Origin', ORIGIN).set('X-CSRF-Token', A.csrf);
    expect((await S.agent.get(f.url)).status).toBe(404);
  });
  it('drafts, unfinished uploads, unknown ids and malformed ids all return the same 404', async () => {
    const draft = await seed({ over: { publicationStatus: 'draft' } });
    const stuck = await seed({ over: { processingStatus: 'uploading', publicationStatus: 'draft' } });
    const bodies = [];
    for (const u of [draft.url, stuck.url, '/api/documents/64b7f0c2a1b2c3d4e5f60718/content', '/api/documents/not-an-id/content']) {
      const r = await S.agent.get(u); expect(r.status).toBe(404); bodies.push(JSON.stringify(r.body));
    }
    expect(new Set(bodies).size).toBe(1); expect(storage.state.getCalls).toBe(0);
  });
  it('cannot be reached by storage key, path tricks, or alternative routes (no client-controlled paths)', async () => {
    const f = await seed();
    const key = encodeURIComponent(f.key);
    for (const u of [`/api/documents/${key}/content`, `/api/documents/${f.doc.id}/../${f.doc.id}/content/x`, `/api/documents/..%2F..%2Fetc%2Fpasswd/content`,
      `/api/content/${f.doc.id}`, `/api/files/${key}`, `/api/documents/${f.doc.id}/content?key=${key}`.replace('?key', '/x?key')]) {
      expect((await S.agent.get(u)).status).toBe(404);
    }
    const ok = await S.agent.get(`${f.url}?key=other-object&path=../../x`); // stray params are ignored, never used
    expect(ok.status).toBe(200); expect(ok.body.equals(f.data)).toBe(true);
  });
  it('is not per-student: any active user can read a published document, and admins too', async () => {
    const f = await seed();
    for (const s of [S, S2, A]) expect((await s.agent.get(f.url)).status).toBe(200);
  });
});

describe('response headers and bodies', () => {
  it('returns the full file with safe, private, non-cacheable headers and leaks no storage details', async () => {
    const f = await seed({ size: 30_000 });
    const r = await S.agent.get(f.url).buffer(true).parse((res, cb) => { const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(r.status).toBe(200); expect(r.body.equals(f.data)).toBe(true);
    const h = r.headers;
    expect(h['content-type']).toBe('application/pdf'); expect(h['content-length']).toBe('30000'); expect(h['accept-ranges']).toBe('bytes');
    expect(h['cache-control']).toBe('private, no-store'); expect(h['content-disposition']).toBe('inline');
    expect(h['x-content-type-options']).toBe('nosniff'); expect(h['content-security-policy']).toMatch(/sandbox/);
    expect(h.etag).toBeUndefined(); expect(h['last-modified']).toBeUndefined(); expect(h['x-powered-by']).toBeUndefined();
    expect(JSON.stringify(h)).not.toMatch(/campuspages\/documents|cloudinary|signature|sig=/i);
  });
  it('uses the server-recorded MIME type for images', async () => {
    const f = await seed({ over: { fileType: 'image', mimeType: 'image/png' } });
    expect((await S.agent.get(f.url)).headers['content-type']).toBe('image/png');
  });
  it('HEAD returns headers only and never contacts storage', async () => {
    const f = await seed({ size: 777 });
    const r = await raw(f.url, S.cookie, {}, 'HEAD');
    expect(r.status).toBe(200); expect(r.headers['content-length']).toBe('777'); expect(r.body.length).toBe(0);
    expect(storage.state.getCalls).toBe(0);
  });
  it('JSON error responses never inherit content headers', async () => {
    const f = await seed({ size: 1000 });
    const r = await S.agent.get(f.url).set('Range', 'bytes=5000-');
    expect(r.status).toBe(416); expect(r.headers['content-range']).toBe('bytes */1000');
    expect(r.headers['content-type']).toMatch(/application\/json/); expect(r.headers['content-disposition']).toBeUndefined();
    expect(r.body.error.code).toBe('RANGE_NOT_SATISFIABLE');
  });
});

describe('byte ranges (PDF.js compatible)', () => {
  it('serves partial content with correct Content-Range / Content-Length', async () => {
    const f = await seed({ size: 10_000 });
    for (const [hdr, s, e] of [['bytes=0-99', 0, 99], ['bytes=9900-', 9900, 9999], ['bytes=-100', 9900, 9999], ['bytes=9990-99999', 9990, 9999], ['bytes=5000-5000', 5000, 5000]]) {
      const r = await raw(f.url, S.cookie, { Range: hdr });
      expect(r.status).toBe(206); expect(r.headers['content-range']).toBe(`bytes ${s}-${e}/10000`); expect(r.headers['content-length']).toBe(String(e - s + 1));
      expect(r.body.equals(f.data.subarray(s, e + 1))).toBe(true); expect(r.complete).toBe(true);
    }
  });
  it('returns 416 for unsatisfiable or malformed ranges and serves the full file for ignorable ones', async () => {
    const f = await seed({ size: 1000 });
    for (const hdr of ['bytes=1000-', 'bytes=2000-3000', 'bytes=9-2', 'bytes=abc', 'bytes=-0']) {
      const r = await raw(f.url, S.cookie, { Range: hdr }); expect(r.status).toBe(416); expect(r.headers['content-range']).toBe('bytes */1000');
    }
    for (const hdr of ['items=0-5', 'bytes=0-5,10-15']) {
      const r = await raw(f.url, S.cookie, { Range: hdr }); expect(r.status).toBe(200); expect(r.body.equals(f.data)).toBe(true);
    }
    const ifr = await raw(f.url, S.cookie, { Range: 'bytes=0-5', 'If-Range': '"abc"' }); expect(ifr.status).toBe(200);
  });
});

describe('failures, disconnects, limits', () => {
  it('storage unavailable before streaming -> consistent 502 JSON, no key leak, slot released', async () => {
    const f = await seed(); storage.hooks.failGet = true;
    const r = await S.agent.get(f.url);
    expect(r.status).toBe(502); expect(r.body.error.code).toBe('STORAGE_ERROR'); expect(JSON.stringify(r.body)).not.toMatch(/campuspages|simulated/);
    storage.hooks.failGet = false; expect((await S.agent.get(f.url)).status).toBe(200);
  });
  it('object missing from storage for a ready document -> 404', async () => {
    const f = await seed({ put: false });
    const r = await S.agent.get(f.url); expect(r.status).toBe(404); expect(r.body.error.code).toBe('NOT_FOUND');
  });
  it('mid-stream storage failure aborts the transfer instead of appending JSON to a started body', async () => {
    const f = await seed({ size: 200_000 }); storage.hooks.failMidStream = true;
    const r = await raw(f.url, S.cookie);
    expect(r.status).toBe(200); expect(r.complete).toBe(false);
    expect(r.body.length).toBeLessThan(200_000); expect(r.body.toString('latin1')).not.toContain('"error"');
    await until(() => storage.state.openStreams === 0);
  });
  it('client disconnect stops reading from storage and frees resources', async () => {
    const f = await seed({ size: 4 * 1024 * 1024 });
    await new Promise((resolve) => { const req = http.get({ port, path: f.url, headers: { Cookie: S.cookie } }, (res) => { res.once('data', () => { req.destroy(); resolve(); }); }); req.on('error', () => {}); });
    await until(() => storage.state.openStreams === 0);
    expect((await S.agent.get(f.url)).status).toBe(200);
  });
  it('enforces per-user concurrent stream limits (503 + Retry-After) and releases slots on disconnect', async () => {
    await boot({ MAX_STREAMS_PER_USER: '1' });
    const passwordHash = await hashPassword(PW); // new app instance shares the DB; re-login for fresh sessions
    const S1 = await login('student@example.edu'); const S2b = await login('student2@example.edu');
    const f = await seed(); let open; storage.hooks.hold = new Promise((r) => { open = r; });
    const held = http.get({ port, path: f.url, headers: { Cookie: S1.cookie } }); held.on('error', () => {});
    await until(() => storage.state.openStreams === 1);
    const blocked = await raw(f.url, S1.cookie); expect(blocked.status).toBe(503); expect(blocked.headers['retry-after']).toBe('5');
    storage.hooks.hold = null; open();
    const other = await raw(f.url, S2b.cookie); expect(other.status).toBe(200); // different user is not affected
    held.destroy(); await until(() => storage.state.openStreams === 0);
    expect((await raw(f.url, S1.cookie)).status).toBe(200);
    void passwordHash;
  });
  it('enforces the global stream cap', async () => {
    await boot({ MAX_STREAMS_GLOBAL: '1' });
    const S1 = await login('student@example.edu'); const S2b = await login('student2@example.edu');
    const f = await seed(); let open; storage.hooks.hold = new Promise((r) => { open = r; });
    const held = http.get({ port, path: f.url, headers: { Cookie: S1.cookie } }); held.on('error', () => {});
    await until(() => storage.state.openStreams === 1);
    expect((await raw(f.url, S2b.cookie)).status).toBe(503);
    held.destroy(); storage.hooks.hold = null; open(); await until(() => storage.state.openStreams === 0);
  });
  it('terminates streams that exceed the stream timeout', async () => {
    await boot({ STREAM_TIMEOUT_SECONDS: '0.4' });
    const S1 = await login('student@example.edu');
    const f = await seed(); let open; storage.hooks.hold = new Promise((r) => { open = r; });
    const t = Date.now();
    // Before any byte is sent the client sees a dropped connection; after some bytes, an incomplete response. Both mean "terminated".
    const outcome = await raw(f.url, S1.cookie).then((r) => ({ complete: r.complete }), () => ({ complete: false }));
    expect(Date.now() - t).toBeGreaterThanOrEqual(350); expect(outcome.complete).toBe(false);
    storage.hooks.hold = null; open(); await until(() => storage.state.openStreams === 0);
  });
  it('rate limits content requests per user', async () => {
    await boot({ CONTENT_MAX_PER_MIN: '3' });
    const S1 = await login('student@example.edu'); const S2b = await login('student2@example.edu');
    const f = await seed({ size: 100 }); const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await raw(f.url, S1.cookie)).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    expect((await raw(f.url, S2b.cookie)).status).toBe(200); // limit is per user, not shared
  });
});
