import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { User } from '../models/User.js';
import { RegistrationOtp } from '../models/RegistrationOtp.js';
import { PasswordResetOtp } from '../models/PasswordResetOtp.js';
import { audit } from '../models/AuditEvent.js';
import { hashPassword, verifyPassword, dummyVerify, validatePasswordPolicy } from '../services/password.js';
import { sendRegistrationOtp, sendPasswordResetOtp } from '../services/email.js';
import { createSession, revokeSession, revokeAllForUser, enforceSessionCap } from '../services/sessions.js';
import { cookieOptions, requireAuth, httpError } from '../middleware/auth.js';

const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

export function authRouter(config, { sendEmail } = {}) {
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
  const otpIpLimiter = rateLimit({
    windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
    handler: (_req, _res, next) => next(httpError(429, 'RATE_LIMITED', 'Too many verification requests. Try again later.')),
  });
  const otpAccountLimiter = rateLimit({
    windowMs: 15 * 60_000, limit: 3, standardHeaders: false, legacyHeaders: false, validate: false,
    keyGenerator: (req) => `otp:${String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254)}`,
    handler: (_req, _res, next) => next(httpError(429, 'RATE_LIMITED', 'Too many verification requests for this email. Try again later.')),
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

  const startRegistration = async (req, res, next) => {
    try {
      const { name, email, password, confirmPassword } = req.body ?? {};
      if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !name || !email || !password) {
        throw httpError(400, 'VALIDATION', 'All fields are required.');
      }
      if (name.length < 1 || name.length > 100) throw httpError(400, 'VALIDATION', 'Name must be 1-100 characters.');
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'VALIDATION', 'Invalid email address.');
      if (password !== confirmPassword) throw httpError(400, 'VALIDATION', 'Passwords do not match.');
      if (!validatePasswordPolicy(password)) throw httpError(400, 'VALIDATION', 'Password must be 10-128 characters.');

      if (!config.registrationOtpSecret || config.registrationOtpSecret.length < 32) {
        throw httpError(503, 'EMAIL_VERIFICATION_UNAVAILABLE', 'Email verification is not configured. Please try again later.');
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) throw httpError(409, 'CONFLICT', 'An account with this email already exists.');

      const passwordHash = await hashPassword(password);
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const challenge = await RegistrationOtp.findOneAndUpdate(
        { email: normalizedEmail },
        { name: name.trim(), passwordHash, codeHash: createHmac('sha256', config.registrationOtpSecret).update(code).digest('hex'),
          attempts: 0, expiresAt: new Date(Date.now() + 10 * 60_000) },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      try {
        if (sendEmail) await sendEmail({ to: normalizedEmail, code });
        else await sendRegistrationOtp(config, normalizedEmail, code);
      } catch {
        await RegistrationOtp.deleteOne({ _id: challenge._id });
        throw httpError(503, 'EMAIL_DELIVERY_FAILED', 'Could not send the verification email. Please try again later.');
      }
      res.status(202).json({ message: 'A verification code has been sent to your email address.' });
    } catch (e) { next(e); }
  };
  r.post('/register', limiter, otpIpLimiter, otpAccountLimiter, startRegistration);
  r.post('/signup', limiter, otpIpLimiter, otpAccountLimiter, startRegistration);

  r.post('/verify-registration', limiter, async (req, res, next) => {
    try {
      const { email, code } = req.body ?? {};
      if (typeof email !== 'string' || typeof code !== 'string' || !email || !/^\d{6}$/.test(code)
        || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw httpError(400, 'VALIDATION', 'Enter a valid email address and 6-digit verification code.');
      }
      const normalizedEmail = email.trim().toLowerCase();
      const challenge = await RegistrationOtp.findOne({ email: normalizedEmail });
      if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
        if (challenge) await RegistrationOtp.deleteOne({ _id: challenge._id });
        throw httpError(400, 'INVALID_CODE', 'The verification code is invalid or expired. Request a new code.');
      }
      const expected = Buffer.from(challenge.codeHash, 'hex');
      const received = Buffer.from(createHmac('sha256', config.registrationOtpSecret).update(code).digest('hex'), 'hex');
      if (!timingSafeEqual(expected, received)) {
        const updated = await RegistrationOtp.findOneAndUpdate({ _id: challenge._id }, { $inc: { attempts: 1 } }, { new: true });
        if (updated?.attempts >= 5) await RegistrationOtp.deleteOne({ _id: challenge._id });
        throw httpError(400, 'INVALID_CODE', 'The verification code is invalid or expired. Request a new code.');
      }
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) {
        await RegistrationOtp.deleteOne({ _id: challenge._id });
        throw httpError(409, 'CONFLICT', 'An account with this email already exists.');
      }
      const user = await User.create({ name: challenge.name, email: normalizedEmail, passwordHash: challenge.passwordHash, role: 'student' });
      await RegistrationOtp.deleteOne({ _id: challenge._id });

      const { token, csrfToken } = await createSession(user._id, config);
      res.cookie(config.cookieName, token, cookieOptions(config, config.sessionAbsoluteHours * 3_600_000));
      await audit('register', user._id);
      res.status(201).json({ user: publicUser(user), csrfToken });
    } catch (e) { next(e); }
  });

  r.post('/forgot-password', limiter, otpIpLimiter, otpAccountLimiter, async (req, res, next) => {
    try {
      const { email } = req.body ?? {};
      if (typeof email !== 'string' || !email || email.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw httpError(400, 'VALIDATION', 'Enter a valid email address.');
      }
      if (!config.registrationOtpSecret || config.registrationOtpSecret.length < 32) {
        throw httpError(503, 'EMAIL_RESET_UNAVAILABLE', 'Password reset is not configured. Please try again later.');
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = await User.findOne({ email: normalizedEmail });
      if (user && user.status === 'active') {
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        await PasswordResetOtp.findOneAndUpdate(
          { email: normalizedEmail },
          { codeHash: createHmac('sha256', config.registrationOtpSecret).update(code).digest('hex'),
            attempts: 0, expiresAt: new Date(Date.now() + 10 * 60_000) },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
        );
        try {
          if (sendEmail) await sendEmail({ to: normalizedEmail, code, type: 'password-reset' });
          else await sendPasswordResetOtp(config, normalizedEmail, code);
        } catch {
          await PasswordResetOtp.deleteOne({ email: normalizedEmail });
        }
        await audit('password_reset_requested', user._id);
      }
      res.status(202).json({ message: 'If an active account exists for this email, a password reset code has been sent.' });
    } catch (e) { next(e); }
  });

  r.post('/reset-password', limiter, async (req, res, next) => {
    try {
      const { email, code, password, confirmPassword } = req.body ?? {};
      if (typeof email !== 'string' || typeof code !== 'string' || typeof password !== 'string'
        || typeof confirmPassword !== 'string' || email.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
        throw httpError(400, 'VALIDATION', 'Enter a valid email, 6-digit code, and new password.');
      }
      if (password !== confirmPassword) throw httpError(400, 'VALIDATION', 'Passwords do not match.');
      if (!validatePasswordPolicy(password)) throw httpError(400, 'VALIDATION', 'Password must be 10-128 characters.');

      const normalizedEmail = email.trim().toLowerCase();
      const challenge = await PasswordResetOtp.findOne({ email: normalizedEmail });
      if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
        if (challenge) await PasswordResetOtp.deleteOne({ _id: challenge._id });
        throw httpError(400, 'INVALID_RESET_CODE', 'The reset code is invalid or expired. Request a new code.');
      }
      const expected = Buffer.from(challenge.codeHash, 'hex');
      const received = Buffer.from(createHmac('sha256', config.registrationOtpSecret).update(code).digest('hex'), 'hex');
      if (!timingSafeEqual(expected, received)) {
        const updated = await PasswordResetOtp.findOneAndUpdate({ _id: challenge._id }, { $inc: { attempts: 1 } }, { new: true });
        if (updated?.attempts >= 5) await PasswordResetOtp.deleteOne({ _id: challenge._id });
        throw httpError(400, 'INVALID_RESET_CODE', 'The reset code is invalid or expired. Request a new code.');
      }

      const user = await User.findOne({ email: normalizedEmail });
      if (!user || user.status !== 'active') {
        await PasswordResetOtp.deleteOne({ _id: challenge._id });
        throw httpError(400, 'INVALID_RESET_CODE', 'The reset code is invalid or expired. Request a new code.');
      }
      user.passwordHash = await hashPassword(password);
      await user.save();
      await revokeAllForUser(user._id);
      await PasswordResetOtp.deleteOne({ _id: challenge._id });
      await audit('password_reset', user._id);
      res.json({ message: 'Password updated. Sign in with your new password.' });
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
