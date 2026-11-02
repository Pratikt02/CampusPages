# Troubleshooting

First try the smoke test: `node scripts/smoke.mjs https://your-app` (it tells you which layer is failing). Every API response has an `X-Request-Id` header; the same id appears in the server log line.

| Symptom | Likely cause and fix |
|---|---|
| Server exits at startup: "CLIENT_ORIGINS must be explicit https:// origins" | In production `CLIENT_ORIGINS` must be your exact `https://` URL (no `*`, no `http`). |
| Exits: "Production requires STORAGE_DRIVER=cloudinary" / "Cloudinary credentials are missing" | Set all three `CLOUDINARY_*` variables. In-memory storage is refused in production on purpose. |
| Exits: "SERVE_CLIENT=true but .../index.html was not found" | The build step did not run. Build command must be `npm ci && npm run build`. |
| `/api/health` returns 503 `db: disconnected` | Atlas unreachable: wrong URI/password (URL-encode special characters), the database user lacks access, or Atlas *Network Access* does not allow your host (free hosts need `0.0.0.0/0`). The log line "MongoDB connection failed" shows a scrubbed reason. |
| "Invalid email or password" for a correct password | The account was created in a different database than the server uses (check the database name in `MONGODB_URI`), or the account is disabled. |
| Login works then immediately logs out / `/api/auth/me` is 401 in the browser | Cookie not stored: site is not https in production (the cookie is `Secure` and `__Host-`), or `CLIENT_ORIGINS` does not exactly match the address bar. |
| Login/any POST returns 403 `BAD_ORIGIN` | The `Origin` header is not in `CLIENT_ORIGINS`. Fix the variable (scheme, host, port must match exactly). |
| 403 `CSRF` after a long idle period | The session ended; sign in again. |
| 429 for many students at once | Students share one campus IP. Raise `API_MAX_PER_MIN` (and `LOGIN_MAX_PER_15MIN` if failures are shared); set `TRUST_PROXY=true` so the real client IP is used. |
| 503 "busy" while reading | Stream caps reached (`MAX_STREAMS_PER_USER`/`MAX_STREAMS_GLOBAL`); the reader retries once. Raise carefully; each stream uses host bandwidth. |
| First visit takes ~1 minute | Free host woke from sleep. Upgrade the plan or accept it; use an external uptime ping only if your host's terms allow it. |
| PDF stays on "Loading document" or shows "could not be loaded" | (1) Cloudinary **PDF delivery is blocked** on free accounts: enable it in *Settings -> Security*. (2) The server log has `Content storage error` with a `detail` from Cloudinary (e.g. `http_401 ...`). (3) Cloudinary's file-size limit: re-upload a smaller file. |
| Upload rejected 422 "took too long ... to process" | Pathological or huge PDF; simplify/re-export it. Limit is `PDF_PARSE_TIMEOUT_MS`. |
| Upload rejected 413 | File larger than `MAX_UPLOAD_MB`. Check your Cloudinary plan's limit before raising it. |
| Upload rejected 415 | Only PDF, JPEG, PNG, WebP; the file's real content must match its extension and type. |
| Student sees nothing in the library | Documents must be **published** and fully processed. Check *Admin -> Documents*. |
| Reader works on desktop but the PDF text looks slightly different | PDFs that do not embed standard fonts use the browser's fallback fonts (PDF.js standard-font files are not bundled). Embedding fonts when exporting avoids it. |
| Admin: "Failed" documents in the list | A storage error left an unfinished upload; the cleanup job removes it after `CLEANUP_AFTER_MINUTES` (30). |
| `npm test` fails downloading MongoDB | The test suite downloads a MongoDB binary on first run: allow internet access, or set `MONGOMS_SYSTEM_BINARY` to a local `mongod`. |
| `npm install` warns about the Node version | Use Node 22.13+ (PDF.js requires it). |
