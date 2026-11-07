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
- **QA re-verify 2026-11-06:** CLOSED (bundle spec un-marked, green).
- **Status:** fixed in `5d5afaa` (tech-lead) — `ingestBundle` uses `connectionUsable()`; QA test un-marked.
- **Severity:** major (security; W1 "expires in 72 h", W3)
- **Tenant:** demo (any)
- **Steps:** create a connection; set `import_connections.expires_at` in the past; upload a bundle signed with its secret on `/staff/import`.
- **Expected:** rejected with `connection_expired` («کد اتصال این فایل منقضی شده است…»), like a revoked one.
- **Actual:** job reaches `awaiting-confirm` and can be confirmed. Push mode refuses expired connections correctly (401 `connection_expired`).
- **Evidence:** `e2e/tests/wp-import-scenarios.spec.ts` "an expired connection's bundle is refused" (expected fail); SQL: job 77 `awaiting-confirm`, connection expired.
- **Suspected area:** `lib/wpimport/service.ts` `ingestBundle` only checks `revokedAt`; `rejectMessage` already has `connection_expired`. Use `connectionUsable()`.

## QA-E032-02 · After "add phone" / "keep or use WordPress version" the page does not refresh
- **Status:** fixed in `d284b40` — hash-only redirects force a reload; actions add `?notice=…`; QA reload workarounds removed.
- **Severity:** minor (action succeeds, admin gets no feedback)
- **Steps:** open a dry-run report with held users, type a phone, click «افزودن شماره». Same for conflict buttons on the summary.
- **Expected:** list updates (user leaves "held"), or a success notice.
- **Actual:** nothing visible. Actions answer `redirectTo: /staff/import/<id>#held` (`#conflicts`); `window.location.assign` to the same URL plus a hash does not reload, and `Feedback` hides the message when `redirectTo` is set. Choice is saved (checked in DB); a manual reload shows it.
- **Evidence:** `wp-import-scenarios.spec.ts` (reload workaround, comment QA-E032-02); screenshot of stale list in test-results.
- **Suspected area:** `actions.ts` `setHeldPhoneAction`, `resolveConflictAction`; `ImportForms.tsx` `useNavigate` (use `location.reload()` when only the hash differs, or drop the hash).

## QA-E032-03 · REST fallback can be aimed at private / loopback addresses (SSRF)
- **Status:** fixed in `0b9ed41` — `checkPublicHost` (DNS-resolved, private/loopback/link-local refused) before every REST request and in the action; http://localhost only outside production; QA test un-marked. Residual: DNS rebinding between check and connect (global `fetch` cannot pin the address).
- **Severity:** major (security)
- **Steps:** as an academy admin with `import.run`, start a REST import with site URL `https://10.0.0.5`, `https://169.254.169.254`, `https://127.0.0.1:5432`, or (any host, even in production) `http://localhost:PORT`.
- **Expected:** refused before any request; credentials never sent.
- **Actual:** `RestSource` only checks https/local-http and uses plain `fetch` (no guarded lookup, unlike media pulls). The application password is sent to the target; HTTP status / "Non-JSON response" differences land in the job error, which is a port-scan oracle. The action's Zod rule explicitly allows `http://localhost|127.0.0.1|*.localhost` regardless of environment.
- **Evidence:** `packages/integrations/src/wordpress/qa-e032.test.ts` (`it.fails`).
- **Suspected area:** `apps/web/.../import/actions.ts` `RestInput`, `packages/integrations/src/wordpress/sources.ts` `RestSource`. Reuse `isPrivateAddress` + `guardedLookup`; allow local hosts only when `NODE_ENV !== 'production'`.

## QA-E032-04 · Phone numbers with invisible direction marks / ZWNJ are "invalid"
- **Status:** fixed in `8204cd0` — `normalizeIranMobile` strips U+200B–200F, U+202A–202E, U+2066–2069, BOM; QA test un-marked.
- **Severity:** minor (login and import)
- **Steps:** `normalizeIranMobile('‏09121234567')` (RLM), LRM, LRE…PDF, or ZWNJ inside the number.
- **Expected:** `09121234567`. **Actual:** `null` (login says invalid; imported user is held). NBSP, BOM, tabs are fine.
- **Evidence:** `packages/core/src/wpimport-qa.test.ts` (`it.fails`).
- **Suspected area:** `packages/core/src/phone.ts` (strip U+200B–200F, U+202A–202E, U+2066–2069).

