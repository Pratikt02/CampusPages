import { Worker } from 'node:worker_threads';

const DEFAULT_WORKER = new URL('./pdfWorker.js', import.meta.url);

// Resolves with the page count. Rejects with an Error whose .reason is 'timeout' | 'invalid' | 'resources'.
// The worker is always terminated, and has a memory ceiling, so parsing is bounded in both time and memory.
export function countPdfPages(buffer, timeoutMs = 10_000, workerUrl = DEFAULT_WORKER) {
  return new Promise((resolve, reject) => {
    const fail = (reason) => Object.assign(new Error(`pdf ${reason}`), { reason });
    let settled = false;
    const worker = new Worker(workerUrl, { workerData: { buffer }, resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 64 } });
    const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate(); fn(v); };
    const timer = setTimeout(() => done(reject, fail('timeout')), timeoutMs);
    worker.once('message', (m) => (m?.ok && Number.isInteger(m.pages) ? done(resolve, m.pages) : done(reject, fail('invalid'))));
    worker.once('error', (e) => done(reject, fail(e?.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'resources' : 'invalid')));
    worker.once('exit', () => done(reject, fail('invalid')));
  });
}
