import { pipeline } from 'node:stream';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Document } from '../models/Document.js';
import { Subject } from '../models/Subject.js';
import { requireAuth, httpError } from '../middleware/auth.js';
import { isObjectId } from '../documents/validation.js';
import { cached } from '../cache/index.js';
import { VISIBLE } from './public.js';
import { parseRange } from '../documents/range.js';
import { createStreamLimiter } from '../middleware/streamLimiter.js';
import { ObjectNotFoundError } from '../storage/errors.js';
import { log } from '../utils/logger.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Allow-listed student-facing fields. No objectKey, mimeType, uploader, or processing/publication internals.
const FIELDS = 'title description subject semester academicCategory academicYear branch standard course materialType fileType pageCount width height fileSize createdAt';
const dto = (d) => ({
  id: String(d._id), title: d.title, description: d.description,
  subject: d.subject?.name ? { id: String(d.subject._id), name: d.subject.name } : null,
  semester: d.semester ?? null, fileType: d.fileType, pageCount: d.pageCount ?? null,
  academicCategory: d.academicCategory ?? 'legacy', academicYear: d.academicYear ?? null,
  branch: d.branch ?? null, standard: d.standard ?? null, course: d.course ?? null,
  materialType: d.materialType ?? 'study-notes',
  width: d.width ?? null, height: d.height ?? null, fileSize: d.fileSize, createdAt: d.createdAt,
});

