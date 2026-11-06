# ADR 008 — Private uploads (student submissions)

**Status:** proposed (2026-11-06, E-026) — needs Farjad's review

## Context
Assignments (phase-2 §C2, C3f) take files from students. The existing `media` collection is public-read: anyone
with the URL (`/api/media/file/<name>`) can fetch a file, names are the uploaded names, and Next/Payload may cache
it. Student work is personal data: it must only reach the student who uploaded it and the graders of that academy
and course, and must never leak across academies (`demo` grader asking for an `iba` file).

## Decision
- A separate upload collection **`submission-files`**, tenant-owned (multi-tenant plugin), never public.
- **Storage outside any public path.** Local dev/self-hosted: `PRIVATE_UPLOADS_DIR` (default
  `apps/web/private-uploads/submission-files`, git-ignored). Production: a **private** bucket on Arvan Object Storage
  (S3 adapter, no public ACL, Iranian region per ADR 002) — wired when B/storage lands; until then the volume must be
  persistent and not served by any static handler.
- **Random file names** (`<uuid>.<ext>`) are set by the server; the original name is not stored or reused.
- **Allow-list by content:** PDF, DOCX, JPG, PNG, ≤ 20 MB each, ≤ 5 per submission (client to confirm). The type is
  detected from magic bytes in `@edvora/core/assignments` (`detectSubmissionFile`), not from the extension or the
  browser's MIME type; Payload's `mimeTypes` list is a second check.
- **Only one way out:** `GET /files/submissions/<id>` (route handler). On every request it checks
  - logged-in student (session cookie, issued for this academy's host) who owns the file, **or**
  - staff (Payload session) holding `submissions.grade` in the file's academy and course scope;
  otherwise **404** (401 when not logged in at all). Responses are `Cache-Control: private, no-store`,
  `Content-Disposition: attachment` with a server-generated name, and `X-Content-Type-Options: nosniff`.
- Payload's own `/api/submission-files/file/<name>` endpoint is closed by an upload handler that always answers 404,
  so a guessed URL never streams a file, even for staff.
- Only server code creates these records (the submit action, after enrollment/deadline checks); the REST API cannot
  create, update or delete them (no hard delete; old files are detached from the submission, not removed).

## Consequences
- Files are not visible as thumbnails in `/admin`; graders download them through the route above.
- Backups must include the private upload volume/bucket; restoring the DB alone leaves dangling records.
- Detached files stay on disk until a retention job exists (`[client]`: how long to keep student work).
- Moving to S3 later changes only the storage adapter and the read in the route handler, not the access rules.