## QA-E032-05 · Horizontally scrollable tables are not keyboard accessible
- **Status:** fixed in `d284b40` — scroll containers are `role="region"` with `tabIndex=0` and a label; QA test un-marked and the axe exclusion removed.
- **Severity:** minor (a11y, serious by axe `scrollable-region-focusable`)
- **Steps:** open a dry-run report at 375 px; run axe.
- **Actual:** counts table and redirect preview sit in `.overflow-x-auto` boxes without `tabindex="0"` / role+label.
- **Evidence:** `e2e/tests/wp-import-layout.spec.ts` (test.fail); `[job]/page.tsx` `CountsTable`, `RedirectTable`.

## QA-E032-06 · No cancel and no resume (W7p, W18)
- **Status:** fixed in `f7495c3` — cancel (any non-final state, stops after the current batch, nothing deleted, audited) and resume (failed/cancelled → re-queued from the saved cursor; never-confirmed → re-planned). E2E: `wp-import.spec.ts`.
- **Severity:** major (W18 is P1: "resume after failure")
- **Steps:** look for cancel/resume controls on a `committing` or `failed` job.
- **Actual:** no actions exist; status `cancelled` is never set. A job marked `failed` by `markFailed` cannot continue (the tasks only run for `media`/`committing`), the admin can only re-upload and start a new run (which is idempotent, so data is safe).
- **Suspected area:** `actions.ts` (add cancel/resume), `service.ts`, `tasks.ts`.

## QA-E032-07 · Raw data of unfinished jobs is never purged automatically (W21)
- **Status:** fixed in `f7495c3` — daily `importSweep` task purges raw data of failed/cancelled/rejected jobs and of jobs waiting > 30 days (marked cancelled), drafts > 7 days, and `done` jobs past `purgeAfter`. No e2e (time-based); logic in `commit.ts sweepImports`.
- **Severity:** major (PII retention)
- **Steps:** upload a bundle (or push) and leave it at `awaiting-confirm`, or let a job end `failed`/`cancelled`.
- **Expected:** raw bundle / chunks / sealed REST credentials removed after the retention period.
- **Actual:** the purge task is queued only in `finishJob` for `done` jobs. Other jobs keep `bundleFile`, `chunks`, `restSealed` indefinitely (rejected jobs are cleaned). Only the manual «حذف» button works.
- **Suspected area:** `commit.ts` `finishJob`/`purgeJob`, `tasks.ts` (add a sweep by `createdAt`/`updatedAt` for non-done jobs).

## QA-E032-08 · Connection stays valid after the import finished (W19)
- **Status:** fixed in `f7495c3` — the job's connection is revoked (audited) when the job is done, cancelled or swept. A re-import uses "plan again with the same data" or a new connection.
- **Severity:** minor (PRD marks it `[confirm]`)
- **Actual:** after `done` the secret keeps working for the rest of the 72 h (push of new data starts a new run). Consider auto-revoke on finish or a visible "revoke now" prompt in the summary.

## QA-E032-09 · Plugin exports `post_password`; temp folder relies on `.htaccess`
- **Status:** fixed in `a3ff6b1` — `post_password` unset; temp folder name 32 hex; `web.config` deny added; readme documents the nginx rule.
- **Severity:** minor
- **Actual:** `class-exporter.php` `fetch_posts` uses `SELECT p.*` and sends `post_password` (shared password of protected posts) in the bundle. The private temp folder (`uploads/edvora-migrator-<24 hex>/records-<24 hex>.ndjson`, uncompressed PII) is protected by `.htaccess` + `index.php` only; on nginx it is served if the URL is guessed (96-bit random, so low risk), and it is not deleted if the admin never downloads (cron cleans after 24 h).
- **Suggested:** unset `post_password`; document nginx; optionally write the temp file outside `uploads` when possible.

