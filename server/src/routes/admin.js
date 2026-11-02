import { Router } from 'express';
import multer from 'multer';
import { Document } from '../models/Document.js';
import { Subject, slugify } from '../models/Subject.js';
import { audit } from '../models/AuditEvent.js';
import { requireAuth, requireRole, httpError } from '../middleware/auth.js';
import { inspectFile, makeObjectKey, validateMetadata, isObjectId } from '../documents/validation.js';
import { adminDto } from '../documents/dto.js';
import { cached, invalidate } from '../cache/index.js';
import { log } from '../utils/logger.js';
import mongoose from 'mongoose';
import crypto from 'node:crypto';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v) => (typeof v === 'string' ? v : undefined);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const duplicateKeyFor = (m) => m.academicCategory && m.academicCategory !== 'legacy'
  ? crypto.createHash('sha256').update(JSON.stringify([String(m.subject), m.academicCategory, m.academicYear ?? null, m.branch ?? null, (m.standard ?? '').toLocaleLowerCase(), (m.course ?? '').toLocaleLowerCase(), m.semester ?? null, m.materialType ?? 'study-notes', m.title.trim().toLocaleLowerCase()])).digest('hex')
  : undefined;

export function adminRouter(config, { storage }) {
  const r = Router();
  r.use(requireAuth(config), requireRole('admin'));

  const upload = multer({ storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 16, fieldSize: 10_000, parts: 18 } }).single('file');
  let active = 0; // bounds memory: at most N uploads buffered at once
  const slot = (req, res, next) => {
    if (active >= config.maxConcurrentUploads) {
      res.set('Retry-After', '5');
      return next(httpError(503, 'BUSY', 'The server is busy processing other uploads. Try again shortly.'));
    }
    active += 1;
    let freed = false;
    const free = () => { if (!freed) { freed = true; active -= 1; } };
    res.on('close', free); res.on('finish', free);
    next();
  };

  const loadDoc = async (id, withKey = false) => {
    if (!isObjectId(id)) throw httpError(400, 'VALIDATION', 'Invalid document id.');
    const q = Document.findById(id);
    if (withKey) q.select('+objectKey +orphanedObjectKeys');
    const d = await q;
    if (!d) throw httpError(404, 'NOT_FOUND', 'Document not found.');
    return d;
  };

  r.get('/ping', (_req, res) => res.json({ ok: true }));

  r.get('/stats', wrap(async (_req, res) => {
    const stats = await cached('docs:stats', async () => {
      const [total, published, drafts, inProgress, failed, pdf, image, bytes] = await Promise.all([
        Document.countDocuments({}),
        Document.countDocuments({ publicationStatus: 'published' }),
        Document.countDocuments({ processingStatus: 'ready', publicationStatus: 'draft' }),
        Document.countDocuments({ processingStatus: { $in: ['uploading', 'processing'] } }),
        Document.countDocuments({ processingStatus: 'failed' }),
        Document.countDocuments({ fileType: 'pdf' }),
        Document.countDocuments({ fileType: 'image' }),
        Document.aggregate([{ $group: { _id: null, n: { $sum: '$fileSize' } } }]),
      ]);
      return { total, published, drafts, inProgress, failed, pdf, image, totalBytes: bytes[0]?.n ?? 0 };
    });
    res.json(stats);
  }));

  r.get('/subjects', wrap(async (_req, res) => {
    const items = await cached('subjects:list', async () =>
      (await Subject.find().sort({ order: 1, name: 1 }).lean()).map((s) => ({ id: String(s._id), name: s.name, slug: s.slug, description: s.description })));
    res.json({ items });
  }));

  r.post('/subjects', wrap(async (req, res) => {
    const name = str(req.body?.name)?.trim(); const description = str(req.body?.description)?.trim() ?? '';
    if (!name || name.length < 2 || name.length > 80 || description.length > 500) throw httpError(400, 'VALIDATION', 'Subject name must be 2-80 characters.');
    const slug = slugify(name);
    if (!slug) throw httpError(400, 'VALIDATION', 'Subject name must contain letters or numbers.');
    try {
      const s = await Subject.create({ name, slug, description });
      invalidate('subjects:', 'docs:');
      res.status(201).json({ id: String(s._id), name: s.name, slug: s.slug, description: s.description });
    } catch (e) {
      if (e.code === 11000) throw httpError(409, 'CONFLICT', 'A subject with that name already exists.');
      throw e;
    }
  }));

  r.get('/documents', wrap(async (req, res) => {
    const { q, subject, publication, processing, fileType } = req.query;
    for (const v of [q, subject, publication, processing, fileType, req.query.page, req.query.limit]) {
      if (v !== undefined && typeof v !== 'string') throw httpError(400, 'VALIDATION', 'Invalid query parameters.'); // blocks operator objects
    }
    const filter = {};
    if (q) filter.title = { $regex: esc(q.slice(0, 100)), $options: 'i' };
    if (subject) { if (!isObjectId(subject)) throw httpError(400, 'VALIDATION', 'Invalid subject.'); filter.subject = subject; }
    if (publication) { if (!['draft', 'published'].includes(publication)) throw httpError(400, 'VALIDATION', 'Invalid filter.'); filter.publicationStatus = publication; }
    if (processing) { if (!['uploading', 'processing', 'ready', 'failed'].includes(processing)) throw httpError(400, 'VALIDATION', 'Invalid filter.'); filter.processingStatus = processing; }
    if (fileType) { if (!['pdf', 'image'].includes(fileType)) throw httpError(400, 'VALIDATION', 'Invalid filter.'); filter.fileType = fileType; }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [items, total] = await Promise.all([
      Document.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('subject', 'name').lean(),
      Document.countDocuments(filter),
    ]);
    res.json({ items: items.map(adminDto), page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) });
  }));

  r.get('/documents/:id', wrap(async (req, res) => {
    const d = await loadDoc(req.params.id);
    await d.populate('subject', 'name');
    res.json(adminDto(d));
  }));

  r.post('/documents', slot, upload, wrap(async (req, res) => {
    const { publish, ...metadataBody } = req.body ?? {};
    const meta = validateMetadata(metadataBody);
    if (!(await Subject.exists({ _id: meta.subject }))) throw httpError(400, 'VALIDATION', 'Unknown subject.');
    if (publish !== undefined && !['true', 'false'].includes(publish)) throw httpError(400, 'VALIDATION', 'Publish must be true or false.');
    if (meta.academicCategory && meta.academicCategory !== 'legacy') {
      const scope = { subject: meta.subject, academicCategory: meta.academicCategory,
        academicYear: meta.academicYear ?? null, branch: meta.branch ?? null,
        standard: meta.standard ?? null, course: meta.course ?? null,
        semester: meta.semester ?? null, materialType: meta.materialType ?? 'study-notes', title: { $regex: `^${esc(meta.title)}$`, $options: 'i' } };
      if (await Document.exists(scope)) throw httpError(409, 'DUPLICATE', 'A material with this title already exists in that course and semester.');
    }
    const info = await inspectFile(req.file, config); // extension + magic bytes + MIME + size + pages/dimensions

    const _id = new mongoose.Types.ObjectId();
    const objectKey = makeObjectKey(String(_id), info.keyExt);
    // Record first (status "uploading") so a crash can never leave an untracked object behind.
    let doc;
    try { doc = await Document.create({ _id, ...meta, duplicateKey: duplicateKeyFor(meta), fileType: info.fileType, mimeType: info.mime, objectKey,
      fileSize: info.fileSize, pageCount: info.pageCount, width: info.width, height: info.height,
      processingStatus: 'uploading', publicationStatus: 'draft', uploader: req.auth.user._id }); }
    catch (e) { if (e.code === 11000) throw httpError(409, 'DUPLICATE', 'A material with this title already exists in that course and semester.'); throw e; }
    try {
      await storage.putObject({ key: objectKey, buffer: req.file.buffer, contentType: info.mime });
      doc.processingStatus = 'processing'; await doc.save();
      const stored = await storage.statObject(objectKey); // verify before trusting
      if (!stored || stored.bytes !== info.fileSize) throw new Error('stored object verification failed');
      doc.processingStatus = 'ready';
      if (publish === 'true') doc.publicationStatus = 'published';
      await doc.save();
    } catch (e) {
      log.error('Upload failed', { docId: String(_id), name: e?.name, detail: e?.detail });
      let cleaned = false;
      try { cleaned = await storage.deleteObject(objectKey); } catch { /* sweeper retries */ }
      if (cleaned) await Document.deleteOne({ _id });
      else await Document.updateOne({ _id }, { processingStatus: 'failed', failureReason: 'storage_error' });
      invalidate('docs:');
      throw httpError(502, 'STORAGE_ERROR', 'The file could not be stored. Please try again.');
    }
    invalidate('docs:');
    await audit('document_uploaded', req.auth.user._id, String(_id));
    if (doc.publicationStatus === 'published') await audit('document_published', req.auth.user._id, String(_id));
    await doc.populate('subject', 'name');
    res.status(201).json(adminDto(doc));
  }));

  r.put('/documents/:id/file', slot, upload, wrap(async (req, res) => {
    const d = await loadDoc(req.params.id, true);
    const info = await inspectFile(req.file, config);
    const nextKey = makeObjectKey(String(d._id), info.keyExt);
    try {
      await storage.putObject({ key: nextKey, buffer: req.file.buffer, contentType: info.mime });
      const stored = await storage.statObject(nextKey);
      if (!stored || stored.bytes !== info.fileSize) throw new Error('stored object verification failed');
    } catch (e) {
      try { await storage.deleteObject(nextKey); } catch { /* operational cleanup may retry */ }
      log.error('Replacement upload failed', { docId: String(d._id), name: e?.name, detail: e?.detail });
      throw httpError(502, 'STORAGE_ERROR', 'The replacement file could not be stored. The existing document was kept.');
    }
    const previousKey = d.objectKey;
    d.objectKey = nextKey; d.fileType = info.fileType; d.mimeType = info.mime;
    d.fileSize = info.fileSize; d.pageCount = info.pageCount; d.width = info.width; d.height = info.height;
    d.orphanedObjectKeys = [...(d.orphanedObjectKeys ?? []), previousKey];
    d.processingStatus = 'ready'; d.failureReason = null;
    try { await d.save(); } catch (e) {
      try { await storage.deleteObject(nextKey); } catch { /* operational cleanup may retry */ }
      throw e;
    }
    try {
      const deleted = await storage.deleteObject(previousKey);
      if (deleted) { d.orphanedObjectKeys = d.orphanedObjectKeys.filter((key) => key !== previousKey); await d.save(); }
      else log.warn('Old file could not be removed after replacement', { docId: String(d._id) });
    } catch { log.warn('Old file could not be removed after replacement', { docId: String(d._id) }); }
    invalidate('docs:');
    await audit('document_file_replaced', req.auth.user._id, String(d._id));
    await d.populate('subject', 'name');
    res.json(adminDto(d));
  }));

  r.patch('/documents/:id', wrap(async (req, res) => {
    const d = await loadDoc(req.params.id);
    const changes = validateMetadata(req.body ?? {}, { partial: true });
    const category = changes.academicCategory ?? d.academicCategory;
    if (category === 'engineering' && ((changes.academicYear ?? d.academicYear) == null || (changes.branch ?? d.branch) == null)) throw httpError(400, 'VALIDATION', 'Engineering materials require an academic year and branch.');
    if (category === 'other' && !(changes.standard ?? d.standard)) throw httpError(400, 'VALIDATION', 'Other Standards materials require a standard or class.');
    const editedSemester = changes.semester ?? d.semester;
    const editedYear = changes.academicYear ?? d.academicYear;
    if (category === 'engineering' && editedSemester && (editedSemester < (editedYear - 1) * 2 + 1 || editedSemester > editedYear * 2)) throw httpError(400, 'VALIDATION', 'Semester must match the selected academic year.');
    if (changes.subject && !(await Subject.exists({ _id: changes.subject }))) throw httpError(400, 'VALIDATION', 'Unknown subject.');
    if (!Object.keys(changes).length) throw httpError(400, 'VALIDATION', 'No changes supplied.');
    d.set(changes); d.duplicateKey = duplicateKeyFor(d);
    try { await d.save(); } catch (e) { if (e.code === 11000) throw httpError(409, 'DUPLICATE', 'A material with this title already exists in that course and semester.'); throw e; }
    invalidate('docs:');
    await audit('document_updated', req.auth.user._id, String(d._id));
    await d.populate('subject', 'name');
    res.json(adminDto(d));
  }));

  r.patch('/documents/:id/publish', wrap(async (req, res) => {
    if (typeof req.body?.published !== 'boolean' || Object.keys(req.body).length !== 1) throw httpError(400, 'VALIDATION', 'Body must be {"published": true|false}.');
    const d = await loadDoc(req.params.id);
    if (req.body.published && d.processingStatus !== 'ready') throw httpError(409, 'NOT_READY', 'Only fully processed documents can be published.');
    d.publicationStatus = req.body.published ? 'published' : 'draft';
    await d.save();
    invalidate('docs:');
    await audit(req.body.published ? 'document_published' : 'document_unpublished', req.auth.user._id, String(d._id));
    await d.populate('subject', 'name');
    res.json(adminDto(d));
  }));

  r.delete('/documents/:id', wrap(async (req, res) => {
    const d = await loadDoc(req.params.id, true);
    // Object first: if storage fails we keep the record (and return an error) instead of orphaning bytes.
    let deleted = true;
    try {
      for (const key of [d.objectKey, ...(d.orphanedObjectKeys ?? [])]) {
        if (!(await storage.deleteObject(key))) { deleted = false; break; }
      }
    } catch { deleted = false; }
    if (!deleted) {
      await Document.updateOne({ _id: d._id }, { publicationStatus: 'draft' }); // stop serving while cleanup is pending
      invalidate('docs:');
      throw httpError(502, 'STORAGE_ERROR', 'The stored file could not be deleted. The document was unpublished; please retry.');
    }
    await Document.deleteOne({ _id: d._id });
    invalidate('docs:');
    await audit('document_deleted', req.auth.user._id, String(d._id));
    res.status(204).end();
  }));

  return r;
}
