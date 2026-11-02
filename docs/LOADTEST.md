# Load testing and performance

**There is no verified claim here that CampusPages supports 500, 1,000 or 2,000 concurrent students.** What follows is (1) a reproducible procedure you can run against your own deployment, (2) measurements taken in a small sandbox, with exactly what they do and do not show, and (3) the bottlenecks they exposed and what was changed.

## Terms (they are not interchangeable)
- **Virtual user (VU) / connection:** one open HTTP connection firing requests back-to-back with no pause. A VU is much *harsher* than a student, who reads for minutes between requests.
- **Authenticated session:** a logged-in browser. 2,000 students means up to 2,000 sessions, but at any instant only a few dozen are *requesting*.
- **Simultaneous requests:** requests in flight right now (bounded by the number of VUs).
- **Active connections:** open sockets, including idle keep-alives.
- **Simultaneous document streams:** content responses currently being sent. The server caps these (`MAX_STREAMS_PER_USER`=12, `MAX_STREAMS_GLOBAL`=200 by default per process); extra requests get `503` + `Retry-After`.
Opening one PDF makes roughly 10-30 range requests (128 KB each) and then idles while the student reads.

## Procedure (works on Windows, macOS, Linux)
Use a **test deployment and a test database**, never production data.
```powershell
$env:MONGODB_URI = "<test database URI>"
node loadtest/seed.mjs --users 100         # throw-away users WITH sessions; writes loadtest/cookies.json (git-ignored)
# upload one realistic PDF (e.g. 5-8 MB) as admin, publish it, note its id and size in bytes
node loadtest/run.mjs --base https://test.example.com --scenario public    --levels 50,250,500,1000,2000 --duration 30
node loadtest/run.mjs --base https://test.example.com --scenario catalogue --levels 50,250,500,1000,2000 --duration 30
node loadtest/run.mjs --base https://test.example.com --scenario content --doc <id> --docsize <bytes> --levels 50,250,500,1000,2000 --duration 30
node loadtest/seed.mjs --cleanup
```
For a *capacity* test raise the limits on the test deployment (`API_MAX_PER_MIN`, `CONTENT_MAX_PER_MIN`, `MAX_STREAMS_*`, `PUBLIC_MAX_PER_MIN`, `MAX_SESSIONS_PER_USER`), otherwise you are measuring the rate limiters (see below). Use a load generator on a **different machine** from the server. With `--pid <server pid>` (Linux, same machine only) it samples CPU and memory; with `MONGODB_URI` set it reports database operations per request. For a hosted server read CPU/memory/bandwidth from the host dashboard and Atlas metrics instead.

Also record on the deployment: Atlas operations/s and connections, Cloudinary credit usage, host egress, and PDF open time and render time in a real browser on a mid-range phone (not covered by this tool).

## What was measured here, and why it is only indicative
Environment: **1 CPU core, 4 GB RAM, one machine running the load generator, the API (Node 22) and MongoDB together**, in-memory file storage (no network or Cloudinary), 8.5 MB test PDF, 60 sessions. The generator competes with the server for the single core, so absolute numbers are pessimistic and latency tails are inflated; they say nothing reliable about a real host's throughput. 2,000 connections were **not** run. Each level ran 8 seconds.

