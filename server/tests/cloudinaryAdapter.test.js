import { describe, it, expect, vi } from 'vitest';
import { createCloudinaryStorage } from '../src/storage/cloudinaryAdapter.js';
import { ObjectNotFoundError, StorageUnavailableError } from '../src/storage/errors.js';

const CREDS = { cloudName: 'demo-cloud', apiKey: '123456789012345', apiSecret: 'test-secret-value' };
const DATA = Buffer.from(Array.from({ length: 100 }, (_, i) => i));
const read = async (stream) => { const c = []; for await (const x of stream) c.push(Buffer.from(x)); return Buffer.concat(c); };
const make = (fetchImpl) => createCloudinaryStorage(CREDS, { fetch: fetchImpl, signUrl: (k) => `https://signed.example/${k}?sig=SECRETSIG` });

describe('cloudinary adapter streaming (mocked network)', () => {
  it('streams the full object without a Range header', async () => {
    const f = vi.fn(async () => new Response(DATA, { status: 200 }));
    const { stream } = await make(f).getObjectStream({ key: 'k.pdf' });
    expect(f.mock.calls[0][1].headers).toEqual({});
    expect((await read(stream)).equals(DATA)).toBe(true);
  });
  it('forwards an inclusive Range and passes through a 206 body untouched', async () => {
    const f = vi.fn(async () => new Response(DATA.subarray(10, 20), { status: 206 }));
    const { stream } = await make(f).getObjectStream({ key: 'k.pdf', start: 10, end: 19 });
    expect(f.mock.calls[0][1].headers).toEqual({ Range: 'bytes=10-19' });
    expect((await read(stream)).equals(DATA.subarray(10, 20))).toBe(true);
  });
  it.each([[0, 9], [10, 19], [95, 99], [0, 99], [50, 50]])('slices bytes %i-%i itself when the CDN ignores Range (returns 200)', async (s, e) => {
    const f = async () => new Response(DATA, { status: 200 });
    const { stream } = await make(f).getObjectStream({ key: 'k', start: s, end: e });
    expect((await read(stream)).equals(DATA.subarray(s, e + 1))).toBe(true);
  });
  it('maps 404 to ObjectNotFoundError', async () => {
    await expect(make(async () => new Response('', { status: 404 })).getObjectStream({ key: 'k' })).rejects.toBeInstanceOf(ObjectNotFoundError);
  });
  it('maps 401/5xx/network failures to StorageUnavailableError, surfacing the x-cld-error diagnostic but never the URL', async () => {
    const blocked = make(async () => new Response('', { status: 401, headers: { 'x-cld-error': 'deny or ACL failure' } }));
    const err = await blocked.getObjectStream({ key: 'k' }).catch((e) => e);
    expect(err).toBeInstanceOf(StorageUnavailableError);
    expect(err.detail).toContain('http_401'); expect(err.detail).toContain('deny or ACL failure');
    expect(`${err.message}${err.detail}${err.stack}`).not.toMatch(/SECRETSIG|signed\.example/);
    await expect(make(async () => new Response('', { status: 503 })).getObjectStream({ key: 'k' })).rejects.toBeInstanceOf(StorageUnavailableError);
    const net = await make(async () => { throw new TypeError('connect ECONNREFUSED signed.example SECRETSIG'); }).getObjectStream({ key: 'k' }).catch((e) => e);
    expect(net).toBeInstanceOf(StorageUnavailableError); expect(`${net.message}${net.detail}`).not.toMatch(/SECRETSIG/);
  });
  it('the real SDK signing produces a signed authenticated raw URL (no network call)', async () => {
    let url;
    const adapter = createCloudinaryStorage(CREDS, { fetch: async (u) => { url = u; return new Response(DATA, { status: 200 }); } });
    await adapter.getObjectStream({ key: 'campuspages/documents/abc/def.pdf' });
    expect(url).toMatch(/^https:\/\/res\.cloudinary\.com\/demo-cloud\/raw\/authenticated\/s--[\w-]{8}--\//);
    expect(url).toContain('campuspages/documents/abc/def.pdf');
    expect(url).not.toContain(CREDS.apiSecret);
  });
});
