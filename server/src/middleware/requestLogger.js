import crypto from 'node:crypto';
import { log } from '../utils/logger.js';

const OBJECT_ID = /[a-f0-9]{24}/gi;
// Assigns a request id (returned as X-Request-Id) and logs one line per request. Never logs query strings, headers,
// cookies, bodies, or raw ids; paths are normalised (ObjectIds -> :id) to keep logs low-cardinality and free of identifiers.
export const requestLogger = (config) => (req, res, next) => {
  req.id = crypto.randomUUID().slice(0, 8);
  res.set('X-Request-Id', req.id);
  if (!config.logRequests) return next();
  const start = process.hrtime.bigint();
  res.on('close', () => {
    const path = req.originalUrl.split('?')[0].replace(OBJECT_ID, ':id');
    if (path === '/api/health') return;
    log.info('request', { id: req.id, method: req.method, path, status: res.statusCode,
      ms: Number((process.hrtime.bigint() - start) / 1_000_000n), uid: req.auth?.user ? String(req.auth.user._id) : undefined,
      aborted: res.writableFinished ? undefined : true });
  });
  next();
};
