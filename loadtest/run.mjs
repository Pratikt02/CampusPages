// Progressive load test. Examples:
//   node loadtest/run.mjs --base http://localhost:4000 --scenario catalogue --levels 50,250,500,1000 --duration 10
//   node loadtest/run.mjs --base https://your-app --scenario content --doc <documentId> --docsize 4000000
// Scenarios: public (no login), catalogue (authenticated list), content (authenticated 128 KB range requests, like PDF.js).
// Optional sampling of the server process (Linux): --pid <node pid>   and database operations: MONGODB_URI=...
// Terms: a "virtual user" here is one open HTTP connection issuing requests back-to-back (no think time), so it is a HARSHER load
// than a real student; see docs/LOADTEST.md for how that maps to students, sessions and simultaneous streams.
import fs from 'node:fs';
import os from 'node:os';
import autocannon from 'autocannon';
import mongoose from 'mongoose';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4000'); const scenario = arg('scenario', 'catalogue');
const levels = arg('levels', '50,250,500,1000').split(',').map(Number); const duration = Number(arg('duration', 10));
const doc = arg('doc'); const docSize = Number(arg('docsize', 0)); const pid = arg('pid'); const CHUNK = 131072;
const { cookies: allCookies } = fs.existsSync(new URL('./cookies.json', import.meta.url)) ? JSON.parse(fs.readFileSync(new URL('./cookies.json', import.meta.url), 'utf8')) : { cookies: [] };
const cookies = allCookies.slice(0, Number(arg('users', allCookies.length))); // --users 1 = hammer with a single account (to exercise per-user limits)
if (scenario !== 'public' && !cookies.length) { console.error('No loadtest/cookies.json: run loadtest/seed.mjs first.'); process.exit(1); }
if (scenario === 'content' && (!doc || !docSize)) { console.error('--doc and --docsize are required for the content scenario.'); process.exit(1); }

const cpuTicks = () => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return Number(s[11]) + Number(s[12]); } catch { return null; } };
const rssMb = () => { try { return Number(fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024; } catch { return null; } };
const opcounters = async () => { if (!process.env.MONGODB_URI) return null; const s = await mongoose.connection.db.admin().serverStatus(); return Object.values(s.opcounters).reduce((a, b) => a + b, 0) - 0; };

let rr = 0;
const requests = () => {
  if (scenario === 'public') return [{ method: 'GET', path: '/api/public/subjects' }];
  const cookieFor = (ctx) => (ctx.cookie ??= cookies[rr++ % cookies.length]);
  if (scenario === 'catalogue') return [{ method: 'GET', path: '/api/documents?limit=12', setupRequest: (req, ctx) => { req.headers = { ...req.headers, cookie: cookieFor(ctx) }; return req; } }];
  return [{ method: 'GET', path: `/api/documents/${doc}/content`, setupRequest: (req, ctx) => {
    const start = Math.floor(Math.random() * Math.max(docSize - CHUNK, 1)); req.headers = { ...req.headers, cookie: cookieFor(ctx), range: `bytes=${start}-${Math.min(start + CHUNK - 1, docSize - 1)}` }; return req; } }];
};

if (process.env.MONGODB_URI) await mongoose.connect(process.env.MONGODB_URI);
const rows = []; const hz = 100; // Linux clock ticks per second
for (const connections of levels) {
  const t0 = cpuTicks(); const ops0 = await opcounters(); const peak = { rss: rssMb() ?? 0 };
  const sampler = pid ? setInterval(() => { peak.rss = Math.max(peak.rss, rssMb() ?? 0); }, 500) : null;
  const r = await autocannon({ url: base, connections, duration, requests: requests(), timeout: 30 });
  if (sampler) clearInterval(sampler);
  const t1 = cpuTicks(); const ops1 = await opcounters();
  const total = r.requests.total; const codes = Object.fromEntries(Object.entries({ '2xx': r['2xx'], '3xx': r['3xx'], '4xx': r['4xx'], '5xx': r['5xx'] }).filter(([, v]) => v));
  rows.push({ scenario, connections, durationS: duration, reqPerSec: Math.round(r.requests.average), p50ms: r.latency.p50, p97_5ms: r.latency.p97_5, p99ms: r.latency.p99, maxMs: r.latency.max,
    mbPerSec: +(r.throughput.average / 1e6).toFixed(1), statusCounts: codes, errors: r.errors, timeouts: r.timeouts,
    serverCpuPct: t0 != null && t1 != null ? +(((t1 - t0) / hz / duration) * 100).toFixed(0) : null, serverPeakRssMb: pid ? Math.round(peak.rss) : null,
    dbOpsPerRequest: ops0 != null && ops1 != null && total ? +((ops1 - ops0) / total).toFixed(2) : null, dbOpsPerSec: ops0 != null ? Math.round((ops1 - ops0) / duration) : null });
  console.log(`${scenario.padEnd(10)} c=${String(connections).padEnd(5)} ${String(rows.at(-1).reqPerSec).padStart(6)} req/s  p50=${r.latency.p50}ms p97.5=${r.latency.p97_5}ms p99=${r.latency.p99}ms  ${JSON.stringify(codes)} err=${r.errors} to=${r.timeouts} cpu=${rows.at(-1).serverCpuPct}% rss=${rows.at(-1).serverPeakRssMb}MB dbOps/req=${rows.at(-1).dbOpsPerRequest}`);
}
fs.mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL(`./results/${scenario}-${Date.now()}.json`, import.meta.url), JSON.stringify({ when: new Date().toISOString(), node: process.version, machine: { cpus: os.cpus().length, model: os.cpus()[0]?.model, totalMemGb: +(os.totalmem() / 1e9).toFixed(1) }, base, rows }, null, 2));
if (process.env.MONGODB_URI) await mongoose.disconnect();
