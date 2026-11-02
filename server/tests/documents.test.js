import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createMemoryStorage } from '../src/storage/memoryAdapter.js';
import { runCleanup } from '../src/jobs/cleanup.js';
import { flushAll } from '../src/cache/index.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Subject } from '../src/models/Subject.js';
import { Document } from '../src/models/Document.js';
import { hashPassword } from '../src/services/password.js';

const ORIGIN = 'http://localhost:5173';
const PW = 'correct-horse-battery';
const env = { NODE_ENV: 'test', CLIENT_ORIGINS: ORIGIN, LOGIN_MAX_PER_15MIN: '1000', MAX_UPLOAD_MB: '1', MAX_PDF_PAGES: '3', MAX_IMAGE_MEGAPIXELS: '25' };
let mongod, app, storage, subject, admin, student;

const pdf = async (pages = 1) => { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage(); return Buffer.from(await d.save()); };
const png = (w = 40, h = 30) => sharp({ create: { width: w, height: h, channels: 3, background: '#fff' } }).png().toBuffer();
const jpg = () => sharp({ create: { width: 20, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer();
const webp = () => sharp({ create: { width: 20, height: 10, channels: 3, background: '#fff' } }).webp().toBuffer();

async function login(email) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').set('Origin', ORIGIN).send({ email, password: PW });
  return { agent, csrf: r.body.csrfToken };
}
const send = (s, m, url) => s.agent[m](url).set('Origin', ORIGIN).set('X-CSRF-Token', s.csrf);
function uploadReq(s, { buf, name = 'notes.pdf', mime = 'application/pdf', fields = {}, a = app } = {}) {
  const req = (a === app ? send(s, 'post', '/api/admin/documents') : request(a).post('/api/admin/documents').set('Cookie', s.cookie).set('Origin', ORIGIN).set('X-CSRF-Token', s.csrf));
  const f = { title: 'Unit 1 Notes', subjectId: String(subject._id), ...fields };
  for (const [k, v] of Object.entries(f)) req.field(k, v);
  return buf ? req.attach('file', buf, { filename: name, contentType: mime }) : req;
}
const upload = (s, o) => uploadReq(s, o);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User, Session, Subject, Document].map((m) => m.syncIndexes()));
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
let adminS, studentS;
beforeEach(async () => {
  await Promise.all([User, Session, Subject, Document].map((m) => m.deleteMany({}))); flushAll();
  storage = createMemoryStorage();
  app = createApp(loadConfig(env), { storage });
  const passwordHash = await hashPassword(PW);
  admin = await User.create({ name: 'A', email: 'admin@example.edu', role: 'admin', passwordHash });
  student = await User.create({ name: 'S', email: 'student@example.edu', role: 'student', passwordHash });
  subject = await Subject.create({ name: 'Operating Systems', slug: 'operating-systems' });
  adminS = await login('admin@example.edu'); studentS = await login('student@example.edu');
});

describe('access control', () => {
  it('guests get 401 and students 403 on every admin document route', async () => {
    const id = '64b7f0c2a1b2c3d4e5f60718';
    const routes = [['get', '/api/admin/documents'], ['get', `/api/admin/documents/${id}`], ['post', '/api/admin/documents'],
      ['patch', `/api/admin/documents/${id}`], ['patch', `/api/admin/documents/${id}/publish`], ['put', `/api/admin/documents/${id}/file`], ['delete', `/api/admin/documents/${id}`],
      ['get', '/api/admin/stats'], ['get', '/api/admin/subjects'], ['post', '/api/admin/subjects']];
    for (const [m, url] of routes) {
      expect((await request(app)[m](url).set('Origin', ORIGIN)).status).toBe(401);
      expect((await send(studentS, m, url)).status).toBe(403);
    }
  });
  it('upload requires the CSRF token', async () => {
    const r = await adminS.agent.post('/api/admin/documents').set('Origin', ORIGIN).field('title', 'x');
    expect(r.status).toBe(403); expect(r.body.error.code).toBe('CSRF');
  });
});

