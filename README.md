# CampusPages
**The digital reading room built for students.**

A secure digital academic library: admins upload documents, authenticated students read them in the browser.
**Status: Phases 1-6 complete (foundation, authentication, private storage + admin management, public subjects + student catalogue, protected content delivery, PDF and image viewers).** **All eight phases are complete.** See [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) for exactly what was verified and what is still unverified (no cloud deployment was performed; real Cloudinary, Chrome/Safari, real devices and screen readers are untested).

## Requirements
Node.js 22.13+ or 24 LTS (recommended; both tested). PDF.js needs 22.13+, and Node 20 is end-of-life. npm >= 10.

## Setup
```powershell
# Windows PowerShell (macOS/Linux: use cp instead of Copy-Item)
npm install
Copy-Item .env.example server\.env   # then edit server\.env; never commit it
npm run dev:server    # API on http://localhost:4000
npm run dev:client    # app on http://localhost:5173 (proxies /api to :4000)
```
`MONGODB_URI` comes from MongoDB Atlas (create a free cluster, a database user, and allow your IP).
Without it the API still starts; `/api/health` returns 503 `degraded`.

## Verify
```
npm test              # server (Vitest+Supertest) and client (Vitest+Testing Library)
npm run build         # production client build
npm run audit:deps    # npm audit for production dependencies
```

## Phase 1 contents
- npm workspaces monorepo: `client/` (React 18, Vite, React Router 7, lucide-react), `server/` (Express, Mongoose, Helmet, CORS allow-list).
- `GET /api/health` (minimal, no config leakage), consistent JSON errors, strict CORS, production config guard.
- Design tokens (light + dark), pre-paint theme script, `ThemeProvider`, `BrandLogo`, public navbar with accessible mobile menu, footer.
- Public homepage at `/` (no auth guard), `/subjects`, `/login` placeholder, not-found page.

## Decisions and deviations
- JavaScript (ESM), not TypeScript.
- Planned delivery strategy: authenticated Express streaming from private R2 (Phase 5), keeping storage behind a service interface.
- Dark theme uses #6366F1 for filled controls; a lighter indigo (#A5B4FC) is used for link text and focus rings for contrast.
- Hero art is an original inline SVG. Homepage feature cards describe goals; they are not claims of shipped features.
- Homepage subjects show an honest empty state until the backend provides data (Phase 4).

## Security limits (honest)
Content delivered to a browser cannot be fully protected from screenshots, photos, or extraction. Watermarks and viewer restrictions are deterrents, not security boundaries.

## Phase 2: authentication and authorization
- Server-side sessions: random 256-bit token in an HTTP-only, SameSite=Lax cookie (`__Host-` prefix and Secure in production). Only the SHA-256 hash is stored; idle (60 min) and absolute (12 h) expiry, TTL index, revocation on logout.
- Every request re-reads the user from MongoDB, so disabling, deleting or demoting an account takes effect on the next request.
- CSRF: per-session token returned by `/api/auth/login` and `/api/auth/me`, sent as `X-CSRF-Token` on unsafe methods, plus an Origin allow-list check.
- argon2id passwords (OWASP minimum profile), constant-ish timing for unknown emails, one generic login error, login rate limit (10 / 15 min / IP by default).
- Endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, and `GET /api/admin/ping` (role-gate check only; real admin routes arrive in Phase 3).
- No registration endpoint exists. Accounts are created only with the CLI.

### Create the first admin (or a student)
```powershell
cd server
npm run create-user -- --role admin --email you@school.edu --name "Your Name"
```
The password is prompted (hidden) or read from `CAMPUSPAGES_NEW_PASSWORD`; it is never a command-line argument. Requires `MONGODB_URI` in `server/.env`. Omit `--role` to create a student (add `--student-id` if needed).
Bulk student import is not implemented yet.

### Known limitations
- Rate limiting is in-memory per process (not shared across instances).
- Cross-site cookie topology (frontend and API on different domains) is decided in Phase 8; use the Vite proxy locally.
- No password-change/reset flow and no "sign out everywhere" endpoint yet (the service function exists).
- Audit events store type/user only (no IP).

