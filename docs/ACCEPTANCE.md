# Final acceptance report (specification section 25)

Evidence legend: **T** automated test executed and passed · **B** checked in real headless Firefox 158 · **S** `scripts/smoke.mjs` · **M** measured · **D** documentation/design only · **U** not verified (needs your accounts, devices or time).

Executed at the end of Phase 8: server tests **140 passed**, client tests **146 passed** on Node 22.22 **and** Node 24.22; production build; `npm audit` **0 vulnerabilities** (including dev tools); smoke test **24/24** against the single-origin server with a real login; Firefox matrix (below).

## Product and branding
| Criterion | Status | Evidence |
|---|---|---|
| Official name and slogan used consistently; no placeholder branding | Met | T (homepage test), B (screenshots), search of the whole project found no "StudySpace". |
| Public homepage renders without authentication | Met | T, B, S. |
| Visitors browse approved subject metadata and see the Login Required modal | Met | T (exact message, Cancel, Sign In, Escape, focus return), B (viewport fit and focus on "Sign In"). |
| Intended destination preserved after login where authorized | Met | T (including open-redirect rejection). |

## Authentication and security
| Criterion | Status | Evidence |
|---|---|---|
| Login, logout, sessions, roles, account status | Met | T (revocation, idle/absolute expiry, disabled/deleted/demoted users take effect on the next request), B (real login flow), S. |
| Backend authorization on every sensitive operation; students cannot reach admin APIs or other documents; unpublished documents inaccessible | Met | T, including a real PDF.js client losing access mid-read when a document is unpublished. |
| IDOR / cross-student tests | Met | T. Note: documents are not per-student by design; any active student may read any *published* document. |
| Storage is private; no permanent public URLs | **Met in design and tests; U against real Cloudinary** | Assets are `authenticated`; the signed URL exists only server-side (tested with a mocked network and the real SDK's URL signing). |
| Cache cannot bypass authorization | Met | T. |
| Upload validation and storage cleanup | Met with a fake storage adapter; **U with real Cloudinary** | T (signatures, MIME, size, page/dimension limits, worker-bounded PDF parsing, failure and sweeper paths). |
| Known security limitations documented honestly | Met | `docs/SECURITY.md`, `docs/DELIVERY.md`. |

## Document management and viewing
| Criterion | Status | Evidence |
|---|---|---|
| Admins can upload, process, edit, publish, unpublish, delete | Met via API and component tests; **admin UI file-chooser upload and confirmed delete were not exercised in a browser** | T; B loaded every admin page and opened the delete dialog; uploads in the browser stack were made through the real admin API. |
| Failed uploads never become accessible | Met | T. |
| Students read published PDFs and approved images | Met in Firefox with in-memory storage; **U with real Cloudinary** | B: PDF.js drew pixels at all 7 viewports (lazy: 1-4 of 12 pages at a time), image reader fits and zooms. |
| Responsive viewer controls | Met for layout; **real touch gestures U** | B, T. |
| Watermark uses authenticated identity (never URL parameters) | Met | T (hostile query parameters ignored), B (visual). |
| No download/print buttons; extraction limits stated | Met | T; `docs/SECURITY.md` risk 1. |

## Design and responsiveness
| Criterion | Status | Evidence |
|---|---|---|
| Light and dark themes across the whole app | Met | B (all pages, both themes), T (49 contrast checks from the real token file). Deviation: filled buttons in dark mode use #4F46E5 (your #6366F1 gave 4.0:1 text contrast); #6366F1 remains the accent. |
| Public, student, admin, auth and viewer screens responsive; specified viewports tested | Met in Firefox | B at 320x568, 390x844, 844x390, 768x1024, 1024x768, 1366x768, 1920x1080. 320 and 390 were rendered in an iframe of that width because Firefox will not shrink a window below ~500 px. Chrome, Safari, real phones/tablets **U**. |
| No unresolved critical overflow/overlap/clipping/navigation/accessibility issue | Met for what was tested | Several real defects were found and fixed (mobile navbar pushing the menu off-screen, image fit cropping, watermark clipping, admin table on phones, tap targets, heading order, dark-mode contrast). Final runs: 0 overflow, 0 sub-44 px targets at phone widths. |
| All buttons and links perform their advertised actions | **Partly** | The primary flows are tested; there was no exhaustive click-through of every control. |
| Loading, empty, error and success states | Met | T. |
| Accessibility | Partly | axe-core on every major screen and dialog (T), keyboard order, focus visibility, modal trap, Escape (B). **Screen readers U.** PDF pages have no text layer (see limitations). |

## Quality and operations
| Criterion | Status | Evidence |
|---|---|---|
| Executable automated tests, honestly reported | Met | Counts above; mistakes found and fixed along the way are described in the phase notes. |
| Production build tested | Met | Built and served by the real server and driven in Firefox. |
| Setup and deployment documentation | Met as documentation; **no deployment was performed** | `docs/DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md`. |
| Environment variables and secrets handled correctly | Met | `.env.example` placeholders only; `.gitignore`; redaction tested; production refuses unsafe settings (T). |
| Provider limits and costs documented | Met, dated Oct 2026 | `docs/DEPLOYMENT.md` section 2 (Render, Atlas, Cloudinary, Oracle). Re-check before use. |
| Performance claims supported by measurements | Met (no capacity claim made) | `docs/LOADTEST.md`: sandbox results, up to 1,000 connections; **2,000 not run**; **no claim that 500-2,000 students are supported**. |
| Remaining limitations disclosed | Met | below, `docs/SECURITY.md`, `docs/LOADTEST.md`. |

## What you must still do (nothing below can be done from here)
1. Create Atlas and Cloudinary accounts; **enable PDF delivery in Cloudinary** (blocked by default on free); run `npm run init-db` and `create-user` from your computer.
2. Choose and configure a host (`docs/DEPLOYMENT.md`); set the environment variables; deploy.
3. Run `node scripts/smoke.mjs https://your-app` (with `SMOKE_EMAIL`/`SMOKE_PASSWORD`).
4. Upload a real PDF and image as admin and read them as a student **on a real phone**: this is the first test against real Cloudinary and the first test on a real touch device.
5. Run the load procedure against a *test* deployment from a separate machine before promising any capacity.
6. Schedule database backups (Atlas M0 has none) and keep originals of uploaded files.

## Known gaps and suggested next work
- **Cloudinary** (signed fetch, `Range` support, PDF delivery, credit cost of streaming) is unverified; its credits may become the main running cost. A Cloudflare R2 adapter is a contained change if needed.
- **Free-tier ceilings:** Render Hobby egress 5 GB/month; Atlas M0 ~100 ops/s (~47 range requests/s). Fine for a pilot, not for a campus.
- No password change/reset, MFA, bulk student import, subject rename/delete, admin preview of drafts, or UI for "sign out everywhere" (API exists).
- PDF pages are canvas images: not readable by screen readers and no text selection (deliberate deterrent; accessibility cost). Standard-font files are not bundled, so PDFs that do not embed fonts use browser fallbacks.
- Rate limits, stream caps and the metadata cache are per process.
- Untested: Chrome, Safari, real phones/tablets, screen readers, Windows, real Atlas and Cloudinary, any hosted environment.
