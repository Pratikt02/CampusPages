import express from 'express';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createMemoryStorage } from '../src/storage/memoryAdapter.js';
import { flushAll } from '../src/cache/index.js';
import { redact, log } from '../src/utils/logger.js';
import { requestTimeout } from '../src/middleware/timeout.js';
import { countPdfPages } from '../src/documents/pdfInspect.js';
import { createCleanupRunner } from '../src/jobs/cleanup.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { Subject } from '../src/models/Subject.js';
import { Document } from '../src/models/Document.js';
import { AuditEvent } from '../src/models/AuditEvent.js';
import { hashPassword } from '../src/services/password.js';

const ORIGIN = 'http://localhost:5173'; const PW = 'correct-horse-battery';
const BASE = { NODE_ENV: 'test', CLIENT_ORIGINS: ORIGIN, LOGIN_MAX_PER_15MIN: '1000' };
let mongod, storage, subject;
const mkApp = (extra = {}) => createApp(loadConfig({ ...BASE, ...extra }), { storage });
const login = (app, email = 'student@example.edu', extra = {}) => request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password: PW, ...extra });
const waitFor = async (fn, ms = 3000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 25)); } };

beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); await Promise.all([User, Session, Subject, Document, AuditEvent].map((m) => m.syncIndexes())); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
beforeEach(async () => {
  await Promise.all([User, Session, Subject, Document, AuditEvent].map((m) => m.deleteMany({}))); flushAll(); storage = createMemoryStorage();
  const passwordHash = await hashPassword(PW);
  await User.create({ name: 'S', email: 'student@example.edu', role: 'student', passwordHash });
  await User.create({ name: 'T', email: 'other@example.edu', role: 'student', passwordHash });
  await User.create({ name: 'A', email: 'admin@example.edu', role: 'admin', passwordHash });
  subject = await Subject.create({ name: 'OS', slug: 'os' });
});

describe('production configuration', () => {
  const prod = { NODE_ENV: 'production', CLIENT_ORIGINS: 'https://app.example.edu', CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
  it('issues a __Host- session cookie that is Secure, HttpOnly, SameSite=Lax, Path=/ and has no Domain', async () => {
    const app = createApp(loadConfig({ ...prod, LOGIN_MAX_PER_15MIN: '1000' }), { storage });
    const res = await request(app).post('/api/auth/login').set('Origin', 'https://app.example.edu').send({ email: 'student@example.edu', password: PW });
    expect(res.status).toBe(200);
    const c = res.headers['set-cookie'][0];
    expect(c).toMatch(/^__Host-cp_sid=/); for (const a of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) expect(c).toContain(a); expect(c).not.toMatch(/Domain=/i);
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });
  it('refuses unsafe production settings at startup', () => {
    expect(() => loadConfig({ ...prod, CLIENT_ORIGINS: 'http://app.example.edu' })).toThrow();
    expect(() => loadConfig({ ...prod, CLIENT_ORIGINS: '*' })).toThrow();
    expect(() => loadConfig({ ...prod, STORAGE_DRIVER: 'memory' })).toThrow();
    expect(() => loadConfig({ NODE_ENV: 'production', CLIENT_ORIGINS: 'https://a.example.edu' })).toThrow(); // no storage credentials -> memory driver
  });
});

describe('response headers and caching', () => {
  it('sets security headers, hides the stack, and never caches account or admin data', async () => {
    const app = mkApp(); const r = await login(app);
    const h = r.headers;
    expect(h['x-content-type-options']).toBe('nosniff'); expect(h['x-frame-options']).toBeDefined(); expect(h['referrer-policy']).toBeDefined();
    expect(h['strict-transport-security']).toBeDefined(); expect(h['cross-origin-resource-policy']).toBe('same-origin'); expect(h['x-powered-by']).toBeUndefined();
    expect(h['cache-control']).toBe('no-store'); expect(h.etag).toBeUndefined();
    const cookie = h['set-cookie'][0].split(';')[0];
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/api/admin/stats').set('Cookie', cookie)).headers['cache-control']).toBe('no-store'); // even the 403
  });
  it('returns a request id header and no stack traces or internals in error bodies', async () => {
    const app = mkApp(); const r = await request(app).get('/api/documents/not-an-id');
    expect(r.headers['x-request-id']).toMatch(/^[0-9a-f-]{8}$/);
    expect(JSON.stringify(r.body)).not.toMatch(/at |node_modules|Error:/);
  });
  it('rejects oversized and non-JSON bodies cleanly', async () => {
    const app = mkApp();
    const big = await request(app).post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'a@b.co', password: 'x'.repeat(200_000) });
    expect(big.status).toBe(413); expect(big.body.error).toBeDefined();
    const text = await request(app).post('/api/auth/login').set('Origin', ORIGIN).set('Content-Type', 'text/plain').send('email=a@b.co');
    expect(text.status).toBe(400);
  });
});

