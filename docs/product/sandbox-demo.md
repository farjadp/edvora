# E-029 — Self-serve sandbox demo (3-hour credentials)

Owner: product · Status: draft for Farjad · Next: `tech-lead` (ADR + schema), `ux-architect` (screens), `qa` (ACs)

## 1. Problem and goal

Selling Edvora today means a call and a screen share. An academy owner who lands on the Edvora site cannot try it. Goal: a
visitor taps one button and, in under 10 seconds, holds working admin and student logins to **their own throw-away academy**
with realistic sample data, valid for 3 hours. Nothing they do can touch anyone else, send a message, or cost real money.

This is a **platform sales tool** (Edvora super-admin line), not a feature of any academy. It serves the three revenue lines
only indirectly: it sells the platform to academies like IBA. Keep it small.

### Success metrics (targets in brackets are guesses to confirm)

| Metric | Target |
| --- | --- |
| Credentials on screen after tapping the button (p95, normal broadband) | **≤ 10 s**; ≤ 20 s on slow 3G |
| Demos that open the staff panel at least once | [≥ 70%] |
| Demos that visit ≥ 3 of the 6 checklist areas | [≥ 35%] |
| Visitors who leave an email/phone (optional) | [≥ 25%] |
| Demos that turn into a conversation with Farjad | [≥ 5%] `[Farjad: what counts?]` |
| Abuse: sandboxes created by bots / per-IP over limit | 0 slipping past limits; cost of idle sandboxes < [N toman/month] |

## 2. Scope

