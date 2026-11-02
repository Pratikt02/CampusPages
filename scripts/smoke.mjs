// Production smoke test. No dependencies. Usage:
//   node scripts/smoke.mjs https://your-app.example.com
// Optional login checks (credentials are read from the environment, never from arguments):
//   SMOKE_EMAIL=student@school.edu SMOKE_PASSWORD=... node scripts/smoke.mjs https://your-app.example.com
// Exit code 1 if any check fails. It only reads data, except that the optional login check creates and then revokes one session.
const MISSING = '000000000000000000000000';

export async function runSmoke(base, { email, password, fetchImpl = fetch } = {}) {
  const url = new URL(base); const origin = url.origin; const https = url.protocol === 'https:';
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail) });
  const get = (p, init = {}) => fetchImpl(origin + p, { redirect: 'manual', ...init });
  const json = async (r) => { try { return await r.json(); } catch { return null; } };
  const guard = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, e.message); } };

  await guard('health', async () => {
    const r = await get('/api/health'); const b = await json(r);
    check('health: 200 and database connected', r.status === 200 && b?.status === 'ok' && b?.db === 'connected', `${r.status} ${JSON.stringify(b)}`);
    check('health: exposes nothing but status and db', b && Object.keys(b).sort().join() === 'db,status', JSON.stringify(b));
  });
  await guard('frontend', async () => {
    const r = await get('/'); const html = await r.text();
    check('frontend: / returns the app', r.status === 200 && /text\/html/.test(r.headers.get('content-type') ?? '') && html.includes('CampusPages'), r.status);
    check('frontend: Content-Security-Policy is present and forbids inline script', /script-src 'self'/.test(r.headers.get('content-security-policy') ?? '') && !/script-src[^;]*unsafe-inline/.test(r.headers.get('content-security-policy') ?? ''));
    check('frontend: nosniff and frame protections', r.headers.get('x-content-type-options') === 'nosniff' && /frame-ancestors 'none'/.test(r.headers.get('content-security-policy') ?? ''));
    if (https) check('frontend: HSTS over https', /max-age=\d+/.test(r.headers.get('strict-transport-security') ?? ''));
    else check('frontend: served over https (required in production)', ['localhost', '127.0.0.1'].includes(url.hostname), 'plain http on a non-local host');
    const spa = await get('/app'); check('frontend: client-side routes fall back to the app', spa.status === 200 && /text\/html/.test(spa.headers.get('content-type') ?? ''), spa.status);
  });
  await guard('public', async () => {
    const r = await get('/api/public/subjects'); const b = await json(r);
    check('public: subjects endpoint works without login', r.status === 200 && Array.isArray(b?.items), r.status);
    check('public: no document titles, ids or storage keys', !/objectKey|campuspages\/documents|mimeType/.test(JSON.stringify(b)));
  });
  await guard('protection', async () => {
    for (const p of ['/api/auth/me', '/api/documents', `/api/documents/${MISSING}`, `/api/documents/${MISSING}/content`, '/api/admin/stats', '/api/admin/documents']) {
      const r = await get(p); check(`protected without login: ${p} -> 401`, r.status === 401, r.status);
    }
    const u = await get('/api/definitely-not-a-route'); const b = await json(u);
    check('unknown API route returns JSON 404', u.status === 404 && b?.error?.code === 'NOT_FOUND', u.status);
    const c = await get('/api/health', { headers: { Origin: 'https://evil.example' } });
    check('CORS: an unapproved origin is not reflected', !c.headers.get('access-control-allow-origin'));
    const o = await get('/api/auth/login', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"email":"a@b.co","password":"x"}' });
    check('CSRF: login from an unapproved origin is rejected (403)', o.status === 403, o.status);
  });
  if (email && password) await guard('login', async () => {
    const l = await get('/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const lb = await json(l); const setCookie = l.headers.get('set-cookie') ?? '';
    check('login: succeeds', l.status === 200 && lb?.csrfToken, l.status);
    if (https) check('login: cookie is __Host-, Secure, HttpOnly, SameSite=Lax', /^__Host-cp_sid=/.test(setCookie) && /Secure/i.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie), setCookie.replace(/=[^;]+/, '=[redacted]'));
    if (l.status !== 200) return;
    const cookie = setCookie.split(';')[0];
    const me = await get('/api/auth/me', { headers: { Cookie: cookie } }); check('login: /me works with the session', me.status === 200, me.status);
    const cat = await get('/api/documents', { headers: { Cookie: cookie } }); check('login: catalogue loads', cat.status === 200, cat.status);
    check('login: catalogue is private/no-store', /no-store/.test(cat.headers.get('cache-control') ?? ''));
    const out = await get('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': lb.csrfToken } }); check('login: logout succeeds', out.status === 204, out.status);
    const after = await get('/api/auth/me', { headers: { Cookie: cookie } }); check('login: the session is dead after logout', after.status === 401, after.status);
  });
  return results;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('smoke.mjs')) {
  const base = process.argv[2];
  if (!base) { console.error('Usage: node scripts/smoke.mjs https://your-app.example.com'); process.exit(2); }
  const results = await runSmoke(base, { email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD });
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  [${r.detail}]`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed${process.env.SMOKE_EMAIL ? '' : ' (login checks skipped: set SMOKE_EMAIL and SMOKE_PASSWORD)'}`);
  process.exit(failed ? 1 : 0);
}