describe('rate limits and sessions', () => {
  it('limits login attempts per account even when they come from many different IPs; other accounts are unaffected', async () => {
    const app = mkApp({ TRUST_PROXY: 'true', LOGIN_MAX_PER_ACCOUNT_15MIN: '3' }); const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await request(app).post('/api/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', `10.0.0.${i + 1}`).send({ email: 'Student@Example.edu', password: 'wrong-wrong-wrong' })).status);
    expect(codes).toEqual([401, 401, 401, 429, 429, 429]);
    expect((await request(app).post('/api/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '10.9.9.9').send({ email: 'other@example.edu', password: PW })).status).toBe(200);
  });
  it('successful logins do not count toward the per-account limit', async () => {
    const app = mkApp({ LOGIN_MAX_PER_ACCOUNT_15MIN: '2', MAX_SESSIONS_PER_USER: '50' });
    for (let i = 0; i < 6; i++) expect((await login(app)).status).toBe(200);
  });
  it('a shared IP (campus NAT): many successful logins never trip the per-IP login limit, but failures do', async () => {
    const app = mkApp({ LOGIN_MAX_PER_15MIN: '3', MAX_SESSIONS_PER_USER: '50', LOGIN_MAX_PER_ACCOUNT_15MIN: '1000' });
    for (let i = 0; i < 8; i++) expect((await login(app)).status).toBe(200);
    const bad = []; for (let i = 0; i < 5; i++) bad.push((await login(app, 'student@example.edu', { password: 'wrong-wrong-wrong' })).status);
    expect(bad).toEqual([401, 401, 401, 429, 429]);
  });
  it('defaults are sized for a shared campus IP', () => {
    const c = loadConfig({ NODE_ENV: 'test' }); expect(c.loginMaxPerWindow).toBeGreaterThanOrEqual(30); expect(c.apiMaxPerMinute).toBeGreaterThanOrEqual(3000);
  });
  it('applies a global per-IP API limit but never to the health check', async () => {
    const app = mkApp({ API_MAX_PER_MIN: '4' }); const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await request(app).get('/api/auth/me')).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(3);
    expect((await request(app).get('/api/health')).status).not.toBe(429);
  });
  it('keeps at most N live sessions per user, revoking the oldest', async () => {
    const app = mkApp({ MAX_SESSIONS_PER_USER: '3' }); const cookies = [];
    for (let i = 0; i < 5; i++) { cookies.push((await login(app)).headers['set-cookie'][0].split(';')[0]); await new Promise((r) => setTimeout(r, 5)); }
    const status = await Promise.all(cookies.map(async (c) => (await request(app).get('/api/auth/me').set('Cookie', c)).status));
    expect(status).toEqual([401, 401, 200, 200, 200]);
    expect(await Session.countDocuments({ revokedAt: null })).toBe(3);
  });
  it('"sign out everywhere" revokes all of the user\'s sessions only', async () => {
    const app = mkApp(); const a = await login(app); const b = await login(app); const other = await login(app, 'other@example.edu');
    const ca = a.headers['set-cookie'][0].split(';')[0]; const cb = b.headers['set-cookie'][0].split(';')[0]; const co = other.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).post('/api/auth/logout-all').set('Cookie', ca).set('Origin', ORIGIN)).status).toBe(403); // CSRF still required
    const r = await request(app).post('/api/auth/logout-all').set('Cookie', ca).set('Origin', ORIGIN).set('X-CSRF-Token', a.body.csrfToken);
    expect(r.status).toBe(204); expect(r.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await request(app).get('/api/auth/me').set('Cookie', ca)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', cb)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', co)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout-all').set('Origin', ORIGIN)).status).toBe(401);
  });
});