| In (P1) | Out (no, with reason) |
| --- | --- |
| Public "Try the demo" page, honeypot + time check + light proof-of-work + per-IP limit | External CAPTCHA/analytics (AGENTS.md: no external runtime deps) |
| One isolated sandbox tenant per visitor, cloned from a template, 2 accounts | Shared single demo tenant (visitors would see/break each other's data; no isolation story) |
| Credentials shown once + "what to try" checklist | Emailing/SMS-ing credentials (outbound is forced off; email is not verified) |
| Countdown banner in `/staff`, `/dashboard`, `/learn` (and `/admin` only if reachable) | Any other change to those panels |
| Hard limits, expiry, session revoke, cleanup job, cap, operator view | Real payment, real SMS, custom domain, video hosting in sandbox |
| Optional lead capture for the platform | CRM/marketing automation, drip emails to demo users |
| Inherit new-academy defaults (gamification on once E-028 lands) | Designing gamification (E-028) |
| Fresh-start for returning visitor (see 4.1) | Extending or restoring an expired sandbox (P3 question) |

## 3. Changes from the brief

| # | Change | Why |
| --- | --- | --- |
| C1 | **One-click "enter" button per account** on the credentials screen, in addition to showing the password | The 10-second target and mobile typing of generated passwords. Student login is phone+OTP elsewhere; the sandbox student must not need a real phone. The shown password remains for second devices. |
| C2 | **Sandbox flag and expiry live on the tenant** (`isSandbox`, `expiresAt`, `creator-key`), checked in tenant resolution; membership/account expiry is defence in depth | Brief only expires memberships. A tenant-level lock also blocks student sessions, public pages and API calls in one place, and makes cleanup a single-key delete. |
| C3 | **Returning visitor** gets a signed cookie to the sandbox id: shows remaining time and "continue" (re-issues a session) but **never re-displays the password** (only a hash is stored) | Answers "same browser" without storing plaintext passwords. A second sandbox for the same browser/IP is refused while one is active. |
| C4 | **`/admin` (Payload) is closed for sandbox users in P1**; the academy-admin works in `/staff` | `/admin` exposes tenant settings (domains, gateway credentials, plan) and ADR 008 notes `/admin` is open to any staff. Hardening it is cost for little demo value. Open question Q3. |
| C5 | **Leads for the platform go to a platform-owned record**, not any tenant's `leads` | A tenant lead would be wiped with the sandbox and mixes platform sales with academy data. Collection shape is tech-lead's. |
| C6 | **Pre-warmed pool** (P2) if cloning cannot hit 10 s | Fallback only; do not build unless measured. |
| C7 | **Kill switch `SANDBOX_ENABLED`** and a per-IP daily cap in addition to `SANDBOX_MAX_ACTIVE` | One env flip stops an abuse wave without a deploy. |
| C8 | **Provider forcing is per tenant (`isSandbox` ⇒ mock)**, not only the env var | The platform host also runs real academies; the env var `PAYMENT_PROVIDER` is global and must not be the only guard. |

## 4. Rules that apply to every story

- **Config:** `SANDBOX_ENABLED` (default off), `SANDBOX_TTL_HOURS` (default 3), `SANDBOX_MAX_ACTIVE` [20], `SANDBOX_GRACE_HOURS` [24], `SANDBOX_IP_DAILY_MAX` [3], `SANDBOX_UPLOAD_MB` [5]. Read from env, never hard-coded.
- **Template content** is fictional and labelled «نمونه»: courses, one open cohort, one quiz, one assignment, ~[12] leads across pipeline stages, ~[8] orders (paid, instalment, failed), one certificate. **No IBA content, no real names or phone numbers, no invented prices presented as fact.** Unknown values stay empty with `TODO(client)`. No "Ministry of Science" wording anywhere.
- Money in integer rials; dates UTC shown Jalali; Persian digits in UI, Latin in codes; half-spaces in copy.
- Server clock decides expiry; the browser countdown is display only.

## 5. User stories and acceptance criteria

Tags: **Core** = every academy/platform needs it; **Platform** = Edvora-only, not tenant-facing.

### 5.1 Visitor — get a demo (Platform, P1: this is the whole feature)

*As a visitor, I want to get demo logins in seconds without a sales call, so that I can judge Edvora for my academy.*

| # | Given / When / Then |
| --- | --- |
| V1 | Given `SANDBOX_ENABLED` and capacity, when I open `/demo` on a 360 px phone, then I see the pitch, optional name, optional email, one primary button, and no field is required. |
| V2 | Given I tap the button, when the sandbox is ready, then the credentials screen appears in ≤ 10 s (p95 normal connection) with a progress state, never a blank page. |
| V3 | Given the credentials screen, then it shows two cards (مدیر آکادمی, دانشجو) each with login address, username, generated password, copy button and "ورود" button, the expiry time (Jalali, Persian digits) and the checklist (7.3). |
| V4 | Given I reload or open the screen again, then passwords are **not** shown again; the page shows remaining time and "ادامه" (C3). |
| V5 | Given I clicked "ورود" as admin, when I land, then I am in `/staff` of **my** sandbox, not any other tenant (ADR 005: redirect via `{ redirectTo }`/303, never a server-action `redirect()`). |
| V6 | Given I typed Persian digits in my email or name, then digits and spaces are normalised and the form does not fail; an invalid email shows a Persian error and creates nothing. |
| V7 | Given I leave email blank, when I submit, then a sandbox is created and nothing is stored about me except IP hash and timestamps. |
| V8 | Given I enter an email and tick the consent line, then it is saved as a **platform** lead (name, email, sandbox id, time, consent) and I am told "فقط برای تماس دربارهٔ ادورا"; no email is sent to it. Not ticked ⇒ not saved. |
| V9 | Given a returning browser with a live sandbox, when I open `/demo`, then I see remaining time + "ادامه" and **no** option to create a second one (C3). |
| V10 | Given my sandbox expired, when I open `/demo` or any sandbox URL, then I see the expired state (7.7) with a way to start a new demo subject to V11, and my old login is refused. |
| V11 | Given I already created ≥ `SANDBOX_IP_DAILY_MAX` sandboxes in 24 h from this IP, then I see the rate-limited state (7.6) and nothing is created. |
| V12 | Given creation fails midway (DB error), then I see a generic Persian retry message, no half-built tenant stays active, and the failure is logged (not thrown into the flow). |
| V13 | Given slow mobile (3G throttle), when the page loads, then it is usable < 5 s on first paint, the proof-of-work does not freeze the UI (runs in a worker, ≤ ~1 s on a mid phone) and the button shows progress. |

### 5.2 Visitor — abuse protection (Platform, P1: unprotected form = free resource attack)

| # | Given / When / Then |
| --- | --- |
| A1 | Given the hidden honeypot field is filled, when submitted, then no sandbox is created and the response looks like success-less "try again" without revealing why. |
| A2 | Given the form is submitted < [3] s after render or without a valid, unexpired proof-of-work token, then it is rejected with a retry message. Tokens are single-use and signed server-side. |
| A3 | Given > [10] requests/min to `/demo` endpoints from one IP, then HTTP 429 with the rate-limited copy; counters are in our own store (no external service). |
| A4 | Given a request carries `X-Forwarded-For` spoofing, then the limiter uses only the trusted proxy hop configured for the host (tech-lead documents which). |
| A5 | Given sandbox users hit login endpoints with wrong passwords, then the existing login throttling applies per sandbox; one sandbox's failures never lock another. |
| A6 | Given 20 simultaneous submits from different IPs at cap−1, then at most one succeeds and the rest see the full state (no overshoot of `SANDBOX_MAX_ACTIVE`). |

### 5.3 Sandbox academy-admin (Tenant config, P1)

*As a sandbox academy-admin, I want to run a realistic academy for 3 hours, so that I can see if Edvora fits mine.*

| # | Given / When / Then |
| --- | --- |
| S1 | Given I log in with the shown credentials, then I have the **academy-admin** role template of my sandbox tenant only; platform permissions (`tenants.manage`, `tenants.credentials`, `impersonate`) are absent. |
| S2 | Given the template, then I see seeded courses, a cohort with free seats, a quiz, an assignment, leads, orders, and every item is labelled as demo content. |
| S3 | Given I create/edit courses, leads, staff, roles, coupons, then it works and appears only in my sandbox. |
| S4 | Given I change tenant domain, plan, features, gateway credentials or SMS provider, then the control is hidden/disabled and a direct API write returns 403; nothing changes. |
| S5 | Given I create another staff user in my sandbox, then they inherit the same expiry (≤ sandbox `expiresAt`); I cannot set a membership expiry beyond it. |
| S6 | Given I try to upload > `SANDBOX_UPLOAD_MB` total, or a non-image/PDF file, then the upload is refused with a Persian message and nothing is stored. |
| S7 | Given I run a mock checkout / manual payment / refund, then it uses the mock gateway; no outbound HTTP to any payment provider. |
| S8 | Given any action that would send email or SMS (OTP, reminders, notifications), then nothing leaves the server; mock OTP/message text may be shown on screen, never to a real number. Notification errors are logged, not thrown. |
| S9 | Given I try another tenant's id in a URL or API (`/staff/...`, `/api/...?where[tenant]=`), then 403/404 and no data from that tenant is returned. |
| S10 | Given I try `/admin` (C4), then I get the real 403 (ADR 008) with a short Persian explanation, not a crash. |
| S11 | Given a new academy default exists (gamification once E-028 ships), then my sandbox has it **on** by inheritance; this story adds no gamification logic. |
| S12 | Given the countdown banner (7.4), then it shows on `/staff`, `/dashboard`, `/learn` (and `/admin` if ever reachable), turns warning at ≤ 15 min, and does not shift layout or break RTL on 360 px. |

### 5.4 Sandbox student (Core, P1)

*As a sandbox student, I want to experience the learner side, so that I can judge what my students would get.*

| # | Given / When / Then |
| --- | --- |
| T1 | Given the student credentials (or "ورود"), then I land in `/dashboard` of my sandbox with one enrolment in the seeded cohort. |
| T2 | Given I open `/learn`, then I can watch placeholder lesson content, take the quiz, submit the assignment, and see drip locking, all inside my sandbox. |
| T3 | Given I buy another course, then the mock checkout completes (including a failed-payment test card/path documented on the checklist) and no real money moves. |
| T4 | Given the cohort is full (admin sets seats to 0 or I try a full cohort), then the existing "seat full" behaviour appears; nothing sandbox-specific. |
| T5 | Given the sandbox expires while I am in a lesson, when I next load or save anything, then I see the expired state and the save is refused; no data is written after expiry. |
| T6 | Given I use Persian or Latin digits in phone/OTP fields, then both are accepted (`toLatinDigits`). |

### 5.5 Expiry and cleanup (Core for platform, P1)

| # | Given / When / Then |
| --- | --- |
| E1 | Given `now ≥ expiresAt` (= creation + `SANDBOX_TTL_HOURS`), when anyone logs in to that sandbox, then login is refused with the expired state; no account details leak. |
| E2 | Given an existing session at expiry, when the next request arrives (page, API, server action), then it is refused and the session cookie cleared within the same request; revocation does not wait for the 8 h token (access reads DB, ADR 006). |
| E3 | Given memberships/accounts of the sandbox, then their `expiresAt` equal the tenant's, and extending one beyond it is impossible. |
| E4 | Given the cleanup job runs (every [10] min), when `now ≥ expiresAt + SANDBOX_GRACE_HOURS`, then the sandbox tenant and **all** its tenant-owned rows, its users, memberships, roles, media files and sessions are hard-deleted; audit rows of that tenant go with it (system job exception to "delete denied", documented in the ADR). |
| E5 | Given cleanup, then it deletes only tenants where `isSandbox = true`; a unit test proves a non-sandbox tenant (incl. `demo` and `iba`) is never selected, even if its `expiresAt` is set or slug starts with "sandbox". |
| E6 | Given the job crashes mid-delete, when it reruns, then it resumes idempotently and leaves no orphan rows or files. |
| E7 | Given the grace period, then the owner sees the expired state, not a 404, and no data is viewable. |
| E8 | Given disk/DB growth, then total sandbox storage is bounded by `SANDBOX_MAX_ACTIVE` × quota plus grace backlog. |

### 5.6 Capacity (Platform, P1)

| # | Given / When / Then |
| --- | --- |
| F1 | Given active sandboxes (not yet expired) = `SANDBOX_MAX_ACTIVE`, when I submit, then I see the full state (7.5) with the time the next slot is expected (soonest expiry) and nothing is created. |
| F2 | Given a sandbox expires, then its slot frees immediately (before grace cleanup). |
| F3 | Given the full state, then the optional email field can still register interest (same consent rule as V8). |

### 5.7 Farjad / operator (Platform, P1 basics, P2 dashboard)

*As the operator, I want to see and control demos, so that cost and abuse stay under control and I can follow up leads.*

| # | Given / When / Then | Pri |
| --- | --- | --- |
| O1 | Given I am Edvora super-admin, then I can list sandboxes (created, expires, IP hash, active/expired), count active vs cap, and delete one now. Only super-admin sees this. | P1 |
| O2 | Given `SANDBOX_ENABLED=false`, then `/demo` shows a polite "موقتاً در دسترس نیست" and the API creates nothing; existing sandboxes keep working until expiry. | P1 |
| O3 | Given a platform lead exists, then I can see/export name, email, time, consent; no tenant admin can see it. | P1 |
| O4 | Given I change `SANDBOX_TTL_HOURS`, then only new sandboxes use it. | P1 |
| O5 | Given a sandbox is created, expires or is deleted, then it is logged (no personal data beyond hashed IP) so I can count demos. | P1 |
| O6 | Funnel view: demos → opened staff → checklist areas → left email. | P2 |

## 6. Isolation and hard-limit checklist (QA, every release)

1. Sandbox admin cannot read/write any other tenant via UI, REST, GraphQL, Local-API-backed actions, search, media URLs.
2. Sandbox user cannot log in to another tenant; another tenant's user cannot log in to a sandbox.
3. No super-admin can be created or elevated inside a sandbox; no `users.roles` platform flag writable.
4. Payment provider = mock and SMS provider = mock for every sandbox even if env says `real` (C8); network capture shows no outbound payment/SMS/email call.
5. Cron/queued jobs (reminders, receipts) skip sandbox tenants or use mock adapters.
6. Uploads capped, typed, stored under the sandbox's key, deleted with it.
7. Public pages of a sandbox never show IBA text, logos or the DBA claim.
8. Public sandbox pages are `noindex`.

## 7. Persian UI copy (draft; half-spaces as shown)

### 7.1 Demo page `/demo`
- Title: **آکادمی خودتان را ۳ ساعت آزمایش کنید**
- Lead: بدون ثبت‌نام و بدون پرداخت. یک آکادمی آزمایشی کامل با دوره، کلاس، آزمون، سرنخ و سفارش نمونه برای شما ساخته می‌شود. همه‌چیز پس از ۳ ساعت پاک می‌شود.
- Fields (optional): «نام شما (اختیاری)» · «ایمیل (اختیاری)»
- Consent (shown when email typed): «می‌خواهم تیم ادورا دربارهٔ ادورا با من تماس بگیرد. ایمیل من فقط برای همین استفاده می‌شود.»
- Button: **ساخت آکادمی آزمایشی** · working: «در حال ساخت آکادمی شما…»
- Footnote: «پیامک و ایمیل واقعی ارسال نمی‌شود و پرداخت‌ها آزمایشی‌اند.»

### 7.2 Errors
- Generic: «ساخت آکادمی آزمایشی انجام نشد. لطفاً چند لحظه بعد دوباره تلاش کنید.»
- Bad email: «ایمیل واردشده درست به نظر نمی‌رسد.»
- Off: «آکادمی آزمایشی موقتاً در دسترس نیست. لطفاً بعداً سر بزنید.»

### 7.3 Credentials screen
- Title: **آکادمی آزمایشی شما آماده است**
- Sub: «تا ساعت [۱۴:۳۰] (حدود ۳ ساعت دیگر) فعال است. این رمزها فقط یک بار نشان داده می‌شوند؛ همین حالا آن‌ها را کپی کنید.»
- Cards: «مدیر آکادمی» · «دانشجو» → «نشانی ورود» · «نام کاربری» · «رمز عبور» · [کپی] · [ورود به‌عنوان مدیر] / [ورود به‌عنوان دانشجو]
- Checklist title: «در ۳ ساعت چه چیزی را امتحان کنم؟»
  1. «یک دوره بسازید و قیمت و اقساط آن را تنظیم کنید.»
  2. «سرنخ‌ها را در میز مشاور ببینید و نتیجهٔ یک تماس را ثبت کنید.»
  3. «با حساب دانشجو وارد شوید، آزمون را بدهید و تکلیف بفرستید.»
  4. «یک سفارش آزمایشی را پرداخت کنید (پرداخت ساختگی است).»
  5. «برای یک همکار نقش و دسترسی دلخواه بسازید.»
  6. «گواهی نمونه را از صفحهٔ استعلام بررسی کنید.»
- Note: «اینجا دادهٔ واقعی وجود ندارد. هرچه می‌خواهید تغییر دهید یا حذف کنید.»
- CTA: «با ما صحبت کنید» → `TODO(client)` contact target `[Farjad]`.

### 7.4 Countdown banner (inside panels)
- Normal: «آکادمی آزمایشی · [۲ ساعت و ۴۱ دقیقه] تا پایان»
- ≤ 15 min: «کمتر از [۱۵ دقیقه] مانده است. کارهایتان پس از پایان پاک می‌شود.»
- Link: «درباره ادورا صحبت کنیم»; no close button on warning state.

### 7.5 Full state
- «ظرفیت آکادمی‌های آزمایشی فعلاً پر است.» · «نزدیک‌ترین زمان آزاد شدن: حدود [۲۰ دقیقه] دیگر. چند دقیقهٔ دیگر دوباره سر بزنید.» · «یا ایمیل بگذارید تا خودمان با شما هماهنگ کنیم.»

### 7.6 Rate-limited state
- «درخواست‌های شما از حد مجاز گذشته است.» · «برای جلوگیری از سوءاستفاده، هر شبکه در ۲۴ ساعت فقط چند آکادمی آزمایشی می‌تواند بسازد. لطفاً بعداً دوباره تلاش کنید یا با ما تماس بگیرید.»

### 7.7 Expired state
- Title: **زمان آکادمی آزمایشی شما تمام شد**
- Body: «برای حفظ امنیت، اطلاعات آزمایشی پاک می‌شود. اگر ادورا برای آکادمی شما مناسب بود، با ما صحبت کنید.»
- Buttons: [ساخت آکادمی آزمایشی جدید] (only if V11 allows) · [درخواست گفتگو با تیم ادورا]

## 8. Open questions for Farjad (answer in one line each)

| # | Question | Needed for |
| --- | --- | --- |
| Q1 | Is 3 hours fixed, or may a visitor extend once (+1 h)? Suggestion: fixed. | Expiry rules |
| Q2 | How many demos at the same time can the server afford? (Starting guess 20.) | `SANDBOX_MAX_ACTIVE` |
| Q3 | Should the demo admin see the full `/admin` (settings, branding) or only the daily staff panel? Suggestion: staff panel only. | C4 |
| Q4 | Which address do you want interested visitors to contact (WhatsApp/Telegram/phone/email)? | CTA copy |
| Q5 | May we store a visitor's email if they tick consent, and for how long (suggest 12 months)? Where do you want to read them? | V8, O3 |
| Q6 | Which Edvora site hosts `/demo` — a separate edvora marketing domain, or the current Railway URL? | Tenant resolution, ADR |
| Q7 | Is the demo for Iranian visitors? (Railway may be unreachable from Iran without VPN, see runbook.) | Hosting, 10 s target |
| Q8 | Which sample content should the template show: management/business only, or something close to your target academies? Any content that must not appear? | Template |
| Q9 | After expiry, can the same person start a new demo the next day? (Suggest yes, 3 per day per network.) | V11 |
| Q10 | How many days to keep ended demos before deleting them? (Suggest 1 day.) | `SANDBOX_GRACE_HOURS` |
| Q11 | Is a sandbox ever the base for a real customer's onboarding (convert to real academy)? Suggestion: no, always start fresh. | Scope |

## 9. Priority note

**P1** for everything except O6 (P2), the pre-warmed pool C6 (P2, only if the 10 s target is missed) and any extend/convert feature (P3). Reason: a half-version is unsafe — unprotected creation, cross-tenant leakage and unexpired logins are worse than no demo. Build order: tenant-level sandbox flag + expiry + mock forcing → clone + credentials → abuse limits + cap → cleanup job → banner and copy → operator view. Needs an ADR for path/cookie vs wildcard subdomain and for how the system cleanup job bypasses delete-denied.

## 10. Handoff

- **Task:** E-029 product doc for the self-serve sandbox demo.
- **Output:** `docs/product/sandbox-demo.md`.
- **Decisions made:** one sandbox tenant per visitor; tenant-level expiry and per-tenant provider forcing; `/admin` closed in P1; password shown once, return visit shows time only; leads go to a platform record; optional consented email; kill switch and per-IP daily cap added.
- **Open issues:** Q1–Q11 above; URL strategy and cleanup-bypass ADR (tech-lead); platform lead collection shape; whether student login in sandbox is phone+OTP or password.
- **Next owner:** `tech-lead` (ADR, schema, limiter) then `ux-architect` (screens), `qa` (ACs V/A/S/T/E/F/O).
