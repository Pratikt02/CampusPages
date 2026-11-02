import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Document } from '../models/Document.js';
import { Subject } from '../models/Subject.js';
import { cached } from '../cache/index.js';
import { httpError } from '../middleware/auth.js';
import { isObjectId } from '../documents/validation.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const VISIBLE = { publicationStatus: 'published', processingStatus: 'ready' };

// PUBLIC, unauthenticated metadata. Deliberately limited to subject name/description and a published-material count.
// Never includes document titles, ids, file details, or storage keys. Subjects with no published material are omitted.
const dto = (s, n) => ({ id: String(s._id), name: s.name, slug: s.slug, description: s.description, materialCount: n });

export const loadPublicSubjects = () => cached('docs:public-subjects', async () => {
  const rows = await Document.aggregate([{ $match: VISIBLE }, { $group: { _id: '$subject', n: { $sum: 1 } } }]);
  const counts = new Map(rows.map((r) => [String(r._id), r.n]));
  const subjects = await Subject.find({ _id: { $in: rows.map((r) => r._id) } }).sort({ order: 1, name: 1 }).lean();
  return subjects.map((s) => dto(s, counts.get(String(s._id))));
}, 60);

export function publicRouter(config) {
  const r = Router();
  r.use(rateLimit({ windowMs: 60_000, limit: config.publicMaxPerMinute, standardHeaders: true, legacyHeaders: false,
    handler: (_q, _s, next) => next(httpError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.')) }));
  r.use((_req, res, next) => { res.set('Cache-Control', 'public, max-age=30'); next(); });

  r.get('/subjects', wrap(async (_req, res) => res.json({ items: await loadPublicSubjects() })));
  r.get('/subjects/:id', wrap(async (req, res) => {
    const found = isObjectId(req.params.id) ? (await loadPublicSubjects()).find((s) => s.id === req.params.id) : null;
    if (!found) throw httpError(404, 'NOT_FOUND', 'Subject not found.');
    res.json(found);
  }));
  return r;
}
