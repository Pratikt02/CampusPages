import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ENGINEERING_BRANCHES, PREFERRED_LANGUAGES, User } from '../models/User.js';
import { audit } from '../models/AuditEvent.js';
import { Session } from '../models/Session.js';
import { Document } from '../models/Document.js';
import { hashPassword, verifyPassword, dummyVerify, validatePasswordPolicy } from '../services/password.js';
import { createSession, revokeSession, revokeAllForUser, enforceSessionCap } from '../services/sessions.js';
import { cookieOptions, requireAuth, httpError } from '../middleware/auth.js';
import { isObjectId } from '../documents/validation.js';
import { VISIBLE } from './public.js';

const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  studentId: u.studentId ?? null,
  course: u.course ?? '',
  semester: u.semester ?? null,
  branch: u.branch ?? null,
  preferredLanguage: u.preferredLanguage ?? 'en',
});

export function authRouter(config) {
  const r = Router();
  const auth = requireAuth(config);
  const limiter = rateLimit({
    windowMs: 15 * 60_000, limit: config.loginMaxPerWindow, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
    handler: (_req, _res, next) => next(httpError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.')),
  });

  const accountLimiter = rateLimit({
    windowMs: 15 * 60_000, limit: config.loginMaxPerAccount, standardHeaders: false, legacyHeaders: false, skipSuccessfulRequests: true, validate: false,
    keyGenerator: (req) => `acct:${String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254)}`,
    handler: (_req, _res, next) => next(httpError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.')),
  });
  r.post('/login', limiter, accountLimiter, async (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password
        || email.length > 254 || password.length > 128) throw httpError(400, 'VALIDATION', 'Email and password are required.');
      const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
      const ok = user ? await verifyPassword(user.passwordHash, password) : (await dummyVerify(password), false);
      if (!ok || user.status !== 'active') {
        await audit('login_failed', user?._id ?? null, user && ok ? 'account_disabled' : '');
        throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      }
      const { token, csrfToken } = await createSession(user._id, config);
      await enforceSessionCap(user._id, config.maxSessionsPerUser);
      res.cookie(config.cookieName, token, cookieOptions(config, config.sessionAbsoluteHours * 3_600_000));
      await audit('login_ok', user._id);
      res.json({ user: publicUser(user), csrfToken });
    } catch (e) { next(e); }
  });

  const register = async (req, res, next) => {
    try {
      const { name, email, password, confirmPassword } = req.body ?? {};
      if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !name || !email || !password) {
        throw httpError(400, 'VALIDATION', 'All fields are required.');
      }
      if (name.length < 1 || name.length > 100) throw httpError(400, 'VALIDATION', 'Name must be 1-100 characters.');
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'VALIDATION', 'Invalid email address.');
      if (password !== confirmPassword) throw httpError(400, 'VALIDATION', 'Passwords do not match.');
      if (!validatePasswordPolicy(password)) throw httpError(400, 'VALIDATION', 'Password must be 10-128 characters.');

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) throw httpError(409, 'CONFLICT', 'An account with this email already exists.');

      const passwordHash = await hashPassword(password);
      const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash, role: 'student' });
      const { token, csrfToken } = await createSession(user._id, config);
      res.cookie(config.cookieName, token, cookieOptions(config, config.sessionAbsoluteHours * 3_600_000));
      await audit('register', user._id);
      res.status(201).json({ user: publicUser(user), csrfToken });
    } catch (e) { next(e); }
  };
  r.post('/register', limiter, register);
  r.post('/signup', limiter, register);

  r.get('/me', auth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: publicUser(req.auth.user), csrfToken: req.auth.session.csrfToken });
  });

  r.post('/reading', auth, async (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).length !== 2 || typeof req.body.documentId !== 'string'
        || !isObjectId(req.body.documentId) || typeof req.body.readingToken !== 'string'
        || !/^[a-f0-9-]{36}$/i.test(req.body.readingToken)) {
        throw httpError(400, 'VALIDATION', 'A valid document ID and reading token are required.');
      }
      const document = await Document.exists({ _id: req.body.documentId, ...VISIBLE });
      if (!document) throw httpError(404, 'NOT_FOUND', 'Document not found.');
      const session = await Session.findById(req.auth.session._id);
      if (!session) throw httpError(401, 'UNAUTHENTICATED', 'Please sign in.');
      const now = new Date();
      if (String(session.readingDocument) !== req.body.documentId || session.readingToken !== req.body.readingToken) session.readingStartedAt = now;
      session.readingDocument = req.body.documentId;
      session.readingToken = req.body.readingToken;
      session.readingUpdatedAt = now;
      await session.save();
      res.status(204).end();
    } catch (e) { next(e); }
  });

  r.delete('/reading/:documentId/:readingToken', auth, async (req, res, next) => {
    try {
      if (!isObjectId(req.params.documentId)) throw httpError(400, 'VALIDATION', 'Invalid document ID.');
      if (!/^[a-f0-9-]{36}$/i.test(req.params.readingToken)) throw httpError(400, 'VALIDATION', 'Invalid reading token.');
      await Session.updateOne(
        { _id: req.auth.session._id, readingDocument: req.params.documentId, readingToken: req.params.readingToken },
        { $set: { readingDocument: null, readingToken: null, readingStartedAt: null, readingUpdatedAt: null } },
      );
      res.status(204).end();
    } catch (e) { next(e); }
  });

  r.patch('/profile', auth, async (req, res, next) => {
    try {
      const { name, studentId, course, semester, branch, preferredLanguage } = req.body ?? {};
      if (req.body && typeof req.body !== 'object') throw httpError(400, 'VALIDATION', 'Invalid profile data.');
      if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
        throw httpError(400, 'VALIDATION', 'Name must be 1-100 characters.');
      }
      if (studentId !== null && typeof studentId !== 'string') throw httpError(400, 'VALIDATION', 'Invalid student ID.');
      if (typeof course !== 'string' || course.trim().length > 120) throw httpError(400, 'VALIDATION', 'Course must be 120 characters or fewer.');
      if (semester !== null && (!Number.isInteger(semester) || semester < 1 || semester > 12)) {
        throw httpError(400, 'VALIDATION', 'Semester must be between 1 and 12.');
      }
      if (branch !== null && !ENGINEERING_BRANCHES.includes(branch)) throw httpError(400, 'VALIDATION', 'Invalid branch.');
      if (!PREFERRED_LANGUAGES.includes(preferredLanguage)) throw httpError(400, 'VALIDATION', 'Invalid preferred language.');

      const normalizedStudentId = typeof studentId === 'string' && studentId.trim() ? studentId.trim() : null;
      if (normalizedStudentId && normalizedStudentId.length > 40) throw httpError(400, 'VALIDATION', 'Student ID must be 40 characters or fewer.');
      const updates = {
        name: name.trim(),
        studentId: normalizedStudentId,
        course: course.trim(),
        semester: semester ?? null,
        branch: branch ?? null,
        preferredLanguage,
      };
      try {
        const user = await User.findByIdAndUpdate(req.auth.user._id, updates, { new: true, runValidators: true });
        await audit('profile_updated', user._id);
        res.json({ user: publicUser(user), csrfToken: req.auth.session.csrfToken });
      } catch (e) {
        if (e?.code === 11000) throw httpError(409, 'CONFLICT', 'That student ID is already in use.');
        throw e;
      }
    } catch (e) { next(e); }
  });

  r.get('/activity', auth, (_req, res) => res.status(204).end());

  r.post('/logout', auth, async (req, res, next) => {
    try {
      await revokeSession(req.auth.session._id);
      res.clearCookie(config.cookieName, cookieOptions(config));
      await audit('logout', req.auth.user._id);
      res.status(204).end();
    } catch (e) { next(e); }
  });

  r.post('/logout-all', auth, async (req, res, next) => {
    try {
      await revokeAllForUser(req.auth.user._id);
      res.clearCookie(config.cookieName, cookieOptions(config));
      await audit('logout_all', req.auth.user._id);
      res.status(204).end();
    } catch (e) { next(e); }
  });
  return r;
}