describe('upload validation', () => {
  it('accepts a PDF: ready, draft, page count, private key stored, key not exposed', async () => {
    const res = await upload(adminS, { buf: await pdf(2), fields: { semester: '3', description: 'd' } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ fileType: 'pdf', pageCount: 2, processingStatus: 'ready', publicationStatus: 'draft', semester: 3, subject: { name: 'Operating Systems' } });
    expect(JSON.stringify(res.body)).not.toMatch(/objectKey|campuspages\/documents/);
    const doc = await Document.findById(res.body.id).select('+objectKey');
    expect(doc.objectKey).toMatch(new RegExp(`^campuspages/documents/${doc.id}/[0-9a-f]{24}\\.pdf$`));
    expect(storage.objects.has(doc.objectKey)).toBe(true);
  });
  it('accepts JPEG, PNG and WebP with dimensions', async () => {
    for (const [buf, name, mime, w, h] of [[await png(), 'a.png', 'image/png', 40, 30], [await jpg(), 'a.jpg', 'image/jpeg', 20, 10], [await webp(), 'a.webp', 'image/webp', 20, 10]]) {
      const res = await upload(adminS, { buf, name, mime });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ fileType: 'image', width: w, height: h, processingStatus: 'ready' });
    }
  });
  it('rejects disallowed extensions, SVG, and disallowed MIME types', async () => {
    expect((await upload(adminS, { buf: Buffer.from('MZ binary'), name: 'a.exe', mime: 'application/octet-stream' })).status).toBe(415);
    expect((await upload(adminS, { buf: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), name: 'a.svg', mime: 'image/svg+xml' })).status).toBe(415);
    expect((await upload(adminS, { buf: await pdf(), name: 'a.pdf', mime: 'text/plain' })).status).toBe(415);
  });
  it('rejects invalid signatures and extension/content mismatches', async () => {
    expect((await upload(adminS, { buf: Buffer.from('just text, not a pdf'), name: 'a.pdf' })).status).toBe(415);
    expect((await upload(adminS, { buf: await png(), name: 'a.pdf', mime: 'application/pdf' })).status).toBe(415);
    expect((await upload(adminS, { buf: await pdf(), name: 'a.png', mime: 'image/png' })).status).toBe(415);
  });
  it('rejects oversized files (413) and stores nothing', async () => {
    const res = await upload(adminS, { buf: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1.5 * 1024 * 1024)]) });
    expect(res.status).toBe(413); expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(storage.objects.size).toBe(0); expect(await Document.countDocuments()).toBe(0);
  });
  it('enforces PDF page and image megapixel limits and rejects corrupt PDFs', async () => {
    expect((await upload(adminS, { buf: await pdf(4) })).status).toBe(422);
    expect((await upload(adminS, { buf: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('garbage')]) })).status).toBe(422);
    expect((await upload(adminS, { buf: await png(6000, 5000), name: 'big.png', mime: 'image/png' })).status).toBe(422);
    expect(await Document.countDocuments()).toBe(0);
  });
  it('validates metadata and rejects unknown fields (mass assignment)', async () => {
    const buf = await pdf();
    for (const fields of [{ title: '' }, { title: 'x'.repeat(201) }, { subjectId: 'nope' }, { semester: '99' }, { publicationStatus: 'published' }, { objectKey: 'x' }, { role: 'admin' }]) {
      expect((await upload(adminS, { buf, fields })).status).toBe(400);
    }
    expect((await upload(adminS, { buf, fields: { subjectId: '64b7f0c2a1b2c3d4e5f60718' } })).status).toBe(400); // unknown subject
    expect((await upload(adminS, { buf: undefined })).status).toBe(400); // no file
    expect(await Document.countDocuments()).toBe(0);
  });
  it('ignores the client filename: keys are server-generated', async () => {
    const res = await upload(adminS, { buf: await pdf(), name: '../../etc/passwd.pdf' });
    expect(res.status).toBe(201);
    for (const k of storage.objects.keys()) expect(k).not.toMatch(/passwd|\.\./);
  });
});

describe('failed uploads and cleanup', () => {
  it('storage failure returns 502 and leaves no document or object', async () => {
    storage.hooks.failPut = true;
    const res = await upload(adminS, { buf: await pdf() });
    expect(res.status).toBe(502);
    expect(await Document.countDocuments()).toBe(0); expect(storage.objects.size).toBe(0);
  });
  it('verification failure removes the object and the record', async () => {
    storage.hooks.failStat = true;
    expect((await upload(adminS, { buf: await pdf() })).status).toBe(502);
    expect(await Document.countDocuments()).toBe(0); expect(storage.objects.size).toBe(0);
  });
  it('if cleanup also fails, the record is kept as failed (never published) and the sweeper removes it later', async () => {
    storage.hooks.failStat = true; storage.hooks.failDelete = true;
    expect((await upload(adminS, { buf: await pdf() })).status).toBe(502);
    const d = await Document.findOne({});
    expect(d.processingStatus).toBe('failed'); expect(d.publicationStatus).toBe('draft');
    expect((await send(adminS, 'patch', `/api/admin/documents/${d.id}/publish`).send({ published: true })).status).toBe(409);
    storage.hooks.failDelete = false;
    await Document.updateOne({ _id: d._id }, { updatedAt: new Date(Date.now() - 3600_000) }, { timestamps: false });
    expect(await runCleanup({ storage, olderThanMinutes: 30 })).toMatchObject({ removed: 1 });
    expect(await Document.countDocuments()).toBe(0); expect(storage.objects.size).toBe(0);
  });
  it('sweeper removes stale unfinished uploads but not fresh ones or ready documents', async () => {
    const mk = (over) => Document.create({ title: 't', subject: subject._id, fileType: 'pdf', mimeType: 'application/pdf', fileSize: 5, uploader: admin._id, objectKey: `campuspages/documents/x/${Math.random()}.pdf`, ...over });
    const stale = await mk({ processingStatus: 'uploading' }); await mk({ processingStatus: 'uploading' }); await mk({ processingStatus: 'ready' });
    await Document.updateOne({ _id: stale._id }, { updatedAt: new Date(Date.now() - 3600_000) }, { timestamps: false });
    expect(await runCleanup({ storage, olderThanMinutes: 30 })).toMatchObject({ scanned: 1, removed: 1 });
    expect(await Document.countDocuments()).toBe(2);
  });
});

