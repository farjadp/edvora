# ADR 010 — Self-serve demo sandboxes (E-029)

**Status:** proposed (2026-11-06, tech-lead) — product defaults marked *default pending Farjad*

## Context
`docs/product/sandbox-demo.md` asks for a public `/demo` that gives a visitor, in under 10 s, an admin and a student
login to their **own** throw-away academy for 3 hours, with nothing able to touch another tenant, send a message or
move money. Constraints: tenants are resolved from the Host header (ADR 004); server actions must not `redirect()` to
same-site pages (ADR 005); access reads the DB on every request (ADR 006); `/admin` is open to any staff (ADR 008);
deletes are denied everywhere; no external runtime services; the demo runs on Railway's generated host
(`*.up.railway.app`), where we cannot add DNS records, let alone a wildcard.

## Decisions

### 1. Routing: a signed selector cookie on the platform host (not path, not wildcard subdomain)
- **Wildcard subdomains** (`sbx-x.demo.edvora…`) need wildcard DNS + TLS. Not possible on `*.up.railway.app`, and
  on an Iranian host it means wildcard certificates before the first demo. Rejected for now.
- **Path prefix** (`/s/<slug>/staff/…`) would touch every link, route and redirect in the app and every future
  page; one missed link drops the visitor into the default academy. Rejected.
- **Chosen: cookie switch.** `edvora_sbx` = HMAC-signed `{tid, exp}` (purpose-bound key `SESSION_SECRET:sandbox`),
  httpOnly, SameSite=Lax, host-only. `getCurrentTenant()` honours it **only** on hosts in `SANDBOX_PLATFORM_HOSTS`
  (default: the host of `NEXT_PUBLIC_SITE_URL`) and **only** for tenants with `isSandbox = true`, so it can never
  switch a request to a real academy, and academy domains ignore it entirely. Everything downstream (student session
  bound to `tid`, staff gate, desks, public pages, checkout callbacks via `lib/origin.ts`) works unchanged because the
  host stays the same.
- ADR 005 holds: creation is a JSON route handler; «ورود»/«ادامه», the login address and the password form are
  route handlers answering **303**; the selector is set on the same response, so the next full navigation already
  resolves the sandbox. No server action redirects.
- Second device: «نشانی ورود» = `/demo/s/<slug>` (GET → sets the selector → 303 `/demo/login`). Slugs are
  `sbx-` + 10 random chars; selecting a sandbox shows only its fictional public pages, accounts still need passwords.
- Cost: one browser = one sandbox view on the platform host. A real staff member who opens a demo in the same browser
  is "inside" it until «خروج» (`POST /demo/leave`) — acceptable for a sales tool; documented for QA.

