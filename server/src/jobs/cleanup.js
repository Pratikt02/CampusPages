import { Document } from '../models/Document.js';
import { invalidate } from '../cache/index.js';
import { log } from '../utils/logger.js';

// Removes abandoned/failed uploads: deletes the stored object first, then the record. If the object
// can't be deleted, the record is kept (marked failed) so the next sweep retries - nothing is orphaned silently.
export async function runCleanup({ storage, olderThanMinutes = 30, now = new Date() }) {
  const cutoff = new Date(+now - olderThanMinutes * 60_000);
  const stale = await Document.find({ processingStatus: { $in: ['uploading', 'processing', 'failed'] }, updatedAt: { $lt: cutoff } })
    .select('+objectKey +orphanedObjectKeys');
  let removed = 0;
  for (const d of stale) {
    try {
      for (const key of [d.objectKey, ...(d.orphanedObjectKeys ?? [])]) {
        if (!(await storage.deleteObject(key))) throw new Error('storage rejected cleanup');
      }
      await Document.deleteOne({ _id: d._id });
      removed += 1;
    } catch (e) { log.warn('Cleanup could not delete object; will retry', { docId: String(d._id), name: e?.name }); }
  }
  const replacedFiles = await Document.find({ orphanedObjectKeys: { $exists: true, $ne: [] } }).select('+orphanedObjectKeys');
  let orphanedRemoved = 0;
  for (const d of replacedFiles) {
    const remaining = [];
    for (const key of d.orphanedObjectKeys) {
      try {
        if (await storage.deleteObject(key)) orphanedRemoved += 1;
        else remaining.push(key);
      } catch (e) {
        remaining.push(key);
        log.warn('Cleanup could not remove a replaced file; will retry', { docId: String(d._id), name: e?.name });
      }
    }
    if (remaining.length !== d.orphanedObjectKeys.length) await Document.updateOne({ _id: d._id }, { $set: { orphanedObjectKeys: remaining } });
  }
  if (removed) invalidate('docs:');
  return { scanned: stale.length, removed, orphanedRemoved };
}

// A sweep never overlaps with a previous one that is still running (slow storage could otherwise stack up work).
export function createCleanupRunner({ storage, config }) {
  let running = false;
  return async function tick() {
    if (running) return { skipped: true };
    running = true;
    try { return await runCleanup({ storage, olderThanMinutes: config.cleanupAfterMinutes }); }
    finally { running = false; }
  };
}

export function startCleanupJob({ storage, config, intervalMs = 15 * 60_000 }) {
  const tick = createCleanupRunner({ storage, config });
  const t = setInterval(() => tick().catch((e) => log.error('Cleanup job failed', { name: e?.name })), intervalMs);
  t.unref();
  return t;
}
