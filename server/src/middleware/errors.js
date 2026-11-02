import { log } from '../utils/logger.js';
export const notFound = (_req, res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  if (res.headersSent) return res.destroy(err);
  let status = err.status && err.status < 600 ? err.status : 500;
  if (err.type === 'entity.parse.failed') status = 400;
  if (err.name === 'MulterError') {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    err.code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'VALIDATION';
    err.message = err.code === 'FILE_TOO_LARGE' ? 'The file exceeds the maximum upload size.' : 'Invalid upload request.';
  }
  if (err.name === 'ValidationError' && err.errors) { status = 400; err.code = 'VALIDATION'; }
  if (status >= 500) log.error(err.code ? 'Request failed' : 'Unhandled error', { id: req.id, name: err.name, code: err.code });
  const safe = err.expose === true || status < 500;
  res.status(status).json({
    error: { code: safe ? err.code || 'BAD_REQUEST' : 'INTERNAL', message: safe ? err.message : 'Something went wrong.' },
  });
};