| Scenario | VUs | req/s | p50 | p97.5 | p99 | errors | server CPU / RSS | DB ops per request |
|---|---|---|---|---|---|---|---|---|
| Public subjects (cached, no login) | 50 | 1,643 | 23 ms | 76 ms | 106 ms | 0 | 77% / 232 MB | ~0 |
| | 250 | 2,242 | 98 ms | 178 ms | 197 ms | 0 | 76% / 234 MB | 0 |
| | 500 | 2,164 | 87 ms | 214 ms | 220 ms | 0 | 78% / 234 MB | 0 |
| | 1000 | 2,410 | 49 ms | 122 ms | 485 ms | 0 | 79% / 234 MB | 0 |
| Catalogue (login), **before** fix | 50 | 216 | 217 ms | 455 ms | 501 ms | 0 | 74% | **2.1** |
| | 250 | 274 | 296 ms | 2,403 ms | 5,599 ms | 0 | 69% | 2.1 |
| | 500 | 285 | 272 ms | 2,753 ms | 5,702 ms | 0 | 70% | 2.3 |
| | 1000 | 246 | 247 ms | 3,665 ms | 6,021 ms | 0 | 71% | 2.6 |
| Catalogue (login), **after** fix | 50 | 331 | 141 ms | 231 ms | 459 ms | 0 | 65% / 217 MB | **1.07** |
| | 250 | 421 | 178 ms | 889 ms | 4,581 ms | 0 | 59% | 1.03 |
| | 500 | 442 | 171 ms | 1,065 ms | 4,252 ms | 0 | 60% | 1.07 |
| | 1000 | 386 | 156 ms | 1,935 ms | 4,762 ms | 0 | 60% / 225 MB | 1.26 |
| Content, 128 KB ranges of an 8.5 MB PDF | 50 | 136 (~17 MB/s) | 369 ms | 516 ms | 543 ms | 0 | 44% / 226 MB | 2.1 |
| | 250 | 140 | 413 ms | 4,239 ms | 6,244 ms | 0 | 45% | 2.3 |
| | 500 | 125 | 461 ms | 4,476 ms | 6,777 ms | 0 | 46% | 2.6 |
| | 1000 | 126 | 582 ms | 5,766 ms | 6,771 ms | 0 | 51% / 250 MB | 3.0 |

**What this supports (and no more):**
- At up to 1,000 connections there were **no errors and no timeouts** in any scenario, and server memory stayed flat (~230-250 MB): streaming does not buffer whole files.
- Latency tails grow sharply from 250 connections on this one-core box; the median stays moderate. Whether a real host behaves similarly is unknown until you test it.
- Authenticated requests are an order of magnitude more expensive than cached public ones, because each one re-checks the session and account in the database (a specification requirement).

## Bottlenecks found, and what changed
1. **Database operations per request.** Each authenticated request cost ~2.1 operations (session lookup, then a separate user lookup). The free Atlas M0 tier allows ~100 operations/second, which capped authenticated traffic near 47 requests/s. **Fix:** one `$lookup` aggregation fetches the session and its current user in a single round trip (authorization semantics unchanged; all 140 server tests pass, and a regression test locks in the budget). Measured: 2.1 -> ~1.05 ops/request, throughput up ~50%, p97.5 at 250 VUs from 2.4 s to 0.9 s (same sandbox).
2. **Rate limits that punished shared IPs.** With the original defaults, one user fetching quickly got 300 successes and then ~22,500 rejections at ~1,500/s, from the **global per-IP** limit (600/min), which every student behind one campus IP shares; the login limit (10 per IP per 15 min, successes counted) could lock out a class logging in together. **Fix:** login IP limit now counts failed attempts only (default 30); global default raised to 3,000/min; both are documented for campus NAT. Rejections are cheap (~0.04 DB ops each).
3. **PDF.js default loading** made the server pull whole files (fixed in Phase 6 with an authorized range transport; verified by test).

## What this implies for capacity (reasoning, not measurement)
- On **Atlas M0** (100 ops/s): content range requests cost ~2 ops each => about **47 range requests per second** across *all* users. At ~20 requests per PDF open that is roughly **2 PDF opens per second**. 500 students opening the same document at the start of a lecture would take minutes to drain, and Atlas queues the excess. A paid Atlas tier removes that cap.
- Bandwidth (section 2 of `DEPLOYMENT.md`) will usually run out before CPU on free hosts.
- If the startup burst matters, options in order of effort: paid Atlas tier; raising `rangeChunkSize` in `client/src/features/viewer/pdfjs.js` (fewer, larger requests, more wasted bytes); a shared cache is **not** safe for authorization data and is not recommended.

## What to do before promising a number
Run the procedure above on the real deployment, from a separate machine, at 50 -> 250 -> 500 -> 1,000 -> 2,000 connections, watch Atlas ops/s, host CPU/memory/egress and Cloudinary credits, and only then state a capacity. Treat the 500-2,000 concurrent-student figure as a target to evaluate.
