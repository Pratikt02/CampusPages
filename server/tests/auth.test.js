import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { RegistrationOtp } from '../src/models/RegistrationOtp.js';
import { PasswordResetOtp } from '../src/models/PasswordResetOtp.js';
import { Session } from '../src/models/Session.js';
import { hashPassword } from '../src/services/password.js';

const ORIGIN = 'http://localhost:5173';
const PW = 'correct-horse-battery';
const config = loadConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: ORIGIN, LOGIN_MAX_PER_15MIN: '1000', REGISTRATION_OTP_SECRET: 'test-registration-otp-secret-at-least-32-chars' });
let mongod, app;
const sentOtps = new Map();

const mkUser = async (over = {}) => User.create({
  name: 'Test', email: 'student@example.edu', role: 'student', passwordHash: await hashPassword(PW), ...over });
const login = (a, email = 'student@example.edu', password = PW) =>
  a.post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });
async function signIn(email = 'student@example.edu') {
  const agent = request.agent(app);
  const res = await login(agent, email);
  return { agent, csrf: res.body.csrfToken, cookie: res.headers['set-cookie'][0].split(';')[0] };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes(); await Session.syncIndexes(); await RegistrationOtp.syncIndexes(); await PasswordResetOtp.syncIndexes();
  app = createApp(config, { sendEmail: async ({ to, code }) => { sentOtps.set(to, code); } });
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
beforeEach(async () => { await User.deleteMany({}); await Session.deleteMany({}); await RegistrationOtp.deleteMany({}); await PasswordResetOtp.deleteMany({}); sentOtps.clear(); });

describe('login', () => {
  it('succeeds, sets an HttpOnly SameSite=Lax cookie, and never returns the hash or token', async () => {
    await mkUser();
    const res = await login(request(app));
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body.user).toEqual({ id: expect.any(String), name: 'Test', email: 'student@example.edu', role: 'student' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });
  it('stores only a hash of the session token', async () => {
    await mkUser();
    const { cookie } = await signIn();
    const token = cookie.split('=')[1];
    const s = await Session.findOne({});
    expect(s.tokenHash).not.toContain(token);
    expect(await Session.countDocuments({ tokenHash: token })).toBe(0);
  });
  it('gives identical responses for wrong password, unknown email, and disabled account', async () => {
    await mkUser(); await mkUser({ email: 'off@example.edu', status: 'disabled' });
    const rs = await Promise.all([
      login(request(app), 'student@example.edu', 'wrong-password-1'),
      login(request(app), 'nobody@example.edu'),
      login(request(app), 'off@example.edu'),
    ]);
    for (const r of rs) { expect(r.status).toBe(401); expect(r.body).toEqual(rs[0].body); }
  });
  it('validates input types and presence', async () => {
    for (const body of [{}, { email: 'a@b.co' }, { email: { $ne: '' }, password: { $ne: '' } }, { email: 'a@b.co', password: 'x'.repeat(500) }]) {
      const r = await request(app).post('/api/auth/login').set('Origin', ORIGIN).send(body);
      expect(r.status).toBe(400);
    }
  });
  it('ignores a client-supplied role', async () => {
    await mkUser();
    const res = await request(app).post('/api/auth/login').set('Origin', ORIGIN)
      .send({ email: 'student@example.edu', password: PW, role: 'admin' });
    expect(res.body.user.role).toBe('student');
  });
  it('returns 400 JSON for malformed JSON bodies', async () => {
    const r = await request(app).post('/api/auth/login').set('Origin', ORIGIN).set('Content-Type', 'application/json').send('{bad');
    expect(r.status).toBe(400); expect(r.body.error).toBeDefined();
  });
  it('rate limits repeated login attempts', async () => {
    const limited = createApp(loadConfig({ NODE_ENV: 'test', CLIENT_ORIGINS: ORIGIN, LOGIN_MAX_PER_15MIN: '3' }));
    let last;
    for (let i = 0; i < 5; i++) last = await request(limited).post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'x@y.co', password: 'nope-nope-nope' });
    expect(last.status).toBe(429); expect(last.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('current user and sessions', () => {
  it('GET /me requires a session and returns no-store', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', 'cp_sid=garbage-garbage-garbage-garbage')).status).toBe(401);
    await mkUser();
    const { agent } = await signIn();
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200); expect(me.headers['cache-control']).toBe('no-store');
    expect(me.body.user.email).toBe('student@example.edu');
  });
  it('logout revokes the session server-side (replaying the old cookie fails)', async () => {
    await mkUser();
    const { agent, csrf, cookie } = await signIn();
    expect((await agent.post('/api/auth/logout').set('Origin', ORIGIN).set('X-CSRF-Token', csrf)).status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
  it('rejects revoked, idle-expired, and absolute-expired sessions', async () => {
    await mkUser();
    for (const patch of [{ revokedAt: new Date() }, { idleExpiresAt: new Date(Date.now() - 1000) }, { expiresAt: new Date(Date.now() - 1000) }]) {
      const { cookie } = await signIn();
      await Session.updateMany({}, patch);
      expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
      await Session.deleteMany({});
    }
  });
  it('blocks a live session immediately when the account is disabled or deleted', async () => {
    const u = await mkUser();
    const { cookie } = await signIn();
    await User.updateOne({ _id: u._id }, { status: 'disabled' });
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    await User.updateOne({ _id: u._id }, { status: 'active' });
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    await User.deleteOne({ _id: u._id });
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('CSRF and origin', () => {
  it('rejects state-changing requests without a valid CSRF token', async () => {
    await mkUser();
    const { agent, csrf } = await signIn();
    expect((await agent.post('/api/auth/logout').set('Origin', ORIGIN)).body.error.code).toBe('CSRF');
    expect((await agent.post('/api/auth/logout').set('Origin', ORIGIN).set('X-CSRF-Token', csrf + 'x')).status).toBe(403);
    expect((await agent.get('/api/auth/me')).status).toBe(200); // still signed in
  });
  it('rejects unsafe requests from unapproved origins', async () => {
    const r = await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'a@b.co', password: 'x' });
    expect(r.status).toBe(403); expect(r.body.error.code).toBe('BAD_ORIGIN');
  });
});

describe('role authorization', () => {
  it('guest 401, student 403, admin 200 on admin routes', async () => {
    await mkUser(); await mkUser({ email: 'admin@example.edu', role: 'admin' });
    expect((await request(app).get('/api/admin/ping')).status).toBe(401);
    expect((await (await signIn()).agent.get('/api/admin/ping')).status).toBe(403);
    expect((await (await signIn('admin@example.edu')).agent.get('/api/admin/ping')).status).toBe(200);
  });
  it('demotion takes effect on the next request without re-login', async () => {
    const a = await mkUser({ email: 'admin@example.edu', role: 'admin' });
    const { agent } = await signIn('admin@example.edu');
    expect((await agent.get('/api/admin/ping')).status).toBe(200);
    await User.updateOne({ _id: a._id }, { role: 'student' });
    expect((await agent.get('/api/admin/ping')).status).toBe(403);
  });
  it('creates accounts only after email verification and keeps admin-creation endpoints gated', async () => {
    const register = await request(app).post('/api/auth/register').set('Origin', ORIGIN).send({
      name: 'New Student', email: 'newstudent@example.edu', password: PW, confirmPassword: PW,
    });
    expect(register.status).toBe(202);
    expect(register.body.message).toMatch(/verification code/i);
    expect(sentOtps.get('newstudent@example.edu')).toMatch(/^\d{6}$/);
    expect(await User.countDocuments({})).toBe(0);

    const signup = await request(app).post('/api/auth/signup').set('Origin', ORIGIN).send({
      name: 'Another Student', email: 'anotherstudent@example.edu', password: PW, confirmPassword: PW,
    });
    expect(signup.status).toBe(202);
    expect(await User.countDocuments({})).toBe(0);

    const newStudentOtp = sentOtps.get('newstudent@example.edu');
    const invalid = await request(app).post('/api/auth/verify-registration').set('Origin', ORIGIN)
      .send({ email: 'newstudent@example.edu', code: newStudentOtp === '000000' ? '000001' : '000000' });
    expect(invalid.status).toBe(400);

    const successfulVerification = await request(app).post('/api/auth/verify-registration').set('Origin', ORIGIN)
      .send({ email: 'newstudent@example.edu', code: newStudentOtp });
    expect(successfulVerification.status).toBe(201);
    expect(successfulVerification.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(successfulVerification.body.user).toMatchObject({ name: 'New Student', email: 'newstudent@example.edu', role: 'student' });
    expect(await User.countDocuments({})).toBe(1);
    expect(await RegistrationOtp.countDocuments({})).toBe(1);

    const anotherVerification = await request(app).post('/api/auth/verify-registration').set('Origin', ORIGIN)
      .send({ email: 'anotherstudent@example.edu', code: sentOtps.get('anotherstudent@example.edu') });
    expect(anotherVerification.status).toBe(201);
    expect(anotherVerification.body.user).toMatchObject({ name: 'Another Student', email: 'anotherstudent@example.edu', role: 'student' });
    expect(await User.countDocuments({})).toBe(2);

    for (const p of ['/api/admin/users', '/api/users']) {
      const r = await request(app).post(p).set('Origin', ORIGIN).send({ email: 'x@y.co', password: 'x'.repeat(12), role: 'admin' });
      expect([401, 404]).toContain(r.status); // auth-gated routes remain protected; unknown routes stay hidden
    }
  });

  it('limits OTP guesses and removes a challenge after the final failed attempt', async () => {
    await request(app).post('/api/auth/register').set('Origin', ORIGIN).send({
      name: 'Pending Student', email: 'pending@example.edu', password: PW, confirmPassword: PW,
    });
    const sentCode = sentOtps.get('pending@example.edu');
    expect((await RegistrationOtp.findOne({ email: 'pending@example.edu' })).codeHash).not.toBe(sentCode);
    const wrongCode = sentCode === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await request(app).post('/api/auth/verify-registration').set('Origin', ORIGIN)
        .send({ email: 'pending@example.edu', code: wrongCode });
      expect(response.status).toBe(400);
    }
    expect(await RegistrationOtp.countDocuments({ email: 'pending@example.edu' })).toBe(0);
    expect(await User.countDocuments({ email: 'pending@example.edu' })).toBe(0);
    const locked = await request(app).post('/api/auth/verify-registration').set('Origin', ORIGIN)
      .send({ email: 'pending@example.edu', code: sentCode });
    expect(locked.status).toBe(400);
  });

  it('rejects expired verification codes without creating an account', async () => {
    await request(app).post('/api/auth/register').set('Origin', ORIGIN).send({
      name: 'Expired Student', email: 'expired@example.edu', password: PW, confirmPassword: PW,
    });
    await RegistrationOtp.updateOne({ email: 'expired@example.edu' }, { expiresAt: new Date(Date.now() - 1000) });
    const response = await request(app).post('/api/auth/verify-registration').set('Origin', ORIGIN)
      .send({ email: 'expired@example.edu', code: sentOtps.get('expired@example.edu') });
    expect(response.status).toBe(400);
    expect(await RegistrationOtp.countDocuments({ email: 'expired@example.edu' })).toBe(0);
    expect(await User.countDocuments({ email: 'expired@example.edu' })).toBe(0);
  });
});

describe('password reset', () => {
  it('returns the same public response for unknown and known emails and never reveals whether email exists', async () => {
    await mkUser();
    const known = await request(app).post('/api/auth/forgot-password').set('Origin', ORIGIN)
      .send({ email: 'student@example.edu' });
    const unknown = await request(app).post('/api/auth/forgot-password').set('Origin', ORIGIN)
      .send({ email: 'nobody@example.edu' });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(sentOtps.get('student@example.edu')).toMatch(/^\d{6}$/);
  });

  it('updates the password, revokes sessions, and rejects reuse', async () => {
    await mkUser();
    const { agent, cookie } = await signIn();
    await agent.post('/api/auth/forgot-password').set('Origin', ORIGIN).send({ email: 'student@example.edu' });
    const code = sentOtps.get('student@example.edu');
    const newPassword = 'new-correct-horse';

    const reset = await request(app).post('/api/auth/reset-password').set('Origin', ORIGIN)
      .send({ email: 'student@example.edu', code, password: newPassword, confirmPassword: newPassword });
    expect(reset.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await login(request(app), 'student@example.edu', PW)).status).toBe(401);
    expect((await login(request(app), 'student@example.edu', newPassword)).status).toBe(200);

    const reuse = await request(app).post('/api/auth/reset-password').set('Origin', ORIGIN)
      .send({ email: 'student@example.edu', code, password: 'another-password', confirmPassword: 'another-password' });
    expect(reuse.status).toBe(400);
  });

  it('limits reset code guesses', async () => {
    await mkUser();
    await request(app).post('/api/auth/forgot-password').set('Origin', ORIGIN).send({ email: 'student@example.edu' });
    const sentCode = sentOtps.get('student@example.edu');
    const wrongCode = sentCode === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await request(app).post('/api/auth/reset-password').set('Origin', ORIGIN)
        .send({ email: 'student@example.edu', code: wrongCode, password: 'new-password-1', confirmPassword: 'new-password-1' })).status).toBe(400);
    }
    expect(await PasswordResetOtp.countDocuments({ email: 'student@example.edu' })).toBe(0);
  });
});
