import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { ObjectNotFoundError, StorageUnavailableError } from './errors.js';

// Private storage on Cloudinary: delivery type "authenticated" means no unsigned/public URL can read the asset.
// Everything is stored as resource_type "raw" (original bytes only; no transformations), public_id = our key (with extension).
// NOT yet verified against a real account (upload/stat/delete/signed fetch + byte ranges).
const OPTS = { resource_type: 'raw', type: 'authenticated' };
const status = (e) => e?.http_code ?? e?.error?.http_code;

// If the CDN ignores Range and returns the whole body, cut out [start,end] ourselves and stop reading upstream early.
function sliceStream(source, start, end) {
  return Readable.from((async function* slice() {
    let pos = 0;
    try {
      for await (const chunk of source) {
        const from = Math.max(start - pos, 0), to = Math.min(end + 1 - pos, chunk.length);
        if (to > from) yield chunk.subarray(from, to);
        pos += chunk.length;
        if (pos > end) return;
      }
    } finally { source.destroy(); }
  }()));
}

export function createCloudinaryStorage({ cloudName, apiKey, apiSecret }, deps = {}) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  const doFetch = deps.fetch ?? fetch;
  // The signed URL is a server-side secret: it is never logged, returned, or redirected to.
  const signUrl = deps.signUrl ?? ((key) => cloudinary.url(key, { ...OPTS, sign_url: true, secure: true }));
  return {
    name: 'cloudinary',
    putObject: ({ key, buffer }) => new Promise((resolve, reject) => {
      const up = cloudinary.uploader.upload_stream(
        { ...OPTS, public_id: key, overwrite: false, unique_filename: false, use_filename: false },
        (err, res) => {
          if (err) {
            const wrapped = new Error('Cloudinary upload failed');
            wrapped.name = err.name || 'StorageUploadError';
            wrapped.detail = `http_${status(err) ?? 'unknown'}${err.message ? ` ${err.message}` : ''}`;
            reject(wrapped);
          } else resolve({ bytes: res.bytes });
        });
      up.end(buffer);
    }),
    async statObject(key) {
      try { const r = await cloudinary.api.resource(key, OPTS); return { bytes: r.bytes }; }
      catch (e) { if (status(e) === 404) return null; throw e; }
    },
    async deleteObject(key) {
      const r = await cloudinary.uploader.destroy(key, { ...OPTS, invalidate: true });
      return r.result === 'ok' || r.result === 'not found';
    },
    async getObjectStream({ key, start, end, signal }) {
      const ranged = start !== undefined;
      let res;
      try {
        res = await doFetch(signUrl(key), { headers: ranged ? { Range: `bytes=${start}-${end}` } : {}, signal });
      } catch { throw new StorageUnavailableError('network'); }
      if (res.status === 404) throw new ObjectNotFoundError();
      // x-cld-error is a short diagnostic string from Cloudinary (e.g. PDF delivery blocked); it contains no secrets.
      if (!res.ok) { res.body?.cancel?.().catch(() => {}); throw new StorageUnavailableError(`http_${res.status} ${res.headers.get('x-cld-error') ?? ''}`.trim()); }
      if (!res.body) throw new StorageUnavailableError('empty_body');
      const source = Readable.fromWeb(res.body);
      return { stream: ranged && res.status === 200 ? sliceStream(source, start, end) : source };
    },
  };
}