export function documentsRouter(config, { storage } = {}) {
  const r = Router();
  const streams = createStreamLimiter({ global: config.maxStreamsGlobal, perUser: config.maxStreamsPerUser });
  const contentLimiter = rateLimit({ windowMs: 60_000, limit: config.contentMaxPerMinute, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (req) => `u:${req.auth.user._id}`, validate: false,
    handler: (_q, _s, next) => next(httpError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.')) });
  // Authentication + CURRENT account status are checked on every request, before any cache is consulted.
  r.use(requireAuth(config));
  r.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

  r.get('/', wrap(async (req, res) => {
    const { q, subject, fileType, semester, page: pg, limit: lm, academicCategory, academicYear, branch, standard, course, materialType, sort } = req.query;
    for (const v of [q, subject, fileType, semester, pg, lm, academicCategory, academicYear, branch, standard, course, materialType, sort]) if (v !== undefined && typeof v !== 'string') throw httpError(400, 'VALIDATION', 'Invalid query parameters.');
    const filter = { ...VISIBLE };
    if (subject) { if (!isObjectId(subject)) throw httpError(400, 'VALIDATION', 'Invalid subject.'); filter.subject = subject; }
    if (fileType) { if (!['pdf', 'image'].includes(fileType)) throw httpError(400, 'VALIDATION', 'Invalid file type.'); filter.fileType = fileType; }
    if (semester) { const n = Number(semester); if (!Number.isInteger(n) || n < 1 || n > 12) throw httpError(400, 'VALIDATION', 'Invalid semester.'); filter.semester = n; }
    if (academicCategory) { if (!['engineering', 'other', 'legacy'].includes(academicCategory)) throw httpError(400, 'VALIDATION', 'Invalid academic category.'); filter.academicCategory = academicCategory; }
    if (academicYear) { const n = Number(academicYear); if (!Number.isInteger(n) || n < 1 || n > 4) throw httpError(400, 'VALIDATION', 'Invalid academic year.'); filter.academicYear = n; }
    if (branch) { if (!['CS', 'IT', 'ENTC', 'MECH', 'Civil', 'AIDS'].includes(branch)) throw httpError(400, 'VALIDATION', 'Invalid branch.'); filter.branch = branch; }
    if (standard?.trim()) filter.standard = { $regex: `^${esc(standard.trim().slice(0, 100))}$`, $options: 'i' };
    if (course?.trim()) filter.course = { $regex: `^${esc(course.trim().slice(0, 120))}$`, $options: 'i' };
    if (materialType) { if (!['study-notes', 'previous-year-question-paper', 'practical-file', 'lab-manual', 'syllabus'].includes(materialType)) throw httpError(400, 'VALIDATION', 'Invalid material type.'); filter.materialType = materialType; }
    if (sort && !['newest', 'oldest'].includes(sort)) throw httpError(400, 'VALIDATION', 'Invalid sort order.');
    const term = q?.trim().slice(0, 100);
    if (term) {
      const pattern = { $regex: esc(term), $options: 'i' };
      const subjects = await Subject.find({ name: pattern }).distinct('_id');
      filter.$or = [{ title: pattern }, { description: pattern }, ...(subjects.length ? [{ subject: { $in: subjects } }] : [])];
    }
    const limit = Math.min(Math.max(parseInt(lm, 10) || 12, 1), 30);
    const page = Math.min(Math.max(parseInt(pg, 10) || 1, 1), 10_000);

    const load = async () => {
      const [items, total] = await Promise.all([
        Document.find(filter).select(FIELDS).sort(sort === 'oldest' ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('subject', 'name').lean(),
        Document.countDocuments(filter),
      ]);
      return { items: items.map(dto), page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) };
    };
    // Only bounded-cardinality (non-search) queries are cached; invalidated by every document mutation.
    const data = term ? await load() : await cached(`docs:catalogue:${subject ?? ''}:${fileType ?? ''}:${semester ?? ''}:${academicCategory ?? ''}:${academicYear ?? ''}:${branch ?? ''}:${standard ?? ''}:${course ?? ''}:${materialType ?? ''}:${sort ?? ''}:${page}:${limit}`, load, 30);
    res.json(data);
  }));

  r.get('/facets', wrap(async (_req, res) => {
    const [standards, courses] = await Promise.all([
      Document.distinct('standard', { ...VISIBLE, academicCategory: 'other', standard: { $type: 'string', $ne: '' } }),
      Document.distinct('course', { ...VISIBLE, academicCategory: 'other', course: { $type: 'string', $ne: '' } }),
    ]);
    res.json({ standards: standards.sort((a, b) => a.localeCompare(b)), courses: courses.sort((a, b) => a.localeCompare(b)) });
  }));

  // PROTECTED CONTENT. Every request (including each PDF.js range request) is authorized against CURRENT DB state:
  // valid session, active account, and a document that is published + ready right now. Nothing here is cached.
  // The storage key is read server-side only and never sent to the client; there is no client-controlled path.
  r.get('/:id/content', contentLimiter, wrap(async (req, res) => {
    if (req.query.download !== undefined) throw httpError(400, 'VALIDATION', 'Downloads are not available.');
    const notFound = () => httpError(404, 'NOT_FOUND', 'Document not found.');
    const d = isObjectId(req.params.id) ? await Document.findOne({ _id: req.params.id, ...VISIBLE }).select('+objectKey').lean() : null;
    if (!d) throw notFound();
    const range = parseRange(req.get('range'), d.fileSize, Boolean(req.get('if-range')));
    if (range.type === 'invalid') {
      res.set('Content-Range', `bytes */${d.fileSize}`);
      throw httpError(416, 'RANGE_NOT_SATISFIABLE', 'The requested range cannot be satisfied.');
    }
    const partial = range.type === 'range';
    const start = partial ? range.start : undefined, end = partial ? range.end : undefined;
    const length = partial ? end - start + 1 : d.fileSize;
    // Content headers are applied only once we are certain to stream, so JSON error responses never inherit them.
    const sendHeaders = () => {
      const ext = d.fileType === 'pdf' ? 'pdf' : d.mimeType === 'image/jpeg' ? 'jpg' : d.mimeType.split('/')[1];
      res.set({ 'Accept-Ranges': 'bytes', 'Content-Type': d.mimeType, 'Content-Disposition': 'inline', 'Content-Length': String(length),
        'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-Type-Options': 'nosniff' });
      if (partial) res.set('Content-Range', `bytes ${start}-${end}/${d.fileSize}`);
      res.status(partial ? 206 : 200);
    };
    if (req.method === 'HEAD') { sendHeaders(); return res.end(); } // headers only; storage is not contacted

    const release = streams.acquire(String(req.auth.user._id));
    if (!release) { res.set('Retry-After', '5'); throw httpError(503, 'BUSY', 'Too many documents are being streamed right now. Try again shortly.'); }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), config.streamTimeoutMs);
    let source;
    const cleanup = () => { clearTimeout(timer); release(); if (source && !source.destroyed) source.destroy(); ac.abort(); };
    try {
      // Bounded time to get response headers from storage (the whole stream is bounded by the stream timeout above).
      const headerTimer = setTimeout(() => ac.abort(), config.upstreamTimeoutMs);
      try { ({ stream: source } = await storage.getObjectStream({ key: d.objectKey, start, end, signal: ac.signal })); }
      finally { clearTimeout(headerTimer); }
    } catch (e) {
      cleanup();
      if (e instanceof ObjectNotFoundError) { log.warn('Stored object missing for ready document', { docId: String(d._id) }); throw notFound(); }
      log.error('Content storage error', { docId: String(d._id), name: e?.name, detail: e?.detail });
      throw httpError(502, 'STORAGE_ERROR', 'The document could not be retrieved right now. Please try again.');
    }
    sendHeaders();
    res.on('close', cleanup); // client disconnect, timeout or normal end: stop reading from storage and free the slot
    // Once headers are sent, errors cannot become JSON; pipeline aborts the connection so the client sees a failed transfer.
    pipeline(source, res, (err) => { if (err) { log.warn('Content stream aborted', { docId: String(d._id), name: err.name }); res.destroy(); } });
  }));

  r.get('/:id', wrap(async (req, res) => {
    // Unknown, unpublished and unfinished documents are indistinguishable (404): no existence disclosure.
    const d = isObjectId(req.params.id) ? await Document.findOne({ _id: req.params.id, ...VISIBLE }).select(FIELDS).populate('subject', 'name').lean() : null;
    if (!d) throw httpError(404, 'NOT_FOUND', 'Document not found.');
    res.json(dto(d));
  }));
  return r;
}
