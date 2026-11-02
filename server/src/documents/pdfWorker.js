import { parentPort, workerData } from 'node:worker_threads';
import { PDFDocument } from 'pdf-lib';

// Runs in a separate thread so a malicious/pathological PDF cannot stall the API's event loop.
try {
  const pdf = await PDFDocument.load(workerData.buffer, { ignoreEncryption: false, updateMetadata: false });
  parentPort.postMessage({ ok: true, pages: pdf.getPageCount() });
} catch {
  parentPort.postMessage({ ok: false });
}