describe('management', () => {
  const mkReady = async (over = {}) => (await upload(adminS, { buf: await pdf(), fields: over })).body;

  it('lists with pagination, search, and filters; rejects operator injection', async () => {
    for (const t of ['Algebra A', 'Algebra B', 'Biology']) await mkReady({ title: t });
    const all = await adminS.agent.get('/api/admin/documents?limit=2&page=2');
    expect(all.body).toMatchObject({ total: 3, page: 2, limit: 2, pages: 2 }); expect(all.body.items).toHaveLength(1);
    expect((await adminS.agent.get('/api/admin/documents?q=algebra')).body.total).toBe(2);
    expect((await adminS.agent.get('/api/admin/documents?q=.*')).body.total).toBe(0); // regex chars escaped
    expect((await adminS.agent.get('/api/admin/documents?publication=published')).body.total).toBe(0);
    expect((await adminS.agent.get('/api/admin/documents?publication[$ne]=x')).status).toBe(400);
    expect((await adminS.agent.get('/api/admin/documents?subject=bad')).status).toBe(400);
    expect(JSON.stringify(all.body)).not.toMatch(/objectKey/);
  });
  it('gets one document; bad ids are 400 and unknown ids 404', async () => {
    const d = await mkReady();
    expect((await adminS.agent.get(`/api/admin/documents/${d.id}`)).body.title).toBe('Unit 1 Notes');
    expect((await adminS.agent.get('/api/admin/documents/not-an-id')).status).toBe(400);
    expect((await adminS.agent.get('/api/admin/documents/64b7f0c2a1b2c3d4e5f60718')).status).toBe(404);
  });
  it('edits metadata but never status/key/file fields', async () => {
    const d = await mkReady();
    const ok = await send(adminS, 'patch', `/api/admin/documents/${d.id}`).send({ title: 'Renamed', semester: null, description: 'new' });
    expect(ok.status).toBe(200); expect(ok.body).toMatchObject({ title: 'Renamed', semester: null, description: 'new' });
    for (const body of [{ publicationStatus: 'published' }, { objectKey: 'x' }, { fileSize: 1 }, { title: '' }, {}]) {
      expect((await send(adminS, 'patch', `/api/admin/documents/${d.id}`).send(body)).status).toBe(400);
    }
  });
  it('publishes and unpublishes; unfinished documents cannot be published', async () => {
    const d = await mkReady();
    expect((await send(adminS, 'patch', `/api/admin/documents/${d.id}/publish`).send({ published: true })).body.publicationStatus).toBe('published');
    expect((await send(adminS, 'patch', `/api/admin/documents/${d.id}/publish`).send({ published: false })).body.publicationStatus).toBe('draft');
    expect((await send(adminS, 'patch', `/api/admin/documents/${d.id}/publish`).send({ published: 'yes' })).status).toBe(400);
    const stuck = await Document.create({ title: 't', subject: subject._id, fileType: 'pdf', mimeType: 'application/pdf', fileSize: 5, uploader: admin._id, objectKey: 'campuspages/documents/x/y.pdf', processingStatus: 'uploading' });
    expect((await send(adminS, 'patch', `/api/admin/documents/${stuck.id}/publish`).send({ published: true })).status).toBe(409);
    await expect(Document.create({ title: 't', subject: subject._id, fileType: 'pdf', mimeType: 'application/pdf', fileSize: 5, uploader: admin._id, objectKey: 'k', processingStatus: 'failed', publicationStatus: 'published' })).rejects.toThrow();
  });
  it('publishes categorized uploads after verified storage and rejects duplicate course entries', async () => {
    const fields = { title: 'Database Systems Notes', academicCategory: 'engineering', academicYear: '2', branch: 'IT', semester: '3', materialType: 'study-notes', publish: 'true' };
    const first = await upload(adminS, { buf: await pdf(), fields });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ academicCategory: 'engineering', academicYear: 2, branch: 'IT', semester: 3, materialType: 'study-notes', publicationStatus: 'published', processingStatus: 'ready' });
    expect((await studentS.agent.get('/api/documents?academicCategory=engineering&academicYear=2&branch=IT&semester=3')).body.items[0].title).toBe('Database Systems Notes');
    expect((await upload(adminS, { buf: await pdf(), fields })).status).toBe(409);
    expect(storage.objects.size).toBe(1);
  });
  it('replaces an existing file only after verifying the new stored object', async () => {
    const original = await upload(adminS, { buf: await pdf(1) });
    const previous = await Document.findById(original.body.id).select('+objectKey');
    const replacement = await send(adminS, 'put', `/api/admin/documents/${original.body.id}/file`).attach('file', await pdf(2), { filename: 'replacement.pdf', contentType: 'application/pdf' });
    expect(replacement.status).toBe(200);
    expect(replacement.body.pageCount).toBe(2);
    const updated = await Document.findById(original.body.id).select('+objectKey');
    expect(updated.objectKey).not.toBe(previous.objectKey);
    expect(storage.objects.has(previous.objectKey)).toBe(false);
    expect(storage.objects.has(updated.objectKey)).toBe(true);
  });
  it('tracks a previous file when storage cleanup fails and retries it through the cleanup job', async () => {
    const original = await upload(adminS, { buf: await pdf(1) });
    const previous = await Document.findById(original.body.id).select('+objectKey');
    storage.hooks.failDelete = true;
    const replacement = await send(adminS, 'put', `/api/admin/documents/${original.body.id}/file`).attach('file', await pdf(2), { filename: 'replacement.pdf', contentType: 'application/pdf' });
    expect(replacement.status).toBe(200);
    expect(storage.objects.has(previous.objectKey)).toBe(true);
    storage.hooks.failDelete = false;
    expect(await runCleanup({ storage })).toMatchObject({ orphanedRemoved: 1 });
    expect(storage.objects.has(previous.objectKey)).toBe(false);
    expect((await Document.findById(original.body.id).select('+orphanedObjectKeys')).orphanedObjectKeys).toEqual([]);
  });
  it('deletes the stored object and the record; repeated object deletion is harmless', async () => {
    const d = await mkReady();
    expect(storage.objects.size).toBe(1);
    expect((await send(adminS, 'delete', `/api/admin/documents/${d.id}`)).status).toBe(204);
    expect(storage.objects.size).toBe(0); expect(await Document.countDocuments()).toBe(0);
    expect((await send(adminS, 'delete', `/api/admin/documents/${d.id}`)).status).toBe(404);
  });
  it('keeps the record, unpublishes it, and reports 502 if storage deletion fails', async () => {
    const d = await mkReady();
    await send(adminS, 'patch', `/api/admin/documents/${d.id}/publish`).send({ published: true });
    storage.hooks.failDelete = true;
    expect((await send(adminS, 'delete', `/api/admin/documents/${d.id}`)).status).toBe(502);
    const after = await Document.findById(d.id);
    expect(after).not.toBeNull(); expect(after.publicationStatus).toBe('draft');
  });
});

