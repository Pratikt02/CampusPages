import { resolveSession } from '../services/sessions.js';
import { audit } from '../models/AuditEvent.js';

// expose: this error was raised deliberately with a client-safe code/message (unlike unexpected exceptions).
const httpError = (status, code, message) => Object.assign(new Error(message), { status, code, expose: true });
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const cookieOptions = (config, maxAgeMs) => ({
  httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/', ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
});

// Defense in depth: reject unsafe requests whose Origin isn't an approved frontend origin.
export const originCheck = (config) => (req, _res, next) => {
  if (!UNSAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !config.clientOrigins.includes(origin)) { audit('bad_origin', null, String(origin).slice(0, 100)); return next(httpError(403, 'BAD_ORIGIN', 'Origin not allowed.')); }
  next();
};

export const requireAuth = (config) => async (req, _res, next) => {
  try {
    const found = await resolveSession(req.cookies?.[config.cookieName], config);
    if (!found) return next(httpError(401, 'UNAUTHENTICATED', 'Please sign in.'));
    req.auth = { session: found.session, user: found.user };
    if (UNSAFE.has(req.method)) {
      const sent = req.get('x-csrf-token');
      if (!sent || sent !== found.session.csrfToken) { audit('csrf_failed', found.user._id, req.originalUrl.split('?')[0].replace(/[a-f0-9]{24}/gi, ':id')); return next(httpError(403, 'CSRF', 'Invalid CSRF token.')); }
    }
    next();
  } catch (e) { next(e); }
};

// Role comes from the DB-loaded user, never from the client.
export const requireRole = (...roles) => (req, _res, next) => {
  if (roles.includes(req.auth?.user?.role)) return next();
  audit('role_denied', req.auth?.user?._id ?? null, req.originalUrl.split('?')[0].replace(/[a-f0-9]{24}/gi, ':id'));
  return next(httpError(403, 'FORBIDDEN', 'You do not have access to this resource.'));
};
export { httpError };