## Phase 3: private storage and admin document management
**Storage provider: Cloudinary (deviation from the original R2 plan, chosen by the project owner).** Files are stored as `raw` assets with delivery type `authenticated`, so no unsigned URL can read them. The storage service (`server/src/storage/`) exposes `putObject`, `statObject`, `deleteObject`; a memory adapter is used for tests.

### Cloudinary setup (you must do these)
1. Create an account; copy cloud name, API key and API secret into `server/.env` (see `.env.example`).
2. Console > Settings > Security: allow delivery of PDF and ZIP files (blocked by default on free accounts).
3. Check your plan's per-file upload limit and set `MAX_UPLOAD_MB` if it differs from the 10 MB default.
4. Restart `npm run dev:server`. Without credentials the server warns and uses non-persistent memory storage.

### Behaviour
- Admin area at `/admin` (dashboard, upload, documents): sidebar (collapsible on mobile), real statistics, drag-and-drop upload with progress, edit dialog, publish/unpublish, delete confirmation, toasts.
- Upload checks (server-side): extension allow-list (.pdf .jpg .jpeg .png .webp), magic-byte signature, extension/content/MIME agreement, size cap, PDF readability and page cap (500), image dimension cap (25 MP). SVG/GIF are rejected. Object keys are generated by the server; filenames are never used.
- Flow: record created as `uploading` -> object stored -> verified by size -> `ready`. Documents are always created as drafts and only `ready` documents can be published. Failed uploads are cleaned up immediately; a sweeper (every 15 min) removes stale unfinished uploads. If storage deletion fails, the record is kept and unpublished so nothing is orphaned silently.
- Concurrent uploads are bounded (default 3; extra requests get 503 + Retry-After).
- NodeCache holds only admin stats and the subject list (30 s TTL). It is process-local: with several API instances each has its own copy, so changes may appear on other instances for up to 30 s. Cache is never used for authorization.
- Endpoints: `GET/POST /api/admin/documents`, `GET/PATCH/DELETE /api/admin/documents/:id`, `PATCH /api/admin/documents/:id/publish`, `GET /api/admin/stats`, `GET/POST /api/admin/subjects`.

### Not verified / limitations
- The Cloudinary adapter has not been run against a real account. Raw + `authenticated` upload, stat, delete, and (in Phase 5) signed server-side fetching with byte ranges must be confirmed with your account.
- Image and PDF processing is validation only; no thumbnails or derivatives are generated.
- Subjects can be created but not renamed/deleted yet. No student-facing access exists until Phases 4-5.

## Phase 4: public discovery and student catalogue
- **Public API (no login):** `GET /api/public/subjects`, `GET /api/public/subjects/:id`. Returns only subject name, description and the count of published, ready materials. Never document titles, ids, file details or storage keys. Subjects with no published material are omitted. Rate limited (default 120/min/IP); `Cache-Control: public, max-age=30`.
- **Student API (login required, active account checked every request):** `GET /api/documents` (search, subject, file type, semester, pagination) and `GET /api/documents/:id`. Only published + ready documents are visible; drafts, unfinished, unknown and malformed ids all return the same 404. Responses use an allow-list of fields and `Cache-Control: private, no-store`.
- **Caching:** public subject list (60 s) and non-search catalogue pages (30 s) are cached in NodeCache and invalidated by every upload, edit, publish, unpublish, delete and subject creation. Authentication runs before the cache is consulted. Search queries are not cached. The cache is process-local (max 500 keys); with multiple instances, other instances may serve stale data for up to the TTL.
- **UI:** homepage and `/subjects` show real subject cards (loading, empty, error + retry states); `/subjects/:id` is public. **View Notes** opens the *Login Required* modal for guests (Sign In goes to `/login` and the destination is preserved if it is a safe internal path the user may open; Cancel/Escape close it); signed-in users go straight to the library. `/app` is the student dashboard (search, subject and type filters synced to the URL, pagination, skeletons); `/app/documents/:id` shows metadata only and states that the reader is not available yet.
- No grid/list switcher, no recommendations, no streaks or counts beyond real data.

