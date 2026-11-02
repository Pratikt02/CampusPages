# Protected content delivery (Phase 5)

## Decision: authenticated Express streaming (Option A)

| | A: Express streams from private storage | B: short-lived presigned/signed URLs |
|---|---|---|
| Authorization | Every request, including every PDF.js range request, is checked against current DB state | Once, when the URL is issued |
| Revocation | Unpublish, delete, disable or session revocation block the *next* request | URL keeps working until it expires; a copied URL works for anyone |
| Credential exposure | None leaves the server | A bearer URL is visible in browser devtools |
| Backend load | All content bandwidth and open connections pass through the API host | Minimal |
| Complexity | Range parsing, abort handling, concurrency caps | Lower |

**Selected: A**, because the spec ranks authorization correctness above cost and performance, and because it is the only
option where "access denied after unpublishing" is enforceable per request. The cost is that the API host carries all content
traffic; its quotas are unverified (Phase 8). The storage service is a separate interface, so B (or a hybrid) can be added later
without touching controllers. Neither option can recall bytes a client has already received.

## Endpoint
`GET|HEAD /api/documents/:id/content` (login required)

Order of checks on every request: valid session cookie -> account currently `active` -> per-user rate limit -> document is
`published` AND `ready` *right now* -> stream-slot available -> storage. Unknown, malformed, draft and unfinished ids all return an
identical 404. There is no endpoint that accepts a storage key or path; the key is read from the database server-side only.

Nothing on this route is cached by the server. Responses carry `Cache-Control: private, no-store`, no `ETag`/`Last-Modified`,
`Content-Type` from the server-recorded MIME type, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'; sandbox`. Do **not** put a shared CDN cache in front of this route.

## Range requests
Single `bytes=` ranges (what PDF.js and browsers send): `a-b`, `a-`, `-n`; the end is clamped to the file size.
`206` + `Content-Range`/`Content-Length`. Unsatisfiable or malformed ranges -> `416` + `Content-Range: bytes */size`.
Ignored (full `200`): non-bytes units, multiple ranges, and any request with `If-Range` (we send no validators).
Offsets use the size recorded and verified at upload. If the CDN ignores a `Range` header and returns the whole body, the
Cloudinary adapter slices the stream itself and stops reading upstream early (correct, but costs bandwidth).

## Failure handling and resource limits
- Storage error before streaming -> JSON `502 STORAGE_ERROR` (no key/URL in the response or logs). Object missing for a ready document -> `404` (and a warning log).
- Error after the first byte -> the connection is aborted; JSON is never appended to a started body.
- Client disconnect -> reading from storage stops and the slot is freed.
- Limits (env): `MAX_STREAMS_PER_USER` (12), `MAX_STREAMS_GLOBAL` (200) -> `503` + `Retry-After`; `CONTENT_MAX_PER_MIN` (300 per user) -> `429`;
  `STREAM_TIMEOUT_SECONDS` (120, total per response; very slow clients are cut off); `UPSTREAM_TIMEOUT_MS` (15000, time to storage response headers).
  All caps are per process: N API instances allow N times the global cap.

## Honest limitations
- Delivered bytes cannot be revoked or hidden: a signed-in student can save, screenshot or photograph what they can view. Watermarks (Phase 6) deter, they do not prevent.
- Revocation takes effect on the next request; an in-flight stream finishes (bounded by the stream timeout).
- Admins cannot preview *drafts* through this route (published + ready only).
- If the frontend and API run on different origins, `Cross-Origin-Resource-Policy: same-origin` (Helmet default) would block `<img src>` loads; Phase 6 loads images with `fetch` or the topology is chosen in Phase 8.
- **Not verified against a real Cloudinary account:** signed `authenticated` raw fetch, whether Cloudinary honors `Range` for these assets, PDF delivery being enabled, and bandwidth/credit cost of streaming through the API. Failures log a short Cloudinary diagnostic (`x-cld-error`), never the signed URL.

## Addendum (Phase 6): how the PDF reader consumes this endpoint
PDF.js's default loading sends one un-ranged request and keeps streaming the entire file. Measured in `server/tests/pdfjs.test.js`
(real PDF.js against this endpoint), that single request made the server pull the **whole 2.26 MB file** from storage before PDF.js
cancelled it, while the ranged requests totalled only ~0.4 MB. The reader therefore never sends an un-ranged request: the shipped
`rangeTransport.js` issues explicit `Range` requests only. The integration test asserts that every storage call is ranged and that
under half the file is read to open a 30-page PDF and read page 25, that unauthenticated and draft requests fail (401/404), and that
unpublishing mid-session makes the next range request fail and the reader surface an error.
Un-ranged requests are still served correctly (e.g. from other clients), but they can cost a full upstream fetch when the client cancels
late; this has not been measured against real Cloudinary and real network conditions.