## QA-E032-10 · Persian copy typo on the purge button
- **Status:** fixed in `d284b40`.
- **Severity:** minor. «حذف همین حالای دادهٔ خام» → «حذف همین حالا…» (`ImportForms.tsx` `PurgeButton`).

## QA-E032-11 · Several P1 stories are only partly built
- **Status:** partly fixed in `d284b40` — W23 (dashboard notice + request after an import, stored as an `import-claim` lead and listed next to held users; admin links by entering the student's phone, audited, never by email), W8a "skip" (and "add phone"), W8b held-users CSV (`import.run`, audited), "plan again with the same data" on finished jobs. **Still open:** W8a "link B's orders to A", W8f inactive-users choice, W22a heads-up SMS, W24 go-live checklist / 10-URL test, W16 308-vs-301 and redirects to draft courses (documented decision).
- **Severity:** major for W23 (P1), minor for the rest; listed so they are not mistaken for passes.
- W23: no notice after OTP signup "if you bought on the old site, your phone may differ…" (nothing in login/dashboard).
- W8a: only "add a phone"; no "skip B / link B's orders to A" choice. W8b: no "needs phone" CSV export. W8f: no inactive-users choice.
- W22a: no heads-up SMS. W24: static "next steps" list only; no 10-sample-URL 301 test, DNS/SSL checks.
- W16: redirects answer 308 (documented decision) and imported courses are drafts, so an old URL redirects to a page that is 404 until the admin publishes.

## QA-E032-12 · `rich-text.spec.ts` fails on a freshly seeded database
- **Status:** fixed in `d284b40` — demo seed creates `demo.png` (alt «نمونه تصویر demo»).
- **Severity:** minor (test data; pre-existing from E-031, found during the E-032 full run)
- **Steps:** new DB, `payload migrate`, `pnpm seed`, `pnpm e2e`.
- **Actual:** `src/seed/e2e-richtext.ts` throws `Not found: demo media` because it expects a `demo.png` media row in demo that no seed creates. The spec then fails in `beforeAll`.
- **Suspected area:** `apps/web/src/seed/run.ts` (create the demo media) or make `e2e-richtext.ts` create it.

## E-032 re-verification (QA, fresh DB `edvora_qa032b`, after commits 8204cd0..6ac5b28)
| ID | Verdict |
| --- | --- |
| 01 expired bundle | CLOSED (e2e un-marked, green) |
| 02 stale UI | CLOSED (scenario reload workaround gone, green) |
| 03 REST SSRF | CLOSED (`it.fails` removed, integrations 74/74); not exercised through the UI |
| 04 bidi phones | CLOSED (core 183/183) |
| 05 table a11y | CLOSED (axe clean at 375/desktop, light/dark) |
| 06 cancel/resume | CLOSED for resume (e2e "a failed run resumes from its saved cursor"); cancel verified by code read only, no automated test, FOLLOW-UP |
| 07 retention of unfinished jobs | CLOSED by code read (daily `importSweep`); no automated test for the sweep, FOLLOW-UP (add one) |
| 08 auto-revoke | CLOSED (scenarios re-open the reused connection) |
| 09 plugin post_password / temp dir | CLOSED (static review tests + lint 7.4/8.2 re-run by dev; QA PK qa tests green) |
| 10 typo | CLOSED |
| 11 partial stories | W23, W8a skip+add phone, W8b CSV: CLOSED (e2e "held users: CSV… and the student-side request"). Still open, declared: W8a move-orders, W8f, W22a, W24, 308 vs 301: FOLLOW-UP (not release blockers) |
| 12 rich-text on fresh DB | Seed now creates `demo.png`, but on a machine whose media folder already has `demo.png` Payload stores `demo-1.png` and `rich-text.spec` still fails there (not on a clean checkout/CI). OPEN minor, FOLLOW-UP: look the media up by alt or `demo*.png` in `e2e-richtext.ts` |
