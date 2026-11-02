// Real PDF.js (Node build) loading a PDF through the real Phase 5 content endpoint: proves range compatibility
// and that each PDF.js range request is authorized independently. (Browser rendering itself is not covered here.)
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createMemoryStorage } from '../src/storage/memoryAdapter.js';
import { User } from '../src/models/User.js';
import { Subject } from '../src/models/Subject.js';
import { Document } from '../src/models/Document.js';
import { hashPassword } from '../src/services/password.js';
// The exact transport module that ships to browsers (it takes the PDF.js library as a parameter).
import { openDocument } from '../../client/src/features/viewer/rangeTransport.js';

const ORIGIN = 'http://localhost:5173'; const PW = 'correct-horse-battery';
let mongod, server, storage, cookie, doc, pdfBytes, url, pdfjs, admin;

const BASE = { disableAutoFetch: true, isEvalSupported: false, enableXfa: false, rangeChunkSize: 131072, verbosity: 0 };
// Node's fetch has no cookie jar, so the test supplies the session cookie the way a browser would.
const withCookie = (c, strip = false) => (u, o) => { const headers = { ...o.headers, ...(c ? { Cookie: c } : {}) }; if (strip) delete headers.Range; return fetch(u, { ...o, headers }); };
async function openDoc({ cookieValue = cookie, onError, strip } = {}) {
  const task = await openDocument(pdfjs, { url, length: pdfBytes.length, base: BASE, graceMs: 300, fetchImpl: withCookie(cookieValue, strip), onError });
  return { task, usedRanges: !strip };
}

beforeAll(async () => {
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri());
  storage = createMemoryStorage();
  const app = createApp(loadConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: ORIGIN, LOGIN_MAX_PER_15MIN: '1000' }), { storage });
  server = app.listen(0);
  const passwordHash = await hashPassword(PW);
  admin = await User.create({ name: 'A', email: 'admin@example.edu', role: 'admin', passwordHash });
  await User.create({ name: 'S', email: 'student@example.edu', role: 'student', passwordHash });
  const subject = await Subject.create({ name: 'OS', slug: 'os' });
  // 30 pages, each with its own ~incompressible image, so the file is large and pages live at different offsets.
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 30; i++) {
    const img = await sharp({ create: { width: 160, height: 160, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 70 } } }).png().toBuffer();
    const page = pdf.addPage([400, 500]); page.drawImage(await pdf.embedPng(img), { x: 20, y: 20, width: 360, height: 360 }); page.drawText(`Page ${i + 1}`, { x: 20, y: 450 });
  }
  pdfBytes = Buffer.from(await pdf.save());
  const _id = new mongoose.Types.ObjectId(); const objectKey = `campuspages/documents/${_id}/${crypto.randomBytes(12).toString('hex')}.pdf`;
  doc = await Document.create({ _id, title: 'Big', subject: subject._id, fileType: 'pdf', mimeType: 'application/pdf', fileSize: pdfBytes.length, pageCount: 30, objectKey,
    uploader: admin._id, processingStatus: 'ready', publicationStatus: 'published' });
  storage.objects.set(objectKey, pdfBytes);
  url = `http://127.0.0.1:${server.address().port}/api/documents/${_id}/content`;
  const r = await request(server).post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'student@example.edu', password: PW });
  cookie = r.headers['set-cookie'][0].split(';')[0];
});
afterAll(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await mongoose.disconnect(); await mongod.stop(); });

describe('PDF.js + the shipped range transport against the protected content endpoint', () => {
  it('opens a multi-page PDF and reads a late page using only explicit range requests, without pulling the whole file', async () => {
    expect(pdfBytes.length).toBeGreaterThan(200_000);
    storage.state.calls.length = 0; storage.state.bytesSent = 0;
    const { task, usedRanges } = await openDoc();
    expect(usedRanges).toBe(true);
    const pdf = await task.promise;
    expect(pdf.numPages).toBe(30);
    const text = (await (await pdf.getPage(25)).getTextContent()).items.map((i) => i.str).join(' ');
    expect(text).toContain('Page 25');
    const calls = storage.state.calls;
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every((c) => c.start !== undefined && c.end !== undefined)).toBe(true);   // never an un-ranged request
    expect(storage.state.bytesSent).toBeLessThan(pdfBytes.length * 0.5);                    // and never the whole file
    await task.destroy();
  });
  it('is rejected without a session (401) and for a draft document (404)', async () => {
    await expect(openDoc({ cookieValue: '' })).rejects.toMatchObject({ status: 401 });
    await Document.updateOne({ _id: doc._id }, { publicationStatus: 'draft' });
    await expect(openDoc()).rejects.toMatchObject({ status: 404 });
    await Document.updateOne({ _id: doc._id }, { publicationStatus: 'published' });
  });
  it('every later range request is re-authorized: unpublishing mid-session surfaces an error instead of more pages', async () => {
    let onErr; const errored = new Promise((r) => { onErr = r; });
    const { task } = await openDoc({ onError: onErr });
    const pdf = await task.promise;
    await pdf.getPage(1);
    await Document.updateOne({ _id: doc._id }, { publicationStatus: 'draft' });
    pdf.getPage(28).then((p) => p.getTextContent()).catch(() => {});
    const outcome = await Promise.race([errored, new Promise((r) => setTimeout(() => r('timeout'), 8000))]);
    expect(outcome).toMatchObject({ status: 404 });
    await Document.updateOne({ _id: doc._id }, { publicationStatus: 'published' });
    const t = Date.now();
    await task.destroy();                                   // must finish even though a page request is stuck (worker is terminated after the grace period)
    expect(Date.now() - t).toBeLessThan(4000);
  });
  it('falls back to the whole body if a server ignores Range (200), and still loads', async () => {
    const { task, usedRanges } = await openDoc({ strip: true });
    expect(usedRanges).toBe(false);
    expect((await task.promise).numPages).toBe(30);
    await task.destroy();
  });
});