### Limitations
- Students cannot open file contents yet (Phases 5-6). Admins can also browse `/app`.
- Search uses an escaped case-insensitive title match, which is fine for a small library but should move to the text index or a search service if the library grows large.

## Phase 5: protected content delivery
`GET|HEAD /api/documents/:id/content` streams a published, ready document through Express from private storage, re-authorizing every request (including each range request) against the database. Supports single byte ranges (206/416), has strict private/no-store headers, bounded concurrency, rate limits, timeouts and safe error/abort handling. No storage URL or key is ever sent to the browser. Full design, comparison with presigned URLs, limits and caveats: [`docs/DELIVERY.md`](docs/DELIVERY.md).

Fix included: deliberate 5xx errors (e.g. `STORAGE_ERROR`, `BUSY`) now keep their code and message; unexpected exceptions still return a generic `INTERNAL`.

**Unverified:** Cloudinary signed fetch and `Range` behaviour on a real account (adapter logic is tested with a mocked network).

## Phase 6: PDF and image viewers
Open any document from the library (`/app/documents/:id`): a distraction-free reader page with a Back link, title, theme toggle and the reader.

**PDF reader** (PDF.js 6.4.299, code-split so it is only downloaded when a PDF is opened)
- Page placeholders keep the scroll height; only pages near the viewport are rendered to a canvas, far-away pages release their canvas, and obsolete render tasks are cancelled when zoom changes or a page leaves the window.
- Controls (all keyboard-accessible, 44px touch targets, labelled): previous/next page, page-number field, zoom in/out (25%-400%), fit-to-width, fit-to-page; `+`, `-`, `0` shortcuts on the focused reader. Canvas resolution is capped (max 2x device ratio and ~16 MP per page).
- Loading, error and retry states; 401 -> "session expired" (and the app's session-expired flow), 404 -> "no longer available".
- No download or print buttons. Fullscreen is not implemented.

**Image reader** (JPEG/PNG/WebP): fit-to-view (never upscales small images), zoom 25%-400% with buttons/keys/mouse wheel/pinch, drag-to-pan with clamping, actual-size button, arrow-key panning. The image is fetched with the session cookie into an in-memory object URL (revoked on exit); no URL to the stored file is ever exposed.

**Personalized watermark:** every PDF page and the image stage carry a tiled, non-interactive overlay showing a *masked* email (`s*****t@example.edu`) and the open time. The identity comes from the authenticated session (`/api/auth/me`); URL/query parameters are never used (tested).

**How PDF.js loads the file (important):** by default PDF.js opens with an un-ranged request and keeps streaming the whole file; measured against the Phase 5 endpoint this made the server pull the entire file from storage even though PDF.js cancelled early. `client/src/features/viewer/rangeTransport.js` therefore supplies PDF.js with a custom range transport: the first chunk and every later chunk are explicit, individually authorized `Range` requests (max 4 in parallel, one retry on 502/503/network errors, strict `Content-Range`/length validation). If a range request later fails (session ended, document unpublished), the reader shows an error state and the worker is terminated after a short grace period.

### Limitations (honest)
- **Not run in a real browser.** Rendering, layout at the required viewport sizes, touch pinch/drag on real devices, the dark theme appearance and real-world PDF.js behavior are unverified. A real PDF.js client was verified against the server in Node (range-only loading, authorization), but canvas rendering was not.
- **Accessibility trade-off:** pages are canvas images with a label ("Page N") and no text layer, so screen readers cannot read PDF text and text cannot be selected. This is deliberate (casual-copy deterrent) but is a real cost for assistive-technology users; consider an accessible-alternative process for students who need one.
- Context-menu blocking, non-draggable images, no text selection and the watermark are **deterrents only**. Anything delivered to a browser can be screenshotted, photographed or extracted, and the overlay can be removed by a determined user.
- Page placeholders use page 1's size until a page loads, so PDFs with mixed page sizes can shift slightly while scrolling.
- Requires a modern browser (PDF.js 6) and Node >= 22.13 for development.
- Dev-tooling audit: `npm audit` (including dev dependencies) reports advisories in the Vite/esbuild/Vitest toolchain; none ship to production (`npm audit --omit=dev`: 0). Upgrading needs major version bumps and is planned for Phase 7.

## Phase 7: security hardening and quality
Full control matrix, dependency notes and residual risks: [`docs/SECURITY.md`](docs/SECURITY.md).

**Added:** per-account login limit, global API limit, session cap (5), "sign out everywhere" (`POST /api/auth/logout-all`), security audit events (CSRF/role/origin denials), request ids and safe one-line request logs with redaction, request timeouts and slow-client server timeouts, PDF parsing in a time- and memory-bounded worker thread, a non-overlapping cleanup sweeper, `no-store` on account/admin responses, graceful shutdown, a strict Content-Security-Policy (`client/public/_headers`; the theme bootstrap is now an external script), and dependency upgrades (patched PDF.js/multer/body-parser, Vite 8, Vitest 5).

**Accessibility/responsive fixes** (found by axe-core, a contrast test, and real-browser runs): dark-theme button text failed AA contrast (4.0:1) with the specified accent, so filled buttons use #4F46E5 and #6366F1 remains the accent for non-text uses; heading order on card lists; button names no longer depend on hidden-text whitespace; the mobile navbar was wider than 390px phones and pushed the menu button off-screen; image "fit" was clamped so it cropped images on 320px phones and "zoom out" could enlarge; watermark text was clipped inside its tiles on narrow pages; admin tables are stacked cards on phones; several tap targets were under 44px.

**Verification run (all executed):**
- Server tests: 129 passed (real MongoDB). Client tests: 146 passed (incl. axe-core accessibility checks on every major screen and a WCAG contrast check of both themes, 49 pairs).
- Real Firefox 158 (headless), 7 viewports (320x568, 390x844, 844x390, 768x1024, 1024x768, 1366x768, 1920x1080) x guest/student/admin x light/dark: no horizontal overflow, no touch target under 44px at phone widths, dialogs inside the viewport, PDF.js canvases drawn at every size. 320 and 390 are rendered in an iframe of that width because Firefox will not shrink a window below ~500px. See `e2e/README.md`.
- Keyboard (Firefox): skip link first, visible focus on every tabbed element, modal focus trap, Escape returns focus, `+` zooms the PDF.
- Under the enforced CSP the app still works in Firefox.
- `npm audit`: 0 vulnerabilities including dev tools.

**Not verified:** Chrome/Safari, real touch devices, screen readers, real Cloudinary, real Atlas, Windows, load/performance (Phase 8).

## Phase 8: deployment and validation
Start here: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (accounts, environment variables, hosting, HTTPS, backups, rollback, **costs and free-tier limits**), [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md), [`docs/LOADTEST.md`](docs/LOADTEST.md), [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md).

- **One-origin deployment:** `SERVE_CLIENT=true` makes the API serve the built frontend (first-party cookies, no CORS, strict CSP). Production: `npm ci && npm run build`, then `npm start`.
- `npm run init-db` creates all indexes; `npm run smoke -- https://your-app` checks a running deployment (24 checks, optional login flow via `SMOKE_EMAIL`/`SMOKE_PASSWORD`).
- `loadtest/` holds a progressive load-test tool and its seed script (test databases only). Measured results are from a 1-core sandbox and make **no** claim about 500-2,000 concurrent students.
- Findings fixed in this phase: authentication cost two database operations per request (now one, which matters for Atlas's ~100 ops/s free cap); rate-limit defaults would have locked out whole classes behind one campus IP (login limit now counts failures only, global limit raised).
- Dependencies: `uuid` is pinned by an npm `overrides` entry to clear an advisory in the dev-only load tool.
