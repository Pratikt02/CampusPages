import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
let mongod, app, os, nets, admin, student, studentS, adminS;

const mk = (over = {}) => Document.create({ title: 'Doc', subject: os._id, fileType: 'pdf', mimeType: 'application/pdf', fileSize: 100, pageCount: 3,
  objectKey: 'campuspages/documents/secret/key.pdf', uploader: admin._id, processingStatus: 'ready', publicationStatus: 'published', ...over });
async function login(email) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').set('Origin', ORIGIN).send({ email, password: PW });
  return { agent, csrf: r.body.csrfToken, cookie: r.headers['set-cookie'][0].split(';')[0] };
}
const adminPublish = (id, published) => adminS.agent.patch(`/api/admin/documents/${id}/publish`).set('Origin', ORIGIN).set('X-CSRF-Token', adminS.csrf).send({ published });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri());
  await Promise.all([User, Session, Subject, Document].map((m) => m.syncIndexes()));
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
beforeEach(async () => {
  await Promise.all([User, Session, Subject, Document].map((m) => m.deleteMany({}))); flushAll();
  app = createApp(loadConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: ORIGIN, LOGIN_MAX_PER_15MIN: '1000' }), { storage: createMemoryStorage() });
  const passwordHash = await hashPassword(PW);
  admin = await User.create({ name: 'A', email: 'admin@example.edu', role: 'admin', passwordHash });
  student = await User.create({ name: 'S', email: 'student@example.edu', role: 'student', passwordHash });
  os = await Subject.create({ name: 'Operating Systems', slug: 'operating-systems', description: 'Processes and memory' });
  nets = await Subject.create({ name: 'Computer Networks', slug: 'computer-networks' });
  studentS = await login('student@example.edu'); adminS = await login('admin@example.edu');
});

describe('public subject metadata', () => {
  it('works without authentication and exposes only name/description/count', async () => {
    await mk({ title: 'SECRET TITLE' }); await mk();
    const res = await request(app).get('/api/public/subjects');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([{ id: String(os._id), name: 'Operating Systems', slug: 'operating-systems', description: 'Processes and memory', materialCount: 2 }]);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET TITLE|objectKey|campuspages\/documents|mimeType|uploader/);
    expect(res.headers['cache-control']).toMatch(/public/);
  });
  it('counts only published, ready documents and omits subjects with none', async () => {
    await mk({ publicationStatus: 'draft' }); await mk({ processingStatus: 'uploading', publicationStatus: 'draft' });
    expect((await request(app).get('/api/public/subjects')).body.items).toEqual([]);
    await mk(); flushAll(); // direct DB writes bypass the invalidation that real admin routes perform
    const items = (await request(app).get('/api/public/subjects')).body.items;
    expect(items).toHaveLength(1); expect(items[0].materialCount).toBe(1);
  });
  it('reflects publish/unpublish immediately (cache invalidated)', async () => {
    const d = await mk({ publicationStatus: 'draft' });
    expect((await request(app).get('/api/public/subjects')).body.items).toHaveLength(0);
    await adminPublish(d.id, true);
    expect((await request(app).get('/api/public/subjects')).body.items).toHaveLength(1);
    await adminPublish(d.id, false);
    expect((await request(app).get('/api/public/subjects')).body.items).toHaveLength(0);
  });
  it('serves a single subject, 404 for unknown / empty / malformed ids', async () => {
    await mk();
    expect((await request(app).get(`/api/public/subjects/${os._id}`)).body).toMatchObject({ name: 'Operating Systems', materialCount: 1 });
    for (const id of [String(nets._id), '64b7f0c2a1b2c3d4e5f60718', 'nope', '%24ne']) expect((await request(app).get(`/api/public/subjects/${id}`)).status).toBe(404);
  });
  it('is rate limited', async () => {
    const limited = createApp(loadConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: ORIGIN, PUBLIC_MAX_PER_MIN: '3' }), { storage: createMemoryStorage() });
    let last; for (let i = 0; i < 5; i++) last = await request(limited).get('/api/public/subjects');
    expect(last.status).toBe(429);
  });
});

