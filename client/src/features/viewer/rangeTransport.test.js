import { describe, it, expect, vi } from 'vitest';
import { createRangeSource } from './rangeTransport.js';

const LEN = 1_000_000; const CHUNK = 131072;
class FakeTransport { constructor(length, initialData) { this.length = length; this.initialData = initialData; this.got = []; } onDataRange(b, c) { this.got.push([b, c.length]); } abort() {} }
const lib = { PDFDataRangeTransport: FakeTransport };
const bytes = (n) => new Uint8Array(n).fill(1);
const partial = (b, e, total = LEN, over = {}) => new Response(bytes(e - b + 1), { status: 206, headers: { 'Content-Range': `bytes ${b}-${e}/${total}` }, ...over });
const rangeOf = (init) => /bytes=(\d+)-(\d+)/.exec(init.headers.Range).slice(1).map(Number);
// Serves any requested range correctly.
const goodFetch = () => vi.fn(async (_u, init) => { const [b, e] = rangeOf(init); return partial(b, Math.min(e, LEN - 1)); });
const waitFor = async (fn) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 5)); };

describe('createRangeSource', () => {
  it('starts with an explicit first-chunk range request (never un-ranged) and builds the transport', async () => {
    const f = goodFetch();
    const { transport } = await createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][1].headers.Range).toBe(`bytes=0-${CHUNK - 1}`);
    expect(f.mock.calls[0][1].credentials).toBe('include');
    expect(transport.length).toBe(LEN); expect(transport.initialData.length).toBe(CHUNK);
  });
  it('requests later ranges with exclusive->inclusive conversion, clamps to the file length, and delivers data', async () => {
    const f = goodFetch(); const { transport } = await createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: f });
    transport.requestDataRange(500_000, 600_000); transport.requestDataRange(900_000, 5_000_000);
    await waitFor(() => transport.got.length === 2);
    expect(f.mock.calls.slice(1).map(([, i]) => i.headers.Range)).toEqual(['bytes=500000-599999', `bytes=900000-${LEN - 1}`]);
    expect(transport.got).toEqual([[500000, 100000], [900000, 100000]]);
  });
  it('handles a document smaller than one chunk', async () => {
    const f = vi.fn(async () => partial(0, 999, 1000)); const { transport } = await createRangeSource(lib, { url: '/c', length: 1000, fetchImpl: f });
    expect(f.mock.calls[0][1].headers.Range).toBe('bytes=0-999'); expect(transport.initialData.length).toBe(1000);
  });
  it('falls back to the whole body when the server ignores Range (200)', async () => {
    const r = await createRangeSource(lib, { url: '/c', length: 1000, fetchImpl: async () => new Response(bytes(1000), { status: 200 }) });
    expect(r.data.length).toBe(1000); expect(r.transport).toBeUndefined();
  });
  it('surfaces HTTP statuses from the first request (401/404) without retrying', async () => {
    for (const status of [401, 404]) {
      const f = vi.fn(async () => new Response('', { status }));
      await expect(createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: f })).rejects.toMatchObject({ status });
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
  it('retries once on 503 or a network error, then succeeds', async () => {
    let n = 0; const f = vi.fn(async (_u, init) => { n += 1; if (n === 1) return new Response('', { status: 503 }); const [b, e] = rangeOf(init); return partial(b, e); });
    await createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: f }); expect(f).toHaveBeenCalledTimes(2);
    let m = 0; const g = vi.fn(async (_u, init) => { m += 1; if (m === 1) throw new TypeError('network'); const [b, e] = rangeOf(init); return partial(b, e); });
    await createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: g }); expect(g).toHaveBeenCalledTimes(2);
    const h = vi.fn(async () => new Response('', { status: 503 }));
    await expect(createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: h })).rejects.toMatchObject({ status: 503 });
    expect(h).toHaveBeenCalledTimes(2);
  });
  it('rejects mismatched Content-Range totals and short bodies instead of feeding PDF.js bad bytes', async () => {
    await expect(createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: async () => partial(0, CHUNK - 1, LEN + 5) })).rejects.toMatchObject({ status: 502 });
    await expect(createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: async () => new Response(bytes(10), { status: 206, headers: { 'Content-Range': `bytes 0-${CHUNK - 1}/${LEN}` } }) })).rejects.toMatchObject({ status: 502 });
    const errors = []; let n = 0;
    const f = vi.fn(async (_u, init) => { n += 1; const [b, e] = rangeOf(init); return n === 1 ? partial(b, e) : partial(b, e - 1); }); // later response is one byte short
    const { transport } = await createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: f, onError: (e) => errors.push(e) });
    transport.requestDataRange(300_000, 310_000); await waitFor(() => errors.length);
    expect(errors[0].status).toBe(502); expect(transport.got).toEqual([]);
  });
  it('reports later failures (e.g. session ended / unpublished) through onError', async () => {
    let n = 0; const errors = [];
    const f = async (_u, init) => { n += 1; if (n === 1) { const [b, e] = rangeOf(init); return partial(b, e); } return new Response('', { status: 404 }); };
    const { transport } = await createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: f, onError: (e) => errors.push(e) });
    transport.requestDataRange(400_000, 410_000); await waitFor(() => errors.length);
    expect(errors[0].status).toBe(404);
  });
  it('limits parallel range requests to 4', async () => {
    let active = 0; let peak = 0; const release = [];
    const f = vi.fn((_u, init) => { const [b, e] = rangeOf(init); if (b === 0) return Promise.resolve(partial(b, e));
      active += 1; peak = Math.max(peak, active); return new Promise((res) => release.push(() => { active -= 1; res(partial(b, e)); })); });
    const { transport } = await createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: f });
    for (let i = 0; i < 10; i++) transport.requestDataRange(200_000 + i * 1000, 200_500 + i * 1000);
    await waitFor(() => release.length >= 4); expect(peak).toBe(4);
    while (transport.got.length < 10) { release.splice(0).forEach((r) => r()); await new Promise((r) => setTimeout(r, 5)); }
    expect(peak).toBe(4);
  });
  it('abort cancels in-flight requests without reporting an error', async () => {
    const errors = []; let sig;
    const f = vi.fn((_u, init) => { const [b, e] = rangeOf(init); if (b === 0) return Promise.resolve(partial(b, e)); sig = init.signal; return new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))); });
    const { transport, abort } = await createRangeSource(lib, { url: '/c', length: LEN, fetchImpl: f, onError: (e) => errors.push(e) });
    transport.requestDataRange(300_000, 301_000); await waitFor(() => sig);
    abort(); await new Promise((r) => setTimeout(r, 30));
    expect(sig.aborted).toBe(true); expect(errors).toEqual([]);
  });
  it('requires a known positive length', async () => {
    for (const length of [0, -1, undefined, NaN]) await expect(createRangeSource(lib, { url: '/c', length, fetchImpl: goodFetch() })).rejects.toBeTruthy();
  });
});