### 2. Tenant-level flags, accounts tied to the sandbox
`tenants.isSandbox`, `expiresAt`, `purgeAt` (system-only fields; a sandbox account touching them, or slug, domains,
plan, features, gateway → **403** from a `beforeOperation` hook). `users.sandboxTenant` marks every sandbox account
(set by server code, or forced to the actor's own sandbox when a sandbox admin creates someone). Memberships in a
sandbox are clamped to the sandbox expiry on every write (E3, S5). Platform-owned `demo-sandboxes` (one row per
demo: status, expiry, IP hash, build time, single-use PoW nonce, creator-key hash) and `demo-leads` (consented emails
only) are **not** tenant-owned, so no academy admin can read them and they survive cleanup (daily IP cap, O5 counts).
Every sandbox is created through `lib/academies.ts#createAcademy`, the same path a new academy uses, so it inherits
new-academy defaults (role templates today; gamification once E-028 sets its default there).

### 3. Provider forcing per tenant (C8)
`getPayment(tenant)` and `getSms(tenant)` return the mocks when `tenant.isSandbox`, whatever `PAYMENT_PROVIDER` /
`SMS_PROVIDER` say. `notify()` now **requires** the tenant argument (compile error for any new call site that
forgets it). Phone/OTP login is refused inside sandboxes (no real numbers ever enter a sandbox; see §7). Payload has
no email adapter (writes to logs). Sandbox users have no phone numbers.

### 4. Session revocation at expiry (E1, E2, T5)
Four independent layers, any one of which refuses:
1. **Proxy** (`src/proxy.ts`, no DB): selector cookie past its `exp` (= sandbox expiry; no extension) → clears
   `payload-token` and `edvora_session` on that response; page GETs → 303 `/demo?state=ended`; API, server actions and
   form posts → 403. `/admin` with a live selector → rewritten to a real 403 page (C4, S10).
2. **Tenant expiry from the DB**: student `getCurrentUser()` returns null for an ended sandbox; the banner (in
   `/staff`, `/dashboard`, `/learn` layouts) sends an ended sandbox to the ended state.
3. **Membership expiry** = sandbox expiry → `getAccess()` grants nothing on the next request (ADR 006).
4. **Login**: `users.beforeLogin` refuses accounts of an ended sandbox (403), so neither `/api/users/login` nor
   `/demo/api/login` issues a session. The cleanup cron also suspends ended sandboxes' accounts and empties their
   Payload `sessions` (a copied JWT is dead).
`/admin` (Payload) is closed for sandbox accounts by `users.access.admin` as well (C4, default pending Farjad).

### 5. Cleanup: the one hard-delete exception
`POST /demo/api/cleanup` (Bearer `SANDBOX_CRON_SECRET`, ≥ 24 chars; 404 without it), every ~10 min. Selection is
double: DB query `isSandbox = true`, then pure `selectForPurge()` in `@edvora/core` (strictly `isSandbox === true`,
never a slug in `PROTECTED_TENANT_SLUGS` = `iba`, `demo`, past `purgeAt` = `expiresAt + SANDBOX_GRACE_HOURS`).
`purgeTenant()` re-reads the tenant and refuses anything else, refuses to run if a tenant-owned collection is missing
from its purge order, then deletes children before parents (all 20 tenant-owned collections; media/submission files
through Payload so files on disk go too), then the sandbox's accounts, marks the `demo-sandboxes` row `purged`, then
the tenant. **This is the only code allowed to hard-delete**; `delete: nobody` stays on every collection and all
deletes here run with `overrideAccess` + the system context (no audit rows). Each step deletes "what is left", so a
crash mid-way is finished by the next run (E6). Operator «حذف همین حالا» (`/demo/ops`, super-admin only) sets
`expiresAt = purgeAt = now` and runs the same purge.

### 6. Abuse controls
- **Kill switch** `SANDBOX_ENABLED` (default **off**): creation endpoint 503, page shows the off copy; existing
  sandboxes run until expiry; cleanup keeps running.
- **Honeypot** (`website`), **Zod** on every input, **time check + proof of work**: the page embeds a signed challenge
  `{nonce, bits, iat}` (HMAC, key `SESSION_SECRET:pow`). The browser solves `sha256(nonce:counter)` with ≥
  `SANDBOX_POW_BITS` (default 14 ≈ 16k hashes, well under 1 s on a mid phone) in a **Web Worker** (Web Crypto, no
  dependencies; inline fallback yields between batches). The server rejects a submit < `SANDBOX_MIN_FILL_MS` (3 s)
  after `iat`, older than `SANDBOX_CHALLENGE_TTL_MINUTES`, forged, weakened or unsolved. Single use: in-process seen-set
  plus a **unique** `powNonce` column on the reservation row (holds across instances).
- **Per-IP request rate** (A3): `SANDBOX_REQUESTS_PER_MINUTE` (10) on every `/demo` route handler, in-process sliding
  window (single Railway instance; with more instances each one enforces it separately — acceptable, the hard limits
  below are in the DB) → HTTP 429.
- **Trusted proxy hop** (A4): client IP = the `SANDBOX_TRUSTED_PROXY_HOPS`-th entry **from the right** of
  `X-Forwarded-For` (default 1: Railway's edge appends the address it received the request from). Entries to the
  left are client-controlled and ignored; a chain shorter than the hop count falls back to `X-Real-IP`, else one shared
  "unknown" bucket (fails closed). Behind Cloudflare/Arvan + Railway set 2. Only an HMAC of the IP is stored.
- **Cap and per-IP limits in the DB, under one lock** (A6, V11, C3): `reserveSandbox()` opens a transaction, takes
  `pg_advisory_xact_lock`, counts live reservations (`creating|active`, not expired), this IP's demos in 24 h
  (excluding failed builds) and this IP's live demos, decides with `decideCreation()` and inserts the `creating` row,
  then commits. Measured: 20 simultaneous submits from 20 IPs at cap − 1 → exactly 1 created, 19 "full".
  Limits: `SANDBOX_MAX_ACTIVE` 20, `SANDBOX_IP_DAILY_MAX` 3, `SANDBOX_IP_ACTIVE_MAX` 1 (one live demo per network,
  PM C3). A slot frees at expiry, not at purge (F2). A browser with a live demo gets «ادامه» instead (409 `exists`).
- **Uploads** (S6): media + submission files of a sandbox together ≤ `SANDBOX_UPLOAD_MB` (5); types stay Payload's
  allow-lists (images/PDF for media). Counted on the original file; Payload's two resized copies per image are extra
  (bounded). Per-account login lockout is Payload's (`maxLoginAttempts` 5), so one sandbox never locks another (A5).

### 7. Student login: password, not phone + OTP
The sandbox student has no real phone, and a fake 09… number could belong to someone (and `users.phone` is unique
across Edvora, so it could block a real person's sign-up). Decision: sandbox accounts (admin and student) log in with
**generated username (an `@sandbox.invalid` address) + password**: one click from the creator's browser (passwords
sealed with AES-GCM in the httpOnly `edvora_demo` cookie, never shown again, never stored in plain text — the DB has
only Payload's hash), or the password form at `/demo/login` on a second device. Phone/OTP login is refused inside
sandboxes. Consequence: T6 (Persian digits in phone/OTP) does not apply to sandboxes; Persian digits typed into the
password form and the demo form are normalised.

### 8. Template
Built from code (`lib/sandbox/template.ts`), not cloned from a tenant, so IBA content cannot leak: 3 courses
(«نمونه», sample prices labelled as such), 3 open cohorts, 5 lessons with drip, a 5-question quiz, an assignment, a
coupon, 12 leads across all statuses (10-digit phones that cannot be real), 3 sample buyers + 8 orders
(paid / instalment / failed / pending) with enrollments, one certificate (`S????-MGT-001`, per-sandbox prefix because
codes are globally unique). Whole build is **one transaction** (V12: a failure leaves nothing; the reservation is
marked `failed`). Measured on the dev server (Apple Silicon, local Postgres): **~0.5 s server build, ~0.55 s round
trip** warm; 17 concurrent builds p95 2.0 s. The pre-warmed pool (C6) is not needed.

### 9. Defaults pending Farjad
TTL 3 h fixed, no extension · `SANDBOX_MAX_ACTIVE` 20 · `/admin` closed (staff desks only) · contact channel
`TODO(client)` (`SANDBOX_CONTACT_URL`; empty = «درخواست گفتگو» opens the consented-email form) · consented email kept
as a platform lead, 12-month retention, no deletion job yet · `/demo` on the platform host (Railway URL) ·
`SANDBOX_IP_DAILY_MAX` 3 + one live demo per IP · grace 24 h · a sandbox is never converted into a real academy.

### 10. E2E hooks (QA)
- `SANDBOX_E2E_HOOKS=true` **and** `Authorization: Bearer $SANDBOX_CRON_SECRET` enable
  `POST /demo/api/test/expire` (404 otherwise). It ends the sandbox selected by the calling browser now: tenant +
  memberships + record expiry set to now − 1 s, and the selector cookie re-issued with that expiry (so both the proxy
  path and the DB path are exercised). `?purge=1` also sets `purgeAt = now`; then `POST /demo/api/cleanup` hard-deletes
  it. Never set `SANDBOX_E2E_HOOKS` on a public deployment.
- Short TTL alternative: `SANDBOX_TTL_HOURS=0.05` (3 min, minimum) for a real-clock test.
- Limits for test runs: raise `SANDBOX_IP_DAILY_MAX` / `SANDBOX_IP_ACTIVE_MAX` (all local requests share one IP
  bucket), and send `X-Forwarded-For` to simulate distinct visitors (hop 1 = the last entry).

## Consequences
- New code that sends SMS must pass the tenant (`notify(to, text, tenant)`, `getSms(tenant)`); new tenant-owned
  collections must be added to the purge order or cleanup refuses to run (by design).
- Super-admins who open a demo in their own browser must «خروج» before using `/admin` there.
- `/staff` still shows the E-022 «تنظیمات و راه‌اندازی» link to `/admin`; inside a sandbox it lands on the 403 page
  with an explanation. Hiding it is a small follow-up in `lib/staff.ts#navItems` (left alone to avoid E-027/E-028
  conflicts).
- The per-minute limiter is per process; if the platform host runs more than one instance, move it to Postgres.
