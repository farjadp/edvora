# QA bugs

Format: ID · title · severity (blocker/major/minor) · tenant · steps · expected · actual · evidence · suspected area.
Developer agents fix; QA re-tests and closes.

## QA-001 · `pnpm db:up` fails: `minio/minio` image can't be pulled
- **Severity:** major (blocks a fresh local setup; Postgres alone still works)
- **Tenant:** n/a (local stack)
- **Steps:** on a machine without the image cached, run `pnpm db:up`.
- **Expected:** all services in `infra/docker/compose.local.yml` start.
- **Actual:** `Error response from daemon: pull access denied for minio/minio, repository does not exist or may require 'docker login'`; the command exits 1. Postgres was already running, so E2E still worked.
- **Evidence:** terminal output during E-010 (2026-11-06).
- **Suspected area:** `infra/docker/compose.local.yml` — pin a pullable image/tag (or make MinIO optional with a compose profile, since nothing uses it yet). Also let CI/local E2E bring up only `postgres`.

## QA-002 · `pnpm seed` is not a fresh seed: re-runs keep orders, users and `seatsTaken`
- **Severity:** minor (test-data hygiene)
- **Tenant:** demo
- **Steps:** run `pnpm seed`, complete a checkout on `demo.localhost:3000`, run `pnpm seed` again.
- **Expected:** the board/E2E brief says "seed fresh"; a run should start from known data.
- **Actual:** seed is an idempotent upsert. Orders, students and the cohort's `seatsTaken` survive. After ~30 paid E2E runs against the same DB the demo cohort (30 seats) fills up and checkout fails with «ظرفیت این دوره تکمیل شده است».
- **Evidence:** `apps/web/src/seed/run.ts` (upsert by natural key; cohort upsert doesn't reset `seatsTaken`).
- **Suspected area:** seed — add a `pnpm seed --reset` (or `db:reset`) that truncates demo transactional data. CI is unaffected (fresh Postgres service per run). E2E uses random `0912000xxxx` numbers so it tolerates old data.

## QA-003 · React warns about the inline `<script>` in the frontend layout
- **Severity:** minor
- **Tenant:** both
- **Steps:** `pnpm dev`, open any page, read the browser console / dev server log.
- **Expected:** no warnings.
- **Actual:** `Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client.`
- **Evidence:** `[WebServer] [browser]` line in every E2E run.
- **Suspected area:** `apps/web/src/app/(frontend)/layout.tsx:40` (theme script via `dangerouslySetInnerHTML`). It runs on the server-rendered HTML so the theme works today, but a client re-render won't run it. Consider `next/script` with `strategy="beforeInteractive"` (self-hosted, inline), keeping the no-external-scripts rule.

# E-032 · WordPress migration (QA pass, 2026-11-06)

Tests that pin these bugs are marked `QA-E032-NN` (`test.fail` / `it.fails`); remove the marker when fixed.

## QA-E032-01 · A bundle from an expired connection is accepted and can be run
- **Severity:** major (security; W1 "expires in 72 h", W3)
- **Tenant:** demo (any)
- **Steps:** create a connection; set `import_connections.expires_at` in the past; upload a bundle signed with its secret on `/staff/import`.
- **Expected:** rejected with `connection_expired` («کد اتصال این فایل منقضی شده است…»), like a revoked one.
- **Actual:** job reaches `awaiting-confirm` and can be confirmed. Push mode refuses expired connections correctly (401 `connection_expired`).
- **Evidence:** `e2e/tests/wp-import-scenarios.spec.ts` "an expired connection's bundle is refused" (expected fail); SQL: job 77 `awaiting-confirm`, connection expired.
- **Suspected area:** `lib/wpimport/service.ts` `ingestBundle` only checks `revokedAt`; `rejectMessage` already has `connection_expired`. Use `connectionUsable()`.

## QA-E032-02 · After "add phone" / "keep or use WordPress version" the page does not refresh
- **Severity:** minor (action succeeds, admin gets no feedback)
- **Steps:** open a dry-run report with held users, type a phone, click «افزودن شماره». Same for conflict buttons on the summary.
- **Expected:** list updates (user leaves "held"), or a success notice.
- **Actual:** nothing visible. Actions answer `redirectTo: /staff/import/<id>#held` (`#conflicts`); `window.location.assign` to the same URL plus a hash does not reload, and `Feedback` hides the message when `redirectTo` is set. Choice is saved (checked in DB); a manual reload shows it.
- **Evidence:** `wp-import-scenarios.spec.ts` (reload workaround, comment QA-E032-02); screenshot of stale list in test-results.
- **Suspected area:** `actions.ts` `setHeldPhoneAction`, `resolveConflictAction`; `ImportForms.tsx` `useNavigate` (use `location.reload()` when only the hash differs, or drop the hash).

## QA-E032-03 · REST fallback can be aimed at private / loopback addresses (SSRF)
- **Severity:** major (security)
- **Steps:** as an academy admin with `import.run`, start a REST import with site URL `https://10.0.0.5`, `https://169.254.169.254`, `https://127.0.0.1:5432`, or (any host, even in production) `http://localhost:PORT`.
- **Expected:** refused before any request; credentials never sent.
- **Actual:** `RestSource` only checks https/local-http and uses plain `fetch` (no guarded lookup, unlike media pulls). The application password is sent to the target; HTTP status / "Non-JSON response" differences land in the job error, which is a port-scan oracle. The action's Zod rule explicitly allows `http://localhost|127.0.0.1|*.localhost` regardless of environment.
- **Evidence:** `packages/integrations/src/wordpress/qa-e032.test.ts` (`it.fails`).
- **Suspected area:** `apps/web/.../import/actions.ts` `RestInput`, `packages/integrations/src/wordpress/sources.ts` `RestSource`. Reuse `isPrivateAddress` + `guardedLookup`; allow local hosts only when `NODE_ENV !== 'production'`.

## QA-E032-04 · Phone numbers with invisible direction marks / ZWNJ are "invalid"
- **Severity:** minor (login and import)
- **Steps:** `normalizeIranMobile('‏09121234567')` (RLM), LRM, LRE…PDF, or ZWNJ inside the number.
- **Expected:** `09121234567`. **Actual:** `null` (login says invalid; imported user is held). NBSP, BOM, tabs are fine.
- **Evidence:** `packages/core/src/wpimport-qa.test.ts` (`it.fails`).
- **Suspected area:** `packages/core/src/phone.ts` (strip U+200B–200F, U+202A–202E, U+2066–2069).

## QA-E032-05 · Horizontally scrollable tables are not keyboard accessible
- **Severity:** minor (a11y, serious by axe `scrollable-region-focusable`)
- **Steps:** open a dry-run report at 375 px; run axe.
- **Actual:** counts table and redirect preview sit in `.overflow-x-auto` boxes without `tabindex="0"` / role+label.
- **Evidence:** `e2e/tests/wp-import-layout.spec.ts` (test.fail); `[job]/page.tsx` `CountsTable`, `RedirectTable`.

## QA-E032-06 · No cancel and no resume (W7p, W18)
- **Severity:** major (W18 is P1: "resume after failure")
- **Steps:** look for cancel/resume controls on a `committing` or `failed` job.
- **Actual:** no actions exist; status `cancelled` is never set. A job marked `failed` by `markFailed` cannot continue (the tasks only run for `media`/`committing`), the admin can only re-upload and start a new run (which is idempotent, so data is safe).
- **Suspected area:** `actions.ts` (add cancel/resume), `service.ts`, `tasks.ts`.

## QA-E032-07 · Raw data of unfinished jobs is never purged automatically (W21)
- **Severity:** major (PII retention)
- **Steps:** upload a bundle (or push) and leave it at `awaiting-confirm`, or let a job end `failed`/`cancelled`.
- **Expected:** raw bundle / chunks / sealed REST credentials removed after the retention period.
- **Actual:** the purge task is queued only in `finishJob` for `done` jobs. Other jobs keep `bundleFile`, `chunks`, `restSealed` indefinitely (rejected jobs are cleaned). Only the manual «حذف» button works.
- **Suspected area:** `commit.ts` `finishJob`/`purgeJob`, `tasks.ts` (add a sweep by `createdAt`/`updatedAt` for non-done jobs).

## QA-E032-08 · Connection stays valid after the import finished (W19)
- **Severity:** minor (PRD marks it `[confirm]`)
- **Actual:** after `done` the secret keeps working for the rest of the 72 h (push of new data starts a new run). Consider auto-revoke on finish or a visible "revoke now" prompt in the summary.

## QA-E032-09 · Plugin exports `post_password`; temp folder relies on `.htaccess`
- **Severity:** minor
- **Actual:** `class-exporter.php` `fetch_posts` uses `SELECT p.*` and sends `post_password` (shared password of protected posts) in the bundle. The private temp folder (`uploads/edvora-migrator-<24 hex>/records-<24 hex>.ndjson`, uncompressed PII) is protected by `.htaccess` + `index.php` only; on nginx it is served if the URL is guessed (96-bit random, so low risk), and it is not deleted if the admin never downloads (cron cleans after 24 h).
- **Suggested:** unset `post_password`; document nginx; optionally write the temp file outside `uploads` when possible.

## QA-E032-10 · Persian copy typo on the purge button
- **Severity:** minor. «حذف همین حالای دادهٔ خام» → «حذف همین حالا…» (`ImportForms.tsx` `PurgeButton`).

## QA-E032-11 · Several P1 stories are only partly built
- **Severity:** major for W23 (P1), minor for the rest; listed so they are not mistaken for passes.
- W23: no notice after OTP signup "if you bought on the old site, your phone may differ…" (nothing in login/dashboard).
- W8a: only "add a phone"; no "skip B / link B's orders to A" choice. W8b: no "needs phone" CSV export. W8f: no inactive-users choice.
- W22a: no heads-up SMS. W24: static "next steps" list only; no 10-sample-URL 301 test, DNS/SSL checks.
- W16: redirects answer 308 (documented decision) and imported courses are drafts, so an old URL redirects to a page that is 404 until the admin publishes.
