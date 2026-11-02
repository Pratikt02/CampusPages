// Authorized byte-range loading for PDF.js. Every request this module makes carries an explicit Range header, so the API
// never sees an un-ranged request that PDF.js would later cancel (which would make the server pull the whole file from storage).
// The PDF.js library is passed in (not imported) so the exact same code is exercised by Node-based integration tests.
const MAX_PARALLEL = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpError = (status, message) => Object.assign(new Error(message), { status });

export async function createRangeSource(lib, { url, length, chunkSize = 131072, fetchImpl = (...a) => fetch(...a), onError = () => {}, signal }) {
  if (!Number.isSafeInteger(length) || length <= 0) throw httpError(0, 'unknown document length');
  const ctl = new AbortController();
  signal?.addEventListener('abort', () => ctl.abort(), { once: true });

  // One retry for transient failures (network error, 502/503); everything else surfaces immediately.
  const get = async (begin, endInclusive, attempt = 0) => {
    let res;
    try { res = await fetchImpl(url, { headers: { Range: `bytes=${begin}-${endInclusive}` }, credentials: 'include', signal: ctl.signal }); }
    catch (e) {
      if (e?.name === 'AbortError') throw e;
      if (attempt >= 1) throw httpError(0, 'network error');
      await sleep(400); return get(begin, endInclusive, attempt + 1);
    }
    if ((res.status === 502 || res.status === 503) && attempt < 1) { await sleep(500); return get(begin, endInclusive, attempt + 1); }
    return res;
  };
  const partial = async (begin, endInclusive) => {
    const res = await get(begin, endInclusive);
    if (!res.ok) throw httpError(res.status, 'http error');
    if (res.status !== 206) throw httpError(502, 'server ignored range request');
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
    if (!m || Number(m[1]) !== begin || Number(m[3]) !== length) throw httpError(502, 'unexpected content-range');
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length !== endInclusive - begin + 1) throw httpError(502, 'unexpected body length');
    return bytes;
  };

  // First chunk (also validates that ranges work). If a server ignores Range and sends 200, use the whole body.
  const firstEnd = Math.min(chunkSize, length) - 1;
  const res = await get(0, firstEnd);
  if (!res.ok) throw httpError(res.status, 'http error');
  if (res.status === 200) return { data: new Uint8Array(await res.arrayBuffer()), abort: () => ctl.abort() };
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
  if (!m || Number(m[1]) !== 0 || Number(m[3]) !== length) throw httpError(502, 'unexpected content-range');
  const initial = new Uint8Array(await res.arrayBuffer());
  if (initial.length !== firstEnd + 1) throw httpError(502, 'unexpected body length');

  class Transport extends lib.PDFDataRangeTransport {
    constructor() { super(length, initial); this.queue = []; this.active = 0; }
    requestDataRange(begin, end) { this.queue.push([begin, Math.min(end, length)]); this.pump(); }
    pump() {
      while (this.active < MAX_PARALLEL && this.queue.length) {
        const [begin, end] = this.queue.shift(); this.active += 1;
        partial(begin, end - 1)
          .then((bytes) => this.onDataRange(begin, bytes))
          .catch((e) => { if (e?.name !== 'AbortError') onError(e); })
          .finally(() => { this.active -= 1; this.pump(); });
      }
    }
    abort() { this.queue = []; ctl.abort(); }
  }
  return { transport: new Transport(), abort: () => ctl.abort() };
}

// Opens a document through the authorized range transport and returns the PDF.js loading task.
// Teardown is bounded: if a range request failed, PDF.js's graceful destroy() can wait forever on page work that is blocked on
// bytes that will never arrive, so after `graceMs` the worker thread is terminated outright. This frees its memory.
export async function openDocument(lib, { url, length, base = {}, graceMs = 2000, ...opts }) {
  const src = await createRangeSource(lib, { url, length, ...opts });
  const worker = new lib.PDFWorker();
  const task = lib.getDocument(src.data ? { data: src.data, worker, ...base } : { range: src.transport, length, worker, ...base });
  const graceful = task.destroy.bind(task);
  task.destroy = async () => {
    src.abort();
    let timer;
    const forced = new Promise((resolve) => { timer = setTimeout(() => { worker.destroy(); resolve(); }, graceMs); });
    const polite = graceful().catch(() => {}); // may never settle if the worker is blocked; it is simply abandoned after termination
    try { await Promise.race([polite, forced]); } finally { clearTimeout(timer); }
  };
  return task;
}