describe('database budget', () => {
  it('authenticating a request costs exactly one database round trip (the free Atlas tier allows ~100 ops/s)', async () => {
    const app = mkApp(); const r = await login(app); const cookie = r.headers['set-cookie'][0].split(';')[0];
    const agg = vi.spyOn(Session, 'aggregate'); const find = vi.spyOn(Session, 'findOne'); const ufind = vi.spyOn(User, 'findOne'); const ufbi = vi.spyOn(User, 'findById');
    for (let i = 0; i < 5; i++) expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    expect(agg).toHaveBeenCalledTimes(5); expect(find).not.toHaveBeenCalled(); expect(ufind).not.toHaveBeenCalled(); expect(ufbi).not.toHaveBeenCalled();
    [agg, find, ufind, ufbi].forEach((x) => x.mockRestore());
  });
});

describe('security audit trail', () => {
  it('records CSRF failures, role denials and bad origins without secrets', async () => {
    const app = mkApp(); const s = await login(app); const cookie = s.headers['set-cookie'][0].split(';')[0];
    await request(app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', ORIGIN).set('X-CSRF-Token', 'wrong-token-value');
    await request(app).get('/api/admin/documents/64b7f0c2a1b2c3d4e5f60718').set('Cookie', cookie);
    await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'x@y.co', password: 'x' });
    await waitFor(async () => (await AuditEvent.countDocuments({ type: { $in: ['csrf_failed', 'role_denied', 'bad_origin'] } })) === 3);
    const events = await AuditEvent.find({}).lean();
    const by = Object.fromEntries(events.filter((e) => ['csrf_failed', 'role_denied', 'bad_origin'].includes(e.type)).map((e) => [e.type, e]));
    expect(by.csrf_failed.user).toBeTruthy(); expect(by.role_denied.user).toBeTruthy(); expect(by.bad_origin.user).toBeNull();
    expect(by.role_denied.detail).toBe('/api/admin/documents/:id'); // ids are normalised
    expect(JSON.stringify(events)).not.toMatch(/wrong-token-value|cp_sid|correct-horse|csrfToken/);
  });
});

describe('logging', () => {
  it('redacts sensitive keys and credential/signature-bearing strings', () => {
    const out = redact({ password: 'p', csrfToken: 't', cookie: 'cp_sid=abc', objectKey: 'campuspages/documents/x', note: 'see mongodb+srv://u:pw@h.net/db now', signed: 'x/s--AbCdEf12--/y', ok: 'fine', nested: { apiSecret: 's', n: 1 } });
    expect(out).toEqual({ password: '[redacted]', csrfToken: '[redacted]', cookie: '[redacted]', objectKey: '[redacted]', note: 'see [url] now', signed: 'x/[sig]/y', ok: 'fine', nested: { apiSecret: '[redacted]', n: 1 } });
    expect(redact('Cookie cp_sid=SECRETVALUE; other')).toBe('Cookie cp_sid=[redacted]; other');
  });
  it('logs one safe line per request: no query, cookies, headers or raw ids', async () => {
    const lines = []; const spy = vi.spyOn(console, 'log').mockImplementation((l) => lines.push(l));
    const app = mkApp({ LOG_REQUESTS: 'true' }); const s = await login(app); const cookie = s.headers['set-cookie'][0].split(';')[0];
    await request(app).get('/api/documents/64b7f0c2a1b2c3d4e5f60718?q=secretterm&token=abc123').set('Cookie', cookie).set('Authorization', 'Bearer topsecret');
    await waitFor(() => lines.some((l) => l.includes('/api/documents/:id'))); spy.mockRestore();
    const all = lines.join('\n'); const line = JSON.parse(lines.find((l) => l.includes('/api/documents/:id')));
    expect(line).toMatchObject({ msg: 'request', method: 'GET', path: '/api/documents/:id', status: 404 }); expect(line.id).toBeTruthy(); expect(line.uid).toBeTruthy();
    expect(all).not.toMatch(/secretterm|abc123|topsecret|cp_sid|correct-horse|64b7f0c2a1b2c3d4e5f60718|csrf/i);
  });
  it('is silent in test mode by default', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {}); await request(mkApp()).get('/api/auth/me'); await new Promise((r) => setTimeout(r, 30));
    expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); void log;
  });
});

