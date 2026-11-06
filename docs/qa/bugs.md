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
