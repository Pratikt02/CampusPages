import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { CSP_STRING } from '../src/config/csp.js';
import { createMemoryStorage } from '../src/storage/memoryAdapter.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { hashPassword } from '../src/services/password.js';
import { runSmoke } from '../../scripts/smoke.mjs';

const ORIGIN = 'http://localhost:5173'; let dist; let mongod; let app;
beforeAll(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>CampusPages</title><div id="root"></div>');
  fs.writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dist, 'theme-init.js'), '//t'); fs.writeFileSync(path.join(dist, '.secret'), 'nope');
  mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri());
  await User.create({ name: 'S', email: 'student@example.edu', role: 'student', passwordHash: await hashPassword('correct-horse-battery') });
  app = createApp(loadConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: ORIGIN, SERVE_CLIENT: 'true', CLIENT_DIST: dist, LOGIN_MAX_PER_15MIN: '1000' }), { storage: createMemoryStorage() });
});
afterAll(async () => { fs.rmSync(dist, { recursive: true, force: true }); await mongoose.disconnect(); await mongod.stop(); });

describe('single-origin static hosting', () => {
  it('serves the app with the strict CSP, nosniff and no inline-script allowance', async () => {
    const r = await request(app).get('/');
    expect(r.status).toBe(200); expect(r.headers['content-type']).toMatch(/html/); expect(r.headers['cache-control']).toBe('no-cache');
    const norm = (v) => v.replace(/;\s*/g, '; ').trim();   // Helmet joins directives with ';' (no space): same policy
    expect(norm(r.headers['content-security-policy'])).toBe(norm(CSP_STRING));
    expect(r.headers['content-security-policy']).not.toMatch(/unsafe-inline|unsafe-eval/); expect(r.headers['content-security-policy']).toMatch(/worker-src 'self' blob:/);
    expect(r.headers['x-content-type-options']).toBe('nosniff'); expect(r.headers['permissions-policy']).toMatch(/camera=\(\)/);
  });
  it('caches hashed assets forever and everything else not at all', async () => {
    expect((await request(app).get('/assets/app-abc123.js')).headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await request(app).get('/theme-init.js')).headers['cache-control']).toBe('no-cache');
  });
  it('falls back to the app for client-side routes, but never for API routes', async () => {
    for (const p of ['/app', '/app/documents/abc', '/admin/upload', '/login', '/subjects/xyz']) { const r = await request(app).get(p); expect(r.status).toBe(200); expect(r.text).toContain('CampusPages'); }
    const api = await request(app).get('/api/not-a-route'); expect(api.status).toBe(404); expect(api.headers['content-type']).toMatch(/json/); expect(api.body.error.code).toBe('NOT_FOUND');
    expect((await request(app).post('/anything')).status).toBe(404);
  });
  it('cannot be used to read files outside the build folder, or dotfiles', async () => {
    for (const p of ['/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fpackage.json', '/.secret', '/assets/../../package.json']) {
      const r = await request(app).get(p); expect(r.text).not.toMatch(/root:|"name"|nope/);
    }
  });
  it('refuses to start if the build is missing', () => {
    expect(() => createApp(loadConfig({ NODE_ENV: 'test', SERVE_CLIENT: 'true', CLIENT_DIST: path.join(dist, 'nope') }), { storage: createMemoryStorage() })).toThrow(/npm run build/);
  });
  it('keeps client/public/_headers identical to the server CSP (static-host deployments)', () => {
    const headers = fs.readFileSync(path.resolve(import.meta.dirname, '../../client/public/_headers'), 'utf8');
    expect(headers).toContain(`Content-Security-Policy: ${CSP_STRING}`);
  });
});

describe('smoke test script (the same checks you run against production)', () => {
  it('passes against a correctly configured server, including the login flow', async () => {
    // The login check sends the server's own origin, so approve exactly that origin for this run (as an operator would in CLIENT_ORIGINS).
    const net = await import('node:net');
    const port = await new Promise((res) => { const t = net.createServer().listen(0, () => { const p = t.address().port; t.close(() => res(p)); }); });
    const origin = `http://127.0.0.1:${port}`;
    const srv = createApp(loadConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: origin, SERVE_CLIENT: 'true', CLIENT_DIST: dist, LOGIN_MAX_PER_15MIN: '1000' }), { storage: createMemoryStorage() }).listen(port);
    try {
      const results = await runSmoke(origin, { email: 'student@example.edu', password: 'correct-horse-battery' });
      const failed = results.filter((r) => !r.ok);
      expect(failed, JSON.stringify(failed)).toEqual([]); expect(results.length).toBeGreaterThan(20);
    } finally { srv.close(); }
  });
  it('fails loudly against a server that is broken or unprotected', async () => {
    const fake = async (u) => { const p = new URL(u).pathname;
      if (p === '/api/health') return new Response(JSON.stringify({ status: 'degraded', db: 'disconnected' }), { status: 503 });
      return new Response('<html>no csp</html>', { status: 200, headers: { 'content-type': 'text/html' } }); };
    const failed = (await runSmoke('https://x.example', { fetchImpl: fake })).filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(5); expect(failed.map((f) => f.name).join('|')).toMatch(/health|Content-Security-Policy|protected without login/);
  });
});