describe('cache invalidation and subjects', () => {
  it('stats are cached but refreshed immediately after upload, publish, and delete', async () => {
    expect((await adminS.agent.get('/api/admin/stats')).body).toMatchObject({ total: 0, published: 0 });
    await Document.collection.insertOne({ title: 'sneaky', subject: subject._id, publicationStatus: 'draft' }); // bypasses invalidation
    expect((await adminS.agent.get('/api/admin/stats')).body.total).toBe(0); // served from cache
    const d = (await upload(adminS, { buf: await pdf() })).body;
    expect((await adminS.agent.get('/api/admin/stats')).body.total).toBe(2); // invalidated by upload
    await send(adminS, 'patch', `/api/admin/documents/${d.id}/publish`).send({ published: true });
    expect((await adminS.agent.get('/api/admin/stats')).body).toMatchObject({ published: 1, drafts: 0 });
    await send(adminS, 'delete', `/api/admin/documents/${d.id}`);
    expect((await adminS.agent.get('/api/admin/stats')).body.published).toBe(0);
  });
  it('creates subjects, rejects duplicates, and refreshes the cached list', async () => {
    expect((await adminS.agent.get('/api/admin/subjects')).body.items).toHaveLength(1);
    const r = await send(adminS, 'post', '/api/admin/subjects').send({ name: 'Computer Networks' });
    expect(r.status).toBe(201); expect(r.body.slug).toBe('computer-networks');
    expect((await adminS.agent.get('/api/admin/subjects')).body.items).toHaveLength(2);
    expect((await send(adminS, 'post', '/api/admin/subjects').send({ name: 'Computer Networks' })).status).toBe(409);
    expect((await send(adminS, 'post', '/api/admin/subjects').send({ name: 'x' })).status).toBe(400);
  });
});
