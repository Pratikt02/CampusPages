# Deploying CampusPages

> **Honesty note.** Everything in this guide was written from provider documentation and current third-party reports, and the application was run locally against real MongoDB and headless Firefox. **No cloud deployment was performed**, and nothing here has been run against a real Atlas cluster, Cloudinary account or hosting provider. Provider limits change; every figure is marked with the date it was checked (**Oct 2026**). Re-check before relying on it.

## 1. What you are deploying

One Node.js process that serves **both the API and the built frontend** from a single origin:

```
Browser --HTTPS--> your host (Node: Express API + static React build) --> MongoDB Atlas (metadata, sessions)
                                                                       --> Cloudinary (private documents)
```

Why one origin: the session cookie is first-party (works in Safari/Chrome that block third-party cookies), no CORS is needed, and the strict Content-Security-Policy (`default-src 'self'`) applies as written. Putting the frontend on a different free host (e.g. `*.pages.dev`) and the API elsewhere would be *cross-site* and login would break in browsers that block third-party cookies unless you add a custom domain with both under it. The static-host files (`client/public/_headers`) are included for that advanced setup, but it is not the recommended path.

**Runtime:** Node.js **22.13+** (22 is supported until 30 Apr 2027) or **24 LTS** (recommended; supported until Apr 2028). Node 20 is end-of-life. Both 22.22 and 24.22 were tested here: all server and client tests pass on each.

## 2. Costs and capacity: read this before choosing hosts

Because every document byte is streamed through your server (the delivery strategy chosen for per-request authorization), **bandwidth is the limit that matters most.**