describe('student catalogue', () => {
  it('requires authentication (guest 401) and an active account', async () => {
    expect((await request(app).get('/api/documents')).status).toBe(401);
    await User.updateOne({ _id: student._id }, { status: 'disabled' });
    expect((await studentS.agent.get('/api/documents')).status).toBe(401);
  });
  it('returns only published+ready documents with a safe field allow-list and private cache headers', async () => {
    await mk({ title: 'Visible' }); await mk({ title: 'Draft', publicationStatus: 'draft' }); await mk({ title: 'Stuck', processingStatus: 'uploading', publicationStatus: 'draft' });
    const res = await studentS.agent.get('/api/documents');
    expect(res.status).toBe(200); expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.items.map((d) => d.title)).toEqual(['Visible']);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['academicCategory', 'academicYear', 'branch', 'course', 'createdAt', 'description', 'fileSize', 'fileType', 'height', 'id', 'materialType', 'pageCount', 'semester', 'standard', 'subject', 'title', 'width']);
    expect(JSON.stringify(res.body)).not.toMatch(/objectKey|secret|mimeType|uploader|processingStatus|publicationStatus/);
  });
  it('filters by subject, type, semester and search; paginates', async () => {
    await mk({ title: 'Scheduling' }); await mk({ title: 'Paging', semester: 4 }); await mk({ title: 'TCP', subject: nets._id });
    await mk({ title: 'Diagram', fileType: 'image', mimeType: 'image/png', pageCount: null, width: 10, height: 10 });
    const g = async (qs) => (await studentS.agent.get(`/api/documents?${qs}`)).body;
    expect((await g(`subject=${os._id}`)).total).toBe(3);
    expect((await g('fileType=image')).items[0].title).toBe('Diagram');
    expect((await g('semester=4')).total).toBe(1);
    expect((await g('q=tcp')).items[0].title).toBe('TCP');
    expect((await g('q=Operating%20Systems')).total).toBe(3);
    expect((await g('academicCategory=legacy')).total).toBe(4);
    expect((await g('q=.*')).total).toBe(0);
    expect(await g('limit=2&page=2')).toMatchObject({ total: 4, pages: 2, page: 2 });
  });
  it('filters published notes by academic path and material type and exposes dynamic standards', async () => {
    await mk({ title: 'IT DBMS', academicCategory: 'engineering', academicYear: 2, branch: 'IT', semester: 3, materialType: 'study-notes' });
    await mk({ title: 'CS DBMS', academicCategory: 'engineering', academicYear: 2, branch: 'CS', semester: 3, materialType: 'study-notes' });
    await mk({ title: 'Class 12 Physics', academicCategory: 'other', standard: 'Class 12', course: 'Physics', materialType: 'syllabus' });
    const g = async (qs) => (await studentS.agent.get(`/api/documents?${qs}`)).body;
    expect((await g('academicCategory=engineering&academicYear=2&branch=IT&semester=3')).items.map((d) => d.title)).toEqual(['IT DBMS']);
    expect((await g('academicCategory=other&standard=Class%2012&course=Physics&materialType=syllabus')).items[0]).toMatchObject({ title: 'Class 12 Physics', standard: 'Class 12', course: 'Physics', materialType: 'syllabus' });
    expect((await studentS.agent.get('/api/documents/facets')).body).toMatchObject({ standards: ['Class 12'], courses: ['Physics'] });
  });
  it('rejects operator injection and invalid parameters', async () => {
    for (const qs of ['subject[$ne]=x', 'q[$regex]=.*', 'fileType=exe', 'semester=99', 'subject=bad']) expect((await studentS.agent.get(`/api/documents?${qs}`)).status).toBe(400);
  });
  it('detail: published visible; draft, unfinished, unknown and malformed ids all return the same 404', async () => {
    const ok = await mk(); const draft = await mk({ publicationStatus: 'draft' }); const stuck = await mk({ processingStatus: 'uploading', publicationStatus: 'draft' });
    expect((await studentS.agent.get(`/api/documents/${ok.id}`)).body.id).toBe(ok.id);
    const bodies = [];
    for (const id of [draft.id, stuck.id, '64b7f0c2a1b2c3d4e5f60718', 'nope']) { const r = await studentS.agent.get(`/api/documents/${id}`); expect(r.status).toBe(404); bodies.push(r.body); }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });
  it('unpublishing hides a document from list and detail immediately, even after the list was cached', async () => {
    const d = await mk({ title: 'Cached' });
    expect((await studentS.agent.get('/api/documents')).body.total).toBe(1);
    expect((await studentS.agent.get('/api/documents')).body.total).toBe(1); // warm
    await adminPublish(d.id, false);
    expect((await studentS.agent.get('/api/documents')).body.total).toBe(0);
    expect((await studentS.agent.get(`/api/documents/${d.id}`)).status).toBe(404);
  });
  it('cached data never bypasses authentication: guests and revoked sessions are still denied', async () => {
    await mk();
    expect((await studentS.agent.get('/api/documents')).status).toBe(200); // populates cache
    expect((await request(app).get('/api/documents')).status).toBe(401);
    await Session.updateMany({}, { revokedAt: new Date() });
    expect((await studentS.agent.get('/api/documents')).status).toBe(401);
  });
  it('no content endpoint exists yet and admin accounts may browse the catalogue', async () => {
    const d = await mk();
    expect((await studentS.agent.get(`/api/documents/${d.id}/content`)).status).toBe(404);
    expect((await adminS.agent.get('/api/documents')).status).toBe(200);
  });
});
