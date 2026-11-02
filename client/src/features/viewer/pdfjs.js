// Isolates PDF.js so it is code-split (loaded only when a PDF is opened) and easy to mock in tests.
let lib;
async function load() {
  if (!lib) {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    lib = pdfjs;
  }
  return lib;
}
import { openDocument } from './rangeTransport.js';

const BASE = { disableAutoFetch: true, isEvalSupported: false, enableXfa: false, rangeChunkSize: 131072 }; // no eval/XFA/scripting, no prefetch
// Every request is an explicit, individually authorized Range request (see rangeTransport.js).
export async function openPdf(url, { length, onError }) {
  return openDocument(await load(), { url, length, onError, base: BASE });
}
export const isRenderCancelled = (e) => e?.name === 'RenderingCancelledException';
