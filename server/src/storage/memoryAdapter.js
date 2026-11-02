// In-memory storage for tests and local experiments. Data is lost on restart. Refused in production.
import { Readable } from 'node:stream';
import { ObjectNotFoundError, StorageUnavailableError } from './errors.js';

export function createMemoryStorage() {
  const objects = new Map();
  const hooks = { failPut: false, failDelete: false, failStat: false, failGet: false, failMidStream: false, hold: null };
  const state = { openStreams: 0, getCalls: 0, calls: [], bytesSent: 0 };
  return {
    name: 'memory', objects, hooks, state,
    // Contract: getObjectStream({key,start?,end?,signal?}) -> { stream }  (inclusive byte offsets)
    async getObjectStream({ key, start, end, signal }) {
      state.getCalls += 1; const call = { start, end, pulled: 0 }; state.calls.push(call);
      if (hooks.failGet) throw new StorageUnavailableError('simulated');
      const buf = objects.get(key);
      if (!buf) throw new ObjectNotFoundError();
      const slice = start === undefined ? buf : buf.subarray(start, end + 1);
      state.openStreams += 1;
      async function* gen() {
        try {
          if (hooks.hold) { // test hook: keep the stream open without data, but stay abortable like a real network stream
            await new Promise((res) => { hooks.hold.then(res); signal?.addEventListener('abort', res, { once: true }); });
            if (signal?.aborted) return;
          }
          for (let i = 0; i < slice.length; i += 16384) {
            if (hooks.failMidStream && i > 0) throw new Error('simulated mid-stream failure');
            state.bytesSent += Math.min(16384, slice.length - i); call.pulled += Math.min(16384, slice.length - i);
            yield slice.subarray(i, i + 16384);
          }
        } finally { state.openStreams -= 1; }
      }
      const stream = Readable.from(gen(), { objectMode: false });
      signal?.addEventListener('abort', () => stream.destroy(new Error('aborted')), { once: true });
      return { stream };
    },
    async putObject({ key, buffer }) {
      if (hooks.failPut) { hooks.failPut = false; throw new Error('simulated storage failure'); }
      if (objects.has(key)) throw new Error('object exists');
      objects.set(key, Buffer.from(buffer));
      return { bytes: buffer.length };
    },
    async statObject(key) {
      if (hooks.failStat) { hooks.failStat = false; throw new Error('simulated storage failure'); }
      return objects.has(key) ? { bytes: objects.get(key).length } : null;
    },
    async deleteObject(key) {
      if (hooks.failDelete) throw new Error('simulated storage failure');
      objects.delete(key); return true; // idempotent
    },
  };
}
