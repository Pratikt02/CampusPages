import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const config = loadConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: 'http://localhost:5173' });
const app = createApp(config);

describe('health', () => {
  it('reports degraded (503) when DB is not connected, with no sensitive fields', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(Object.keys(res.body).sort()).toEqual(['db', 'status']);
  });
  it('returns consistent JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
  it('only reflects approved CORS origins', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    const bad = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('rejects wildcard/http origins in production config', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', CLIENT_ORIGINS: '*' })).toThrow();
    expect(() => loadConfig({ NODE_ENV: 'production', CLIENT_ORIGINS: 'http://x.com' })).toThrow();
  });
});
