# ADR 011 — WordPress migration (plugin bundle, REST fallback, source-shaped records)

**Status:** accepted (Farjad, 2026-11-06), stacks WooCommerce + LifterLMS + Tutor LMS. Built in E-032 phase 3.

**Amendments during the build** (the spec is `packages/integrations/src/wordpress/FORMAT.md`):
- The bundle is a **gzip NDJSON** file (manifest on the first line, HMAC signature on the last), not a zip, because PHP
  `ZipArchive` is often missing on Iranian shared hosts and Node reads gzip without a dependency.
- Mappers take the whole source index (`map(ctx)`), not one record at a time, because lesson order, enrollments and
  progress span records.
- Media is pulled **before** records, so course images and post HTML can point at the new files.
- Push nonces are stored in the `import-nonces` collection, short-lived security rows that are deleted after expiry.
- Connections are revoked automatically when their job finishes or is cancelled.
- Defaults for the open questions:
  - Raw data is purged 30 days after the job ends; abandoned drafts after 7 days.
  - Orders are imported when completed, processing or refunded. Other statuses are counted and skipped.
  - Quiz attempts are counted, not imported.
  - Media hosts outside the site must be approved by the admin in the dry run.

## Context
Most Iranian academies we can sign run on WordPress: WooCommerce + an Iranian theme course builder (Studiare),
Woo + a custom theme, Tutor LMS, LearnPress, LifterLMS (IBA, tenant #1). Moving means users, phones, courses,
lessons, orders, enrollments and progress — not just posts. Doresaz advertises WP migration; ours must be
self-serve, dry-run first, idempotent, and include orders, enrollments and progress
(`docs/research/wp-lms-landscape.md` §C–E, `docs/research/competitors.md` §5.1).

Facts that shape the design:
- Students log in with SMS OTP on `users.phone` (unique, global; users shared across tenants via `tenants[]`).
  We never need WP password hashes for students.
- Phones live in usermeta (`digits_phone`, `digits_phone_no`+`digt_countrycode`, `mobile`, `phone_number`,
  `billing_phone`) or on the order. WXR and core REST expose none of them.
- Woo Iranian stores report `IRT` (toman); prices may be `IRR`, `IRHR`, `IRHT`. Wrong factor = 10× money bug.
- Typical host: cheap Iranian shared hosting, PHP 7.4, `max_execution_time` 30–60 s, 128–256 MB, no SSH, no cron
  guarantee, sometimes outbound HTTP blocked or slow. IBA: WP 5.7.21, PHP 7.4, LifterLMS 4.21.3 (`lifterlmsfa`),
  Woo 5.4.4 legacy `shop_order`, Woo Memberships, Digits, Presto Player.

## Options compared

| | (a) Plugin "Edvora Migrator" (push or signed bundle) | (b) WP REST + app password (+ Woo ck/cs, LifterLMS key) | (c) SQL dump / WXR |
| --- | --- | --- | --- |
| Owner setup | Install zip, paste one-time code, click. ~5 min, no technical knowledge | Create app password, Woo keys, LifterLMS key; copy 3–5 secrets. Error-prone | WXR: Tools › Export, easy. SQL: phpMyAdmin export, scary; large dumps time out |
| Phones (usermeta) | Yes, all known meta keys + order billing phone | Only `billing_phone` via Woo customers; Digits/WP SMS meta not exposed | WXR: no. SQL: yes |
| LMS custom tables (progress, quiz attempts, Tutor/LearnPress tables) | Yes (direct `$wpdb` read) | Partial: LifterLMS REST has enrollments/progress; Tutor/LearnPress REST thin or absent | WXR: no. SQL: yes |
| Theme meta (Studiare course fields) | Yes (all postmeta) | Only meta registered with `show_in_rest` (usually not) | WXR: postmeta yes. SQL: yes |
| Orders | Yes, HPOS or legacy `shop_order` | Yes (Woo REST v3) | WXR: no (shop_order excluded). SQL: yes |
| Security | Scoped one-time secret, HMAC per request, read-only plugin; but our code runs on their server | Long-lived admin-equivalent credentials handed to us; we must store them encrypted | Whole DB incl. hashes, emails, other plugins' secrets lands with us (worst for PII) |
| Hosting limits | Chunked (500/kind), resumable, ≤ 20 s per chunk; download mode works when outbound HTTP is blocked | Their PHP serves our paginated calls — fine; we need inbound reachability from our server (Iran↔Iran usually OK) | WXR fine; SQL dump size and phpMyAdmin limits |
| Maintenance | One PHP plugin, kept thin (reads, no mapping) → changes rare | None on their side; we track REST shape per plugin version | WXR stable; SQL parser per schema/version is heavy |
| Testability | Fixtures = bundles exported from a docker WP | Recorded HTTP fixtures | WXR fixtures easy; SQL needs a parser test matrix |

Honest risks:
- **(a)** PHP code we ship runs on unknown hosts (fatal error = their site down) → defensive code, no autoload of
  heavy libs, `function_exists` guards, admin-only screens. Some hosts/security plugins block unknown plugins or
  zip uploads. Version drift of LMS table schemas. Customers may not update the plugin → mapping stays in TS.
- **(b)** Gaps are structural (phones, theme meta, Tutor progress); a REST-only migration of a Digits site leaves
  every student without a login. Credentials are powerful and long-lived unless the owner revokes them.
- **(c)** SQL: we receive data we must not keep (hashes, API keys of other plugins); parsing MySQL dumps is a
  project of its own; executing them is never acceptable. WXR: content only.

## Decision
1. **Primary: (a) plugin**, thin and read-only. It emits **source-shaped records** (WP data as-is, light
   normalisation only); all mapping lives in TypeScript (`packages/integrations/src/wordpress/`), so it is tested,
   versioned and fixed server-side without customers updating the plugin. Two delivery modes: **push** (chunks POSTed
   to the academy's Edvora URL) and **download** (signed `.edvora-bundle`, uploaded in Edvora admin).
2. **Fallback: (b) REST** for sites that cannot install plugins. It produces the same record kinds; missing data is
   listed in the dry-run report ("phones not available: N users will be held").
3. **(c) WXR only for posts, pages and media** (no users, orders or LMS). **SQL dump: deferred to v2**, ops-assisted,
   parse-only (never executed), behind super-admin.
4. Mappers v1 (phase 3): WooCommerce core (+ Zarinpal/Zibal/IDPay refs, Woo Memberships → enrollments), LifterLMS,
   Tutor LMS. Studiare once a sample DB exists (licence purchase needs Farjad). LearnPress next. LearnDash not v1.

Why: (a) is the only path that gets phones and progress on the hosts our customers actually use, and keeping it
thin means the risky surface (PHP on their server) is a small set of `SELECT`s.

## Architecture

### Interchange format (version 1)
Bundle = zip: `manifest.json`, one `records/<kind>.ndjson` per kind (split into `<kind>.<n>.ndjson` above 500
records), `signature` (hex HMAC-SHA256 of the raw `manifest.json` bytes). Push mode sends the same NDJSON chunks.

```jsonc
// manifest.json
{
  "format": "edvora-wp-export", "formatVersion": 1,
  "createdAtGmt": "2026-11-06T10:00:00Z",
  "connectionId": "cnx_…", "tenantSlug": "iba", "jobId": "…",          // binds bundle to one tenant + job
  "site": { "siteId": "sha256(home_url + db prefix)", "homeUrl": "https://iranbrandacademy.com",
            "wpVersion": "5.7.21", "phpVersion": "7.4.33", "locale": "fa_IR", "timezone": "Asia/Tehran",
            "permalinkStructure": "/%postname%/" },
  "plugins": [{ "slug": "lifterlms", "folder": "lifterlmsfa", "version": "4.21.3" }, { "slug": "woocommerce", "version": "5.4.4" }],
  "woo": { "currency": "IRT", "hpos": false, "priceDecimals": 0 },
  "files": [{ "path": "records/wp.user.1.ndjson", "kind": "wp.user", "count": 500, "sha256": "…" }],
  "pluginVersion": "1.0.0"
}
```

Record envelope, one JSON object per line:

```ts
type SourceRecord = {
  v: 1                        // envelope version
  kind: string                // 'wp.user' | 'wp.post' | 'wp.attachment' | 'wp.term' | 'woo.product' | 'woo.order'
                              // | 'woo.coupon' | 'woo.membership' | 'lifterlms.course' | 'lifterlms.lesson'
                              // | 'lifterlms.enrollment' | 'lifterlms.progress' | 'tutor.*' …
  wpId: string                // source primary key as string (composite keys joined with ':')
  data: Record<string, unknown> // row of the main table, column names untouched
  meta: Record<string, string | string[]> // postmeta/usermeta/termmeta, unserialised only when safe (see plugin)
  rel?: Record<string, string[]> // ids of related rows (terms, parent, order items)
}
```

```jsonc
{"v":1,"kind":"wp.user","wpId":"812","data":{"user_login":"09121234567","user_email":"a@example.com","user_registered":"2021-03-04 08:12:00","display_name":"سارا"},"meta":{"first_name":"سارا","digits_phone":"+989121234567","billing_phone":"۰۹۱۲۱۲۳۴۵۶۷","wp_capabilities":["subscriber"]}}
{"v":1,"kind":"woo.order","wpId":"5531","data":{"status":"wc-completed","currency":"IRT","total":"8470000","date_created_gmt":"2022-05-01 12:00:00","date_paid_gmt":"2022-05-01 12:03:10","customer_id":"812","payment_method":"WC_ZPal","transaction_id":"A00000000000000000000000000123456789"},"meta":{"_billing_phone":"09121234567"},"rel":{"items":["5531:77"]},"items":[{"id":"77","product_id":"340","name":"دوره برندسازی","qty":1,"total":"8470000"}]}
{"v":1,"kind":"lifterlms.lesson","wpId":"1204","data":{"post_title":"جلسه اول","post_name":"%d8%ac%d9%84%d8%b3%d9%87-%d8%a7%d9%88%d9%84","post_status":"publish","post_content":"<p>…</p>","menu_order":1,"post_modified_gmt":"2023-01-10 09:00:00"},"meta":{"_llms_parent_course":"1100","_llms_parent_section":"1150","_llms_video_embed":"https://…","_llms_free_lesson":"no"}}
```

`woo.order` may carry `items` (order line items are part of the order record). Unknown fields are kept; Zod
schemas per kind are `passthrough` for `data`/`meta` and strict for the envelope.

### TS adapter (`packages/integrations/src/wordpress/`)
```ts
interface WordPressSource {                       // where records come from
  manifest(): Promise<Manifest>
  read(kind: string, cursor: string | null, limit: number): Promise<{ records: SourceRecord[]; next: string | null }>
}
// BundleSource (zip on private storage), PushSource (chunks already stored by the ingest route),
// RestSource (app password + Woo ck/cs + LifterLMS key → same kinds), WxrSource, MockSource (fixtures).

interface StackMapper {
  id: 'woocommerce' | 'lifterlms' | 'tutor' | 'studiare' | 'wp-core'
  detect(m: Manifest): boolean                    // plugin slugs/folders + versions + sample meta keys
  kinds: readonly string[]                        // record kinds it consumes
  map(r: SourceRecord, ctx: MapContext): MapResult // pure: → EdvoraDraft[] + warnings, no I/O
}
type EdvoraDraft = { collection: 'users' | 'courses' | 'lessons' | 'orders' | 'enrollments' | 'coupons' | 'posts'
  | 'pages' | 'media' | 'redirects'; refKey: string; fields: Record<string, unknown>; dependsOn: string[] }
```
Detection: every mapper whose `detect` is true runs; `wp-core` always runs. Precedence for the same Edvora target
(e.g. course price): **WooCommerce product price wins over LMS plan price** (LifterLMS plans show placeholder `1` on
IBA). Conflicting detections (LifterLMS + Tutor both active) are reported, and the admin picks one in the dry run.
`MapContext` gives lookups (`resolveRef(kind, wpId)`), tenant currency and the warning sink — no Payload import, so
mappers are unit-tested in isolation. Pure money/phone/slug helpers go to `packages/core`.

### Pipeline
1. **Ingest** — push route `POST /api/import/push` (route handler, signature checked) or bundle upload in admin.
   Raw data goes to private storage (ADR 009 pattern: `PRIVATE_UPLOADS_DIR/import-bundles`, random names).
2. **Validate signature** — HMAC, timestamp, nonce, manifest `tenantSlug`/`jobId` match the connection; per-file
   sha256 matches. Any failure → job `rejected`, nothing parsed further.
3. **Detect** — pick mappers; record counts per kind; show stack summary.
4. **Map** — all records → drafts, in dependency order: users → media → terms → courses → lessons → coupons → orders →
   enrollments → progress → posts/pages → redirects.
5. **Dry-run diff** — per kind: create / update / unchanged / conflict / held / skipped, with warnings and a redirect
   preview. No writes except the job's report. Mandatory.
6. **Commit in batches** — after explicit confirm by a user with `import.run`. 200 drafts per transaction; refs
   written in the same transaction; cursor saved after each batch.
7. **Media pull** — background, see below.
8. **Redirects** — written last, once targets exist.
9. **Summary** — counts, held list, conflicts, CSV of redirects; audit-log entry `import.commit`.

### Collections (all tenant-owned, in `multiTenantPlugin.collections`, default deny, `delete: nobody`)
- **`import-connections`** — `label`, `secretHash` (sha256 of secret, hidden), `secretSealed` (AES-GCM, hidden;
  needed to verify HMAC — a hash alone cannot verify an HMAC), `job` (rel), `expiresAt`, `revokedAt`,
  `lastUsedAt`, `createdBy`. Read: `import.view`; create/revoke: `import.run` (via endpoint, not raw API writes).
- **`import-jobs`** — `status` (`draft|ingesting|ready|dry-run|awaiting-confirm|committing|media|done|failed|rejected|cancelled`),
  `mode` (`push|bundle|rest|wxr`), `site` (json: siteId, homeUrl, versions), `mappers` (text[]), `bundleFile`
  (private path), `cursors` (json `{ [kind]: string|null }`), `counts` (json), `report` (json, dry-run diff),
  `warnings` (array: code, kind, wpId, message), `confirmedBy`, `confirmedAt`, `startedAt`, `finishedAt`,
  `purgeAfter`, `error`. Updates only by server code.
- **`import-refs`** — `site` (siteId), `kind`, `wpId`, `targetCollection`, `targetId`, `sourceChecksum`,
  `writtenChecksum`, `status` (`linked|held|conflict|skipped`), `heldData` (json, minimal PII for held users),
  `job`. Unique index `(tenant, site, kind, wpId)`. Read `import.view`, write server-only.
- **`redirects`** — `from` (normalised path, unique per tenant), `to`, `code` (301 default), `source`
  (`wp-import|manual`), `job`, `hits`, `active`. Read: public via server query only (no REST read for guests);
  edit: `content.edit`.
- **Users:** add **`contactEmail`** (email, not unique, not auth, hidden behind `users.view_sensitive`). Decided:
  yes — the auth email of OTP users is a placeholder, and every academy (not only imports) needs a real email for
  receipts. Imported WP email goes there, never into `email`, so a WP email cannot collide with or take over
  another tenant's staff login.
- Orders: add `source` (`site|import`) and payment `provider: 'imported'`; courses/posts/media/pages reuse E-030's
  `sourceUrl`.

### Permissions
Append a group to `packages/core/src/permissions.ts`: `migration: ['import.view', 'import.run']`. Academy-grantable,
not platform. Default academy-admin role gets both (seed + migration of the enum). `import.run` also requires the
caller to hold it in the job's tenant; `users.import` (CSV) is unrelated and unchanged.

### Idempotency and conflicts
- `refKey = <siteId>:<kind>:<wpId>` (+ `#<lineItemId>` for order lines: one Woo order with two courses becomes two
  Edvora orders — our order has one course).
- `sourceChecksum` = sha256 of the canonical record; equal → **unchanged**, skip.
- `writtenChecksum` = sha256 of the mapped fields we wrote. On re-run, recompute the same fields from the Edvora
  doc: equal → safe **update**; different → edited in Edvora → **conflict**, not overwritten, listed in the report.
- Never delete. Records missing from WP on re-run are reported as `gone`, Edvora docs stay.

### Resumability
The repo has no queue today (no `jobs` in `payload.config.ts`, no cron). Decision: **Payload jobs queue** with two
tasks, `importCommitBatch` and `importMediaBatch`, each processing one batch within a 20 s budget then re-queuing
itself with the saved cursor; `autoRun` every minute on the app server (Railway is a long-running Node process).
A polling route alone was rejected because closing the admin tab would stall a 30k-user import. The admin screen
polls `GET /api/import-jobs/:id/progress` for display only. Crash mid-batch → transaction rolled back → batch
re-runs from the last cursor; refs make it idempotent anyway.

### Media pull
Edvora fetches from the customer's WP URLs (`wp.attachment.guid`/`_wp_attached_file` + `homeUrl`), never
hot-links at runtime. Rules: same host as `homeUrl` (or a CDN host the admin approves in the dry run);
HTTPS preferred, HTTP allowed only for that host; no private/loopback IPs after DNS resolution (SSRF); ≤ 4 parallel,
≤ 50 MB/file (images ≤ 10 MB); allow-list by magic bytes (JPG, PNG, WebP, GIF, SVG→refused, PDF, MP3; video files
are **not** pulled — listed for manual move to VOD); 3 retries with backoff; failures listed, never fatal. Rewrites
`wp-content/uploads/...` URLs in imported HTML to the new media URL. SpotPlayer/Presto/DRM embeds → warning,
manual action.

### Redirects serving
Next 16 has `proxy.ts` (ex-middleware), but a DB lookup on every request there is waste. Decision: **not-found
fallback** — a lowest-priority catch-all `app/(frontend)/[...wpPath]/page.tsx` resolves the tenant with
`lib/tenant.ts` (real request, Host intact — ADR 005 only concerns server-action redirects), looks up
`redirects` by normalised path, then `permanentRedirect()` (308, treated as permanent by search engines) or
`notFound()`. WP query URLs on `/` (`?p=`, `?page_id=`, `?product=`, `?post_type=…`) are checked in the home
page before rendering. Normalisation: `decodeURIComponent`, Unicode NFC, Persian `ي/ك` → `ی/ک`, lowercase Latin,
strip trailing slash. Persian slugs are kept as-is in Edvora. CSV export for the host's own redirect rules.

### Users
- Phone priority: `digits_phone` → `digt_countrycode`+`digits_phone_no` → `mobile` → `phone_number` →
  `billing_phone` → latest order billing phone; each through `normalizeIranMobile`. Non-Iranian numbers held.
- Existing Edvora user with that phone (any tenant) → add tenant to `tenants[]` only; never overwrite their profile.
- Same phone on two WP users → both **held** in the review queue; no silent merge.
- No phone → **held** in `import-refs.heldData` (name, WP email, wpId); no Edvora user is created until an admin
  adds a phone in the review queue, then a resume creates it and attaches their held orders/enrollments.
- WP admins/editors/instructors are imported as plain users and listed for manual role assignment; never granted
  staff roles automatically.
- **No password hashes imported.** Verifying WP hashes on first login is feasible in Node (`$P$` phpass = iterated
  md5 via `node:crypto`; `$wp$2y$` = bcrypt via bcryptjs over base64(HMAC-SHA384(pw, "wp-sha384")); plain md5;
  `$2y$`), but rejected: students use OTP and never type a password; staff re-onboard with password + TOTP
  (ADR 007), which is safer than carrying old hashes. Could be added later for an email-login tenant.

### Money and dates
`toRial(amount: string, currency: 'IRR'|'IRT'|'IRHR'|'IRHT'): Rial` in `packages/core/src/money.ts`: decimal
string parsed without floats (digits normalised, `,`/`٬` separators stripped), factors IRR×1, IRT×10, IRHR×1000,
IRHT×10 000; fractional result or unknown currency → throws, record **skipped** with warning. Currency per order
(`currency` column), else `woo.currency`, else LMS option. Dates from `*_gmt` columns as UTC; if a GMT column is
zero (`0000-00-00`) fall back to local column + manifest timezone; Jalali only for display.

### Persian normalisation
Text: `ي`→`ی`, `ك`→`ک`, NFC, keep ZWNJ; HTML kept but sanitised (no `<script>`, `on*`, iframes except VOD
allow-list). Digits: `toLatinDigits` for phones/codes/IDs; national codes imported only when present and
checksum-valid, else dropped.

### Token security
- Admin creates a connection → secret (32 random bytes, base64url) shown **once**; stored as sha256 hash +
  sealed copy (AES-256-GCM, key from `PAYLOAD_SECRET`, same as TOTP). Scope: one tenant + one job. Expires 72 h,
  revocable, rate limit 60 req/min per connection.
- Each push request: `X-Edvora-Connection`, `X-Edvora-Timestamp` (unix s), `X-Edvora-Nonce` (16 bytes hex),
  `X-Edvora-Signature = hex(HMAC-SHA256(secret, method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + hex(sha256(body))))`
  — the brief's fields in its order, joined by `\n` so field boundaries are unambiguous; `path` includes the query.
  ±5 min window; nonce stored per connection for 10 min (replay → 401); constant-time compare.
- HTTPS required except `localhost`/`*.localhost`. Bundle: `signature` over manifest, manifest carries per-file
  sha256, so one HMAC covers all files. A bundle for tenant A uploaded on tenant B → rejected (tenant + job bound).

### PII and retention
Import only mapped fields. Raw bundles/chunks in private storage, purged 30 days after `finishedAt` `[confirm]`
(`purgeAfter`; a purge task in the same queue). `heldData` purged with it. Every connection, dry run, confirm and
commit is written to `audit-logs`. Hashes, sessions, other plugins' options are never exported by the plugin.

### Plugin constraints
WP coding standards; PHP 7.4+, WP 5.6+; capability `manage_options` on every screen and AJAX action; nonces on
every form; read-only on the WP DB; no external calls except the configured Edvora URL; no files in public dirs
(bundle streamed on download; temp files in `wp-content/uploads/edvora-migrator-<random>/` with `.htaccess deny` +
`index.php`, wiped after 24 h and on deactivate); unserialise with `allowed_classes => false`; chunks sized to stay
under 20 s / 64 MB; uninstall removes its options and temp dir. Distributed only from inside Edvora admin, never
published on wordpress.org.

### Testing
- Fixtures: `docker-compose` WordPress (5.7/PHP 7.4 and latest/PHP 8.2) with WooCommerce (legacy + HPOS),
  LifterLMS, Tutor, Digits-like usermeta and sample Persian data (Persian slugs, `ي/ك`, Persian digits, IRT and IRR
  stores). Bundles exported from it are committed as fixtures; `MockSource` serves them.
- Vitest: `toRial` (all factors, fractions, unknown), signature (vectors, replay, clock skew), phone priority,
  each mapper (golden drafts), checksum/conflict rule, slug/path normalisation.
- Playwright: admin import flow on `localhost:3000` and `demo.localhost:3000` (bundle upload → dry run → confirm →
  summary; cross-tenant bundle refused; redirect hit on both hosts).
- PHP: lint on 7.4 and 8.2, plus a smoke run on the docker WP.

## Relation to E-030
E-030 scrapes IBA's public pages into courses/posts/pages with `sourceUrl`. Once the LifterLMS mapper ships, IBA
can be re-imported through this pipeline (plugin or public LifterLMS REST); records E-030 created are matched by
`sourceUrl` and linked into `import-refs` rather than duplicated. E-030 must merge first.

## Shared-file rebase risk
`payload.config.ts` (collections, multi-tenant list, `jobs`), `payload-types.ts` (regenerate, never hand-merge),
`migrations/` (one migration for E-032, created last, after rebasing on `develop`), `packages/core/src/permissions.ts`
(enum migration), `Users.ts`, `Orders.ts`. Rebase before `migrate:create`; regenerate types after.

## Consequences
- New PHP artefact to version and support; a second runtime (PHP 7.4) in CI.
- First use of the Payload jobs queue: needs a single autoRun owner in multi-instance deploys.
- Phone-less WP users don't exist in Edvora until fixed: academies see a clear held list instead of ghost accounts.
- Staff must re-enrol (password reset + optional TOTP); communicated in the migration checklist.
- Redirects use 308; some SEO tools print "not 301" — acceptable, documented.

## Open questions
1. Bundle retention 30 days — confirm (Farjad).
2. Buy a Studiare licence for a sample DB (Farjad, cost).
3. Who may run imports on paid plans: academy admin self-serve, or Edvora staff first for the first N customers?
4. Do we import Woo orders in `pending/failed/cancelled` status, or only `completed/processing/refunded`?
5. Progress granularity: LifterLMS lesson completion maps to `completedLessons`; quiz attempts imported or summary
   only?
6. CDN hosts for media (Arvan CDN in front of WP) — admin-approved list per job, or auto-detected?
