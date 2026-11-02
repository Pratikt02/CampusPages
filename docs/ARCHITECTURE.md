# Architecture notes
Server-managed sessions (hashed token in Mongo, HTTP-only cookie, CSRF header), argon2id passwords,
Subject model added, upload record created as `uploading` before R2 write, JPEG/PNG/WebP images only,
25 MB upload cap, NodeCache is process-local (metadata only; never authoritative for authorization).
See README for phase status. Provider quotas and pricing are unverified until Phase 8.