describe('request timeouts', () => {
  const mini = (ms, skip) => { const a = express(); a.use(requestTimeout(ms, skip)); a.get('/slow', (_q, res) => setTimeout(() => res.json({ ok: 1 }), 150));
    a.get('/fast', (_q, res) => res.json({ ok: 1 })); return a; };
  it('answers 503 TIMEOUT for slow handlers, and leaves fast ones alone', async () => {
    const r = await request(mini(40)).get('/slow'); expect(r.status).toBe(503); expect(r.body.error.code).toBe('TIMEOUT');
    expect((await request(mini(40)).get('/fast')).status).toBe(200);
  });
  it('skips routes that have their own limits (uploads, content streams)', async () => {
    expect((await request(mini(40, (req) => req.path === '/slow')).get('/slow')).status).toBe(200);
  });
});

describe('bounded PDF processing', () => {
  const pdf = async (n = 2) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage(); return Buffer.from(await d.save()); };
  it('counts pages in a worker thread', async () => { expect(await countPdfPages(await pdf(3), 10_000)).toBe(3); });
  it('rejects garbage as invalid', async () => { await expect(countPdfPages(Buffer.from('%PDF-1.4 garbage'), 10_000)).rejects.toMatchObject({ reason: 'invalid' }); });
  it('kills a runaway parse at the time limit while the main thread stays responsive', async () => {
    let ticks = 0; const iv = setInterval(() => { ticks += 1; }, 10);
    const t = Date.now();
    await expect(countPdfPages(Buffer.from('x'), 300, new URL('./fixtures/slowWorker.js', import.meta.url))).rejects.toMatchObject({ reason: 'timeout' });
    clearInterval(iv); expect(Date.now() - t).toBeLessThan(2000); expect(ticks).toBeGreaterThan(10);
  });
  it('treats a crashing worker as invalid', async () => {
    await expect(countPdfPages(Buffer.from('x'), 5000, new URL('./fixtures/crashWorker.js', import.meta.url))).rejects.toMatchObject({ reason: 'invalid' });
  });
  it('upload is rejected (422) and nothing is stored when PDF processing exceeds its limit', async () => {
    const app = mkApp({ PDF_PARSE_TIMEOUT_MS: '1' }); const s = await login(app, 'admin@example.edu'); const cookie = s.headers['set-cookie'][0].split(';')[0];
    const r = await request(app).post('/api/admin/documents').set('Cookie', cookie).set('Origin', ORIGIN).set('X-CSRF-Token', s.body.csrfToken)
      .field('title', 'T').field('subjectId', String(subject._id)).attach('file', await pdf(1), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(422); expect(r.body.error.message).toMatch(/too long|resources/i);
    expect(await Document.countDocuments()).toBe(0); expect(storage.objects.size).toBe(0);
  });
  it('image uploads still work (sanity)', async () => {
    const app = mkApp(); const s = await login(app, 'admin@example.edu'); const cookie = s.headers['set-cookie'][0].split(';')[0];
    const img = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
    const r = await request(app).post('/api/admin/documents').set('Cookie', cookie).set('Origin', ORIGIN).set('X-CSRF-Token', s.body.csrfToken)
      .field('title', 'I').field('subjectId', String(subject._id)).attach('file', img, { filename: 'a.png', contentType: 'image/png' });
    expect(r.status).toBe(201);
  });
});

describe('cleanup job', () => {
  it('never runs two sweeps at once', async () => {
    const admin = await User.findOne({ role: 'admin' });
    const d = await Document.create({ title: 't', subject: subject._id, fileType: 'pdf', mimeType: 'application/pdf', fileSize: 5, uploader: admin._id, objectKey: 'campuspages/documents/x/y.pdf', processingStatus: 'uploading' });
    await Document.updateOne({ _id: d._id }, { updatedAt: new Date(Date.now() - 3600_000) }, { timestamps: false });
    let release; const gate = new Promise((r) => { release = r; });
    const slow = { ...storage, deleteObject: async (k) => { await gate; return storage.deleteObject(k); } };
    const tick = createCleanupRunner({ storage: slow, config: { cleanupAfterMinutes: 30 } });
    const first = tick(); await new Promise((r) => setTimeout(r, 50));
    expect(await tick()).toEqual({ skipped: true });
    release(); expect(await first).toMatchObject({ removed: 1 });
    expect(await tick()).toMatchObject({ scanned: 0 });
  });
});
