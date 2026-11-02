import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { User } from '../models/User.js';
import { audit } from '../models/AuditEvent.js';
import { hashPassword, verifyPassword, dummyVerify, validatePasswordPolicy } from '../services/password.js';
import { createSession, revokeSession, revokeAllForUser, enforceSessionCap } from '../services/sessions.js';
import { cookieOptions, requireAuth, httpError } from '../middleware/auth.js';

const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

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

  r.post('/register', limiter, async (req, res, next) => {
    try {
      const { name, email, password, confirmPassword } = req.body ?? {};
      if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !name || !email || !password) {
        throw httpError(400, 'VALIDATION', 'All fields are required.');
      }
      if (name.length < 1 || name.length > 100) throw httpError(400, 'VALIDATION', 'Name must be 1-100 characters.');
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'VALIDATION', 'Invalid email address.');
      if (password !== confirmPassword) throw httpError(400, 'VALIDATION', 'Passwords do not match.');
      if (!validatePasswordPolicy(password)) throw httpError(400, 'VALIDATION', 'Password must be 10-128 characters.');

      const existing = await User.findOne({ email: email.trim().toLowerCase() });
      if (existing) throw httpError(409, 'CONFLICT', 'An account with this email already exists.');

      const passwordHash = await hashPassword(password);
      const user = await User.create({ name: name.trim(), email: email.trim().toLowerCase(), passwordHash, role: 'student' });

      const { token, csrfToken } = await createSession(user._id, config);
      res.cookie(config.cookieName, token, cookieOptions(config, config.sessionAbsoluteHours * 3_600_000));
      await audit('register', user._id);
      res.status(201).json({ user: publicUser(user), csrfToken });
    } catch (e) { next(e); }
  });

  r.post('/signup', limiter, async (req, res, next) => {
    try {
      const { name, email, password, confirmPassword } = req.body ?? {};
      if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !name || !email || !password) {
        throw httpError(400, 'VALIDATION', 'All fields are required.');
      }
      if (name.length < 1 || name.length > 100) throw httpError(400, 'VALIDATION', 'Name must be 1-100 characters.');
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'VALIDATION', 'Invalid email address.');
      if (password !== confirmPassword) throw httpError(400, 'VALIDATION', 'Passwords do not match.');
      if (!validatePasswordPolicy(password)) throw httpError(400, 'VALIDATION', 'Password must be 10-128 characters.');

      const existing = await User.findOne({ email: email.trim().toLowerCase() });
      if (existing) throw httpError(409, 'CONFLICT', 'An account with this email already exists.');

      const passwordHash = await hashPassword(password);
      const user = await User.create({ name: name.trim(), email: email.trim().toLowerCase(), passwordHash, role: 'student' });

      const { token, csrfToken } = await createSession(user._id, config);
      res.cookie(config.cookieName, token, cookieOptions(config, config.sessionAbsoluteHours * 3_600_000));
      await audit('register', user._id);
      res.status(201).json({ user: publicUser(user), csrfToken });
    } catch (e) { next(e); }
  });

  r.get('/me', auth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: publicUser(req.auth.user), csrfToken: req.auth.session.csrfToken });
  });

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