| Service | Free allowance (checked Oct 2026) | What it means for CampusPages |
|---|---|---|
| **MongoDB Atlas M0** | 512 MB storage, ~100 operations/second, 500 connections, no backups | Metadata for thousands of documents fits easily. **100 ops/s is the real ceiling:** one authenticated request costs ~1 op, a content range request ~2 ops (measured), so ≈ 47 range requests/s. |
| **Cloudinary Free** | 25 credits/month; 1 credit = 1 GB storage **or** 1 GB bandwidth **or** 1,000 transformations. Reported ~10 MB max file size. PDF delivery is **blocked by default** on free accounts (you must enable it). | Storage and reading share the same pool: e.g. 5 GB stored leaves ~20 GB of reading per month. |
| **Render Free web service** | 512 MB RAM, 0.1 CPU, **sleeps after 15 min idle (~1 min to wake)**, 750 instance-hours/month, ephemeral disk. Hobby workspace includes only **5 GB outbound/month** (then $0.15/GB; without a payment method the services are suspended). | The 5 GB egress is the binding limit: at an *assumed* 3 MB transferred per document read, that is only ~1,700 reads/month. Fine for a pilot; not for a campus. |
| **Oracle Cloud Always Free VM** | Oracle advertises up to 4 ARM cores / 24 GB and **10 TB/month** outbound. ARM capacity is frequently unavailable at sign-up, one third-party report claims limits were reduced in 2026 (not confirmed on Oracle's page), and you must administer the VM yourself (TLS, updates, process manager). | The only free option with enough egress for real use; **not beginner-friendly**. |

**Rule of thumb (estimates, not measurements):** monthly transfer ≈ (document reads) × (average MB actually fetched per read). PDF.js fetches only the pages opened, in 128 KB ranges, so a read is often a fraction of the file. Measure your own average in production (Render and Cloudinary both show usage) before sizing.

**Likely real costs for ~hundreds of active students** are dominated by bandwidth on Cloudinary credits and on the API host. The storage layer is an interface (`server/src/storage/`), so if Cloudinary credits become the main cost, a Cloudflare R2 adapter (S3 API, no egress fees) is a contained change (`putObject`, `statObject`, `deleteObject`, `getObjectStream`). Ask if you want it built.

Sources checked: Render docs (free tier, outbound bandwidth), MongoDB Atlas "free cluster limitations" docs, Cloudinary pricing and support pages, Oracle Cloud free-tier page, Node.js release schedule.

## 3. Prerequisites (on your computer)

Node.js 22.13+ or 24, npm 10+, Git, and a terminal (Windows PowerShell is fine). Check: `node -v`.

```powershell
npm install
npm test            # server + client tests (the server tests download a MongoDB test binary on first run)
npm run build       # builds client/dist
```

## 4. MongoDB Atlas (database)

1. Create a free account and an **M0** cluster at https://www.mongodb.com/atlas.
2. *Database Access* -> add a database user with a long random password and the built-in role **readWrite on the `campuspages` database only** (not Atlas admin).
3. *Network Access* -> allow your own IP now (for setup). Free hosts do not have a fixed outbound IP, so for the deployed app you must also allow `0.0.0.0/0`. That is acceptable **only because** the database requires TLS and a strong password; mitigate by using a unique long password and the least-privilege user above. A fixed-IP paid host lets you restrict this.
4. *Connect -> Drivers* -> copy the connection string; put `/campuspages` before the `?`. URL-encode special characters in the password.
5. From your computer, create the indexes (safe to repeat):
   ```powershell
   $env:MONGODB_URI = "mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/campuspages?retryWrites=true&w=majority"
   npm run init-db
   ```
6. Create the first admin (the password is prompted, never typed on the command line):
   ```powershell
   cd server
   npm run create-user -- --role admin --email you@school.edu --name "Your Name"
   ```
   Create students the same way without `--role`. There is deliberately no web endpoint that creates accounts.

## 5. Cloudinary (private file storage)

1. Create a free account; from the dashboard note **cloud name, API key, API secret** (treat the secret like a password).
2. *Settings -> Security*: **allow delivery of PDF and ZIP files** (blocked by default on free accounts; without this PDFs will not open).
3. *Settings -> Account / Usage*: note your per-file upload limit and set `MAX_UPLOAD_MB` to match (default 10).
4. Files are stored as `raw` assets of delivery type `authenticated`; no public URL can read them.

## 6. Environment variables (production)

Set these in your host's dashboard. **Never commit them.** Defaults for everything else are in `.env.example`.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SERVE_CLIENT` | `true` |
| `CLIENT_ORIGINS` | your exact public URL, `https://your-app.example.com` (https only; the server refuses to start otherwise) |
| `MONGODB_URI` | the Atlas string |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from Cloudinary (the server refuses production without them; in-memory storage is refused in production) |
| `TRUST_PROXY` | `true` (the host's proxy sets `X-Forwarded-For`; without it every user shares the proxy's IP for rate limiting) |
| `API_MAX_PER_MIN` | raise (e.g. `20000`) if many students share one campus IP |
| `PORT` | usually set by the host |

## 7. Deploying on Render (worked example; unverified by me)

1. Push the project to a private GitHub repository (`.gitignore` already excludes secrets and builds).
2. Render -> *New -> Web Service* -> connect the repo.
3. **Runtime:** Node. **Build command:** `npm ci && npm run build`. **Start command:** `npm start`. **Health check path:** `/api/health`. Set `NODE_VERSION=24` (check Render's current docs for the exact variable name and supported versions).
4. Add the environment variables from section 6, then deploy.
5. Render gives you an `https://...onrender.com` URL; use exactly that for `CLIENT_ORIGINS` (set it, then redeploy). HTTPS is provided by Render; a custom domain is optional and added in the same dashboard (update `CLIENT_ORIGINS` to match).
6. **Free-plan behavior:** the service sleeps after ~15 minutes without traffic, so the first visit afterwards takes about a minute. In-process caches and rate-limit counters reset when it sleeps or restarts (by design nothing important is stored there).

Other hosts work the same way (any Node 22.13+ host that gives you a build step, a start command, HTTPS and environment variables). On a plain VM, run `npm ci && npm run build`, start with a process manager (systemd/pm2), and put a TLS-terminating proxy (e.g. Caddy) in front with `TRUST_PROXY=true`.

## 8. After deploying: smoke test, health, logs

```powershell
node scripts/smoke.mjs https://your-app.example.com
# with a real login check (credentials via environment, never as arguments):
$env:SMOKE_EMAIL = "student@school.edu"; $env:SMOKE_PASSWORD = "..."
node scripts/smoke.mjs https://your-app.example.com
```
It checks health, the app and its security headers, that every protected route returns 401 without a login, CORS/CSRF rejection, and (optionally) login -> catalogue -> logout -> session dead. Exit code 1 on any failure. This script passed 24/24 against the single-origin server locally.

Then, **manually**, as an admin upload a small PDF and an image, publish them, and open both as a student on a real phone and a laptop. That is the one thing no script here has done against your real Cloudinary account (see Troubleshooting if a PDF will not open).

- **Health endpoint:** `GET /api/health` -> `{"status":"ok","db":"connected"}`; returns 503 if the database is unreachable. It exposes nothing else.
- **Logs:** one JSON line per request (method, normalised path, status, duration, user id, request id; no queries, cookies or secrets). Find a failing request by the `X-Request-Id` response header. View logs in your host's dashboard.
- **Quotas to watch:** host bandwidth, Cloudinary *Usage* page (credits), Atlas *Metrics* (operations/s, storage).

## 9. Backups and rollback

- **Atlas M0 has no backups.** Schedule `mongodump` yourself (e.g. weekly from your computer: `mongodump --uri "<Atlas URI>" --out backup-<date>`) and keep it somewhere safe. Restore with `mongorestore`.
- **Cloudinary** holds the only copy of uploaded files: keep the original documents in your own storage too.
- **Rollback:** redeploy the previous successful deploy from the host's dashboard. There are no database migrations; indexes are additive, so older code runs against newer data. Rotate any credential you think leaked (Atlas user password, Cloudinary secret) and redeploy.
- To force everyone to sign in again (e.g. after a suspected leak), delete the `sessions` collection in Atlas.
