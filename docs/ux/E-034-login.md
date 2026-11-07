# E-034 · Login experience in the Seal direction (UX spec)

Owner: ux-architect → next: `ui-designer` (builds 2–3 visual options), then `tech-lead` for the items marked **BACKEND**.
Scope: docs only. No change to auth logic, permissions or 2FA behaviour. Placeholder copy in [brackets].
Sources read: AGENTS.md, ADR 004–008, E-022 / E-027 UX docs, E-021/22/31 handoffs, `LoginForm.tsx`, `StaffLoginForm.tsx`,
`TwoFactorVerifyForm.tsx`, `TwoFactorEnrolForm.tsx`, `twoFactorClient.ts`, `endpoints/twoFactor.ts`, `actions.ts`, `Users.ts`,
`Tenants.ts`, `payload.config.ts`, `(payload)/custom.scss`.

Status legend used in every state table:
**TODAY** = exists and works as described · **UI** = only a front-end change is needed · **BACKEND** = server behaviour that does not exist (UI is specified for when it does; do not fake it).

---

## 1. Entry points and how they relate

| # | Route | Who | Method | Session it creates | Post-login target | Code |
|---|---|---|---|---|---|---|
| E1 | `/login` | Students (and anyone with a phone) | Mobile → SMS code (5 digits, 2 min TTL, 60 s resend guard, 5 tries) | `edvora_session` cookie, 30 days | `?next=` (same-site path only) else `/dashboard` | `(frontend)/login`, `LoginForm`, `actions.ts` |
| E2 | `/staff/login` → `/staff/2fa/verify` or `/staff/2fa/enrol` | Staff | Email + password, then TOTP if 2FA on (or enrol if `STAFF_2FA_REQUIRED`) | Payload `payload-token` + `sid`, 8 h | `?next=` must start with `/staff` | `staff/login`, `staff/2fa/*`, `BareAuthLayout` |
| E3 | `/admin/login` | Staff (admin / super-admin work) | Payload's own form (email + password) | Same Payload session as E2 | Payload `?redirect=` | Payload, skinned by `custom.scss` + `components/admin/Brand` |

Two separate sessions (ADR 006/E-022): `/staff` and `/admin` only trust the Payload one; the student cookie never opens either.

### What Payload lets us replace (without touching auth logic)
| Hook | Can do | Cannot do / caveat |
|---|---|---|
| `admin.components.graphics.Logo` / `Icon` | Already used (E-031). Tenant logo + wordmark on login. | Rendered before auth: only public tenant data. |
| `admin.components.beforeLogin` / `afterLogin` | Inject a React server component above / below Payload's form (welcome line, academy story, link «ورود کارکنان», help text, "this is the admin" label). | Cannot change the form fields, error toasts or redirect. |
| `custom.scss` | Re-skin `.template-minimal`, the form, buttons, background, split layout via `:has()`/wrapper classes. | Markup is Payload's; split screen needs the wrapper injected by `beforeLogin`. |
| `admin.components.views.login` (Payload 3 view override) | Replace the whole page. A view that only calls `redirect('/staff/login?next=…')` (a server component; ADR 008 §3 allows it) changes no auth logic. | Re-implementing the form inside Payload's view is possible but duplicates E2 and ADR 007 recorded "no login-view override" as a constraint. **Verify against the installed Payload version before relying on it.** |
| Email field / extra TOTP field in the same request | Not possible. That is why E2 exists (ADR 007). | |
| «فراموشی رمز» link and `/admin/forgot` | Payload ships it. Without an email adapter (none configured in `payload.config.ts`) it cannot deliver. | See states R1–R3. |

### Decision: one branded staff login (E2), `/admin/login` becomes a doorway to it
**Recommendation: unify.** `/staff/login` is the single staff and admin sign-in; `/admin/login` stays alive as a doorway.

Why:
1. **2FA only works from E2.** A pending-2FA session on `/admin` gets "unauthorized" (ADR 007). Staff who start on `/admin` hit a dead end today.
2. **One design to maintain** instead of two skins that drift (E-031 already restyled E3 and it still looks like a plain card).
3. **Same people.** Both screens use the same email + password + same `users` collection; the role desk vs. Payload split (ADR 006) is a *destination*, not a *door*.
4. **Role routing needs no new auth logic:** after login the existing guard (`settledRedirect`, `requireStaff`) already sends people to verify/enrol/desk. `next` decides where: default `/staff` (everyone lands on their desk); admins may deep-link `next=/admin`.

Phasing (so the designer is not blocked):
- **Phase 1 (UI only):** design the shared look once. Apply it to E2 fully; to E3 through `beforeLogin` + `custom.scss` + `Logo` so E3 matches visually. Both are valid today.
- **Phase 2 (small BACKEND/logic, tech-lead):** `/admin/login` redirects to `/staff/login?next=/admin` (needs `views.login` redirect view **and** `safeStaffNext` to accept `/admin` — a change to `packages/core/src/staff.ts` + test, flagged). Also make pending-2FA sessions on `/admin` go to verify. Until then E3 shows a visible line «کد تأیید دومرحله‌ای دارید؟ از صفحهٔ ورود کارکنان وارد شوید» + link (UI only).
- Do **not** merge E1 into E2: different credential, different session, different user (45+ student on a phone vs. staff on a laptop). Keep them visually one family, functionally separate.

### Cross-links (wrong door)
| Who lands where | Shows | Notes |
|---|---|---|
| Student on `/staff/login` | Existing link «دانشجو هستید؟ ورود با شماره موبایل» → `/login`. Make it a visible secondary button, not a tiny link. If they type a phone number into the email field: inline hint «اینجا ایمیل کارکنان لازم است. برای ورود با موبایل [از این‌جا برگردید]». | **UI.** Students have synthetic emails + random passwords, so they cannot sign in here; the error is the generic wrong-credentials one. |
| Student with a valid student session opening `/staff` | Login page (anonymous to Payload). No 403 on the login page. | **TODAY.** |
| Staff on `/login` | Footer line on the student page: «کارمند آکادمی هستید؟ ورود کارکنان» → `/staff/login`. | **UI.** Staff with a phone number can still sign in by SMS and get a *student* session only (no staff access, no 2FA bypass); they see the student dashboard. Note this to tech-lead, no change asked. |
| Staff on `/admin/login` | Link to `/staff/login` (see phase 1). | **UI.** |
| Signed-in user on any login page | Redirect to `next` / desk (exists for E1, E2). Show nothing. | **TODAY.** |

---

## 2. State inventory

Conventions for every table: a11y column is only what is *specific* to the state; global rules are in §4. All errors use the `role="alert"` region above the submit button (E2/E3) or below it (E1 today; move above for consistency).
Common component names for the designer: **Frame** (page shell: logo, welcome, theme toggle), **Form card**, **Field**, **Primary button**, **Notice** (info), **Alert** (error), **Lock banner**.

### 2.1 E1 Student login `/login`

| ID | State | Trigger | Screen shows | Persian copy | Primary action | a11y | Status |
|---|---|---|---|---|---|---|---|
| S1 | Empty, phone step | First load | Welcome, one field, one button. First-time and returning look identical (no password; returning is not remembered). | H1 «ورود یا ثبت‌نام». Sub: «شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.» Label «شماره موبایل». Placeholder `۰۹۱۲۳۴۵۶۷۸۹` (display Persian; value normalised). Button «دریافت کد ورود» | Send code | Field autofocus on desktop only (not mobile: keyboard would cover the welcome). `autocomplete="tel"`, `inputmode="tel"`, `dir="ltr"`, text aligned to the end | TODAY (copy tweak UI) |
| S2 | Typing | Input | Persian/Arabic digits accepted, spaces and `+98` stripped on submit (`normalizeIranMobile`). Live: no validation until blur/submit. | — | | Do not reformat while typing | TODAY (server normalises) |
| S3 | Validation error | Not a valid Iranian mobile | Alert above button, field `aria-invalid`, focus returns to field | «شماره موبایل درست نیست. با ۰۹ شروع می‌شود و ۱۱ رقم دارد؛ مثل ۰۹۱۲۳۴۵۶۷۸۹.» (server today says «شماره موبایل معتبر نیست.») | Fix and resend | `aria-describedby` → alert id | TODAY / copy UI |
| S4 | Submitting | Send pressed | Button disabled, label changes, spinner is static-or-fade only | «در حال ارسال…» | — | `aria-busy` on form | TODAY |
| S5 | SMS provider failed | `sendTemplate` not ok | Alert, button re-enabled, number kept | «پیامک ارسال نشد. چند لحظه بعد دوباره امتحان کنید.» | Retry | | TODAY |
| S6 | Server error | Exception in action | Same as S5 | «مشکلی پیش آمد. دوباره امتحان کنید.» | Retry | | TODAY |
| S7 | Network error (offline, national internet drop) | Action cannot reach server | Alert, form data kept, a «تلاش دوباره» button. Today no catch: React error boundary may show a generic error. | «اتصال برقرار نشد. اینترنت را بررسی کنید و دوباره امتحان کنید.» | Retry | | **UI** (wrap submit with try/catch; no server change) |
| S8 | Rate limited: request too soon (<60 s) | Second request within 60 s | Moves to code step, notice (not error), resend timer continues | «کد چند لحظه پیش برایتان فرستاده شده. همان را وارد کنید.» | Enter code | | TODAY (server returns `ok` with old message) |
| S9 | Too many code requests per phone / IP | — | No limit beyond the 60 s guard exists. Spec: lock banner with time, number retained | «درخواست‌های زیادی ثبت شد. [۱۵] دقیقهٔ دیگر دوباره امتحان کنید.» | Wait | countdown rules §4 | **BACKEND** |
| S10 | Code step | OTP sent | Number shown (LTR, with «ویرایش شماره» button), 5 single-digit boxes **or** one field (designer's choice; one real `<input>` underneath for autofill), resend timer | H2 «کد را وارد کنید». «کد ۵رقمی به [۰۹۱۲۳۴۵۶۷۸۹] پیامک شد.» Label «کد ورود». Button «ورود». Name field only for new users: «نام و نام خانوادگی (فقط بار اول)» | Verify | `autocomplete="one-time-code"`, `inputmode="numeric"`, `maxlength` 5 (accept paste of 8), `dir="ltr"`, no `pattern` blocking Persian digits | TODAY. «ویرایش شماره» is **UI** (today no way back to phone step) |
| S11 | Resend timer | After send | Disabled «ارسال دوباره» with `۰۰:۴۵` text that updates visually each second but is not a live region; becomes a button at 0 | «ارسال دوباره‌ی کد تا ۰۰:۴۵ دیگر» → «کد نرسید؟ ارسال دوباره» | Resend | `aria-live="off"` on timer; announce once at 0: «می‌توانید دوباره کد بگیرید» (polite) | **UI** (60 s window matches server guard; show a fixed 60 s client timer) |
| S12 | Wrong code | Hash mismatch | Field cleared and refocused, alert. Attempts left are not returned today. | «کد درست نیست. دوباره بررسی کنید.» | Retry | focus to field | TODAY. «n بار دیگر» **BACKEND** (add `attemptsLeft`) |
| S13 | Expired / no active code | >2 min, or none | Alert + resend button | «کد منقضی شده است. کد تازه بگیرید.» | Resend | | TODAY |
| S14 | Too many wrong codes (5) | attempts ≥ 5 | Lock banner; resend as the only action | «چند بار کد اشتباه وارد شد. کد تازه بگیرید.» | Get new code (works today: new code resets) | | TODAY (no countdown needed) |
| S15 | Account suspended / archived | Correct code, `status ≠ active` (E-021) | Alert; no hint which status; offers academy contact (tenant `contact.phone` if set) | «ورود با این شماره ممکن نیست. با پشتیبانی آکادمی تماس بگیرید.» + [شمارهٔ پشتیبانی] | Call/back | | TODAY (copy UI). Shown only after a correct code, so no account-existence leak. |
| S16 | Submitting code | Verify pressed | Button disabled | «در حال ورود…» (kept through the redirect) | — | | TODAY |
| S17 | Success | OK | Brief state, then full navigation to `next` (ADR 005) | «وارد شدید.» | | polite status | TODAY |
| S18 | Session expired | Cookie 30 d ended or invalid, user hit a protected page | Normal phone step plus Notice above the form (only when `?next=` is present) | «برای ادامه، وارد شوید.» | | | **UI** (cannot tell expired from never-logged-in; neutral line covers both) |
| S19 | Logged out | `POST /logout` → `/` | Lands on the home page; no login screen. Optional toast on home. | [«از حساب خارج شدید.»] | | | TODAY (no message) / toast **UI** |
| S20 | Tenant unknown | Host matches no tenant | Today: falls back to `DEFAULT_TENANT_SLUG` tenant (wrong academy's brand, and logins attach to it); if default is missing, 500. | See §3 | | | **BACKEND** + decision (§7 Q4) |
| S21 | Maintenance | Planned downtime | No flag exists. Spec: full-page notice using the Frame | «در حال به‌روزرسانی هستیم. [ساعت] دوباره سر بزنید.» | | | **BACKEND** |

### 2.2 E2 Staff login `/staff/login`

| ID | State | Trigger | Screen shows | Persian copy | Primary action | a11y | Status |
|---|---|---|---|---|---|---|---|
| T1 | Empty | Load | Frame, email, password, button, student link | H1 «ورود کارکنان». Sub: [«برای ورود به میز کار و بخش مدیریت.»] Labels «ایمیل», «رمز عبور». Button «ورود». Link «دانشجو هستید؟ ورود با شماره موبایل» | Sign in | `autocomplete="username"` and `current-password`, `dir="ltr"`, `spellcheck=false`, `autocapitalize="none"`. Show/hide password toggle (button with `aria-pressed`) | TODAY; toggle **UI** |
| T2 | Typing | Input | No live validation; Caps Lock hint optional | [«Caps Lock روشن است.»] | | | UI |
| T3 | Validation error | Empty/invalid email (native `required`/`type=email`) | Browser tooltip today; spec: our own inline message so it is Persian and announced | «ایمیل را کامل بنویسید؛ مثل name@example.com.» / «رمز عبور را وارد کنید.» | Fix | `aria-invalid`, `aria-describedby`, focus first invalid | UI |
| T4 | Wrong credentials (and unknown email, and student account) | 401 | Alert, password cleared, email kept, focus on password. **Identical for all three causes.** | «ایمیل یا رمز عبور درست نیست.» | Retry | | TODAY |
| T5 | Suspended / archived (E-021) | 403 from `beforeLogin` | Alert, no session kept; also reached by redirect `?error=inactive` from the guard. Same copy for both statuses. | «حساب شما غیرفعال است. با مدیر آکادمی تماس بگیرید.» | Back | | TODAY. Verify with tech-lead whether Payload runs `beforeLogin` before or after the password check; if before, this leaks "account exists" (§7 Q6). |
| T6 | Too many failed passwords / locked | Payload `maxLoginAttempts` / `lockTime` (not set in `Users.ts`, so Payload defaults apply) | Lock banner. **Mismatch:** the form maps HTTP 423/429 to "locked", but Payload's locked response is believed to be 401 with a message, so it currently shows T4. | «ورود موقتاً بسته شده است. چند دقیقه بعد دوباره امتحان کنید.» (exists in code) | Wait | | Copy TODAY; mapping + **countdown BACKEND** (no `lockedUntil` returned for password lock). Tech-lead: verify status code and decide whether to set explicit `maxLoginAttempts`/`lockTime` and return a retry time. |
| T7 | Submitting | Submit | Button disabled, label | «در حال ورود…» | | `aria-busy` | TODAY |
| T8 | Network error | fetch throws | Alert, form kept | «اتصال برقرار نشد. اینترنت خود را بررسی و دوباره تلاش کنید.» | Retry | | TODAY |
| T9 | Server error | ≥500 | Alert | «مشکلی پیش آمد. دوباره تلاش کنید.» | Retry | | TODAY |
| T10 | Success | 200 | Full navigation to `next`; the guard then forwards to verify/enrol/desk | button stays «در حال ورود…» | | | TODAY |
| T11 | Session expired (8 h) | Anonymous hit on `/staff/*` with `?next=` | Notice above the form | «نشست شما تمام شده است. دوباره وارد شوید.» | | polite status | **UI** (shown when `next` present; cannot be told apart from first visit) |
| T12 | Logged out | `POST /staff/logout` → `/staff/login` | Currently no message. Spec: add `?out=1` | «از حساب خارج شدید.» | | polite status | **UI** + one-line change in the logout route handler (303 target); flag to tech-lead |
| T13 | Forgot password link | Link under password | Payload's `/admin/forgot` is **not** a working path (no email adapter). Spec for today: replace by help text, no link. | «رمز را فراموش کرده‌اید؟ از مدیر آکادمی بخواهید رمز تازه برایتان تعیین کند.» | | | **UI** (honest copy) |
| R1 | Reset: request sent | Email submitted on a future reset page | «اگر این ایمیل در آکادمی ثبت باشد، پیوند بازنشانی برایش فرستاده می‌شود.» (same text whether or not the account exists) | | | | **BACKEND** (email adapter, delivery on Iran national network, or SMS-based reset; ADR needed) |
| R2 | Reset: link expired / used | Old token | «این پیوند منقضی شده است. دوباره درخواست دهید.» + button | | | | **BACKEND** |
| R3 | Reset: new password set | Token valid | Fields «رمز جدید», «تکرار رمز»; rule hint «حداقل [۱۰] نویسه» [TODO(client): policy]; success «رمز شما عوض شد. حالا وارد شوید.» → T1 | | | `autocomplete="new-password"` | **BACKEND** |
| T14 | Tenant unknown / Maintenance | as S20/S21 | as S20/S21 | | | | **BACKEND** |

### 2.3 E2 Step 2 · 2FA verify `/staff/2fa/verify`

| ID | State | Trigger | Screen shows | Persian copy | Primary action | a11y | Status |
|---|---|---|---|---|---|---|---|
| V1 | Required, empty | Password OK, 2FA on, session unverified | Account email (LTR), one 6-digit field, collapsed help, sign-out | H1 «تأیید دومرحله‌ای». «کد ۶رقمی را از برنامهٔ احراز هویت گوشی خود وارد کنید.» Label «کد تأیید». Button «تأیید و ادامه». Help summary «گوشی خود را ندارید؟». Secondary «خروج از حساب» | Verify | `autocomplete="one-time-code"`, `inputmode="numeric"`, `dir="ltr"`, accepts Persian digits and spaces, focus on mount (staff are on laptops; on a phone keep focus but ensure the field is not hidden by the keyboard) | TODAY |
| V2 | Short code | <6 digits | Inline error | «کد را شش‌رقمی وارد کنید.» | | | TODAY |
| V3 | Wrong code | 401 | Field cleared, error with remaining tries; from the 2nd failure the clock hint | «کد درست نیست. ۳ بار دیگر می‌توانید امتحان کنید.» / «هنوز درست نیست؟ ساعت گوشی باید روی حالت خودکار باشد.» | Retry | alert; keep focus in field | TODAY |
| V4 | Locked | 5 failures → 429 `lockedUntil` (15 min); also on page load if already locked | Lock banner with mm:ss; field and button disabled; unlocks itself at 0 | «چند بار کد اشتباه وارد شد. تا ۱۵ دقیقهٔ دیگر امکان ورود ندارید.» «زمان باقی‌مانده: ۱۴:۵۹» | Wait / sign out | Banner is `role="alert"` once; timer is `role="timer"` and **not** a live region. Announce at expiry: «می‌توانید دوباره امتحان کنید.» | TODAY (countdown exists) |
| V5 | Recovery code | — | **Does not exist.** Lost phone = academy admin resets 2FA (E-022 reset flow). UI today: the «گوشی خود را ندارید؟» details. | «از مدیر آکادمی بخواهید تأیید دومرحله‌ای حساب شما را بازنشانی کند.» | Sign out | | TODAY (help text). Recovery codes = **BACKEND**, not requested; do not design a field for them. |
| V6 | Network / server | fetch fails | Error, attempts untouched | as T8 / T9 | | | TODAY |
| V7 | Conflict (409) | Already verified in another tab | Goes on to `next` | — | | | TODAY (outcome `conflict` is handled in the hook; designer: no visible state) |
| V8 | Submitting / success | | «در حال بررسی…» then navigate | | | | TODAY |
| V9 | Session ended while on this page | Cookie gone | Redirect to T1 with T11 notice | | | | TODAY (redirect) + UI notice |

### 2.4 E2 · 2FA enrolment `/staff/2fa/enrol` (forced, only when `STAFF_2FA_REQUIRED=true`)

| ID | State | Trigger | Screen shows | Persian copy (existing) | Primary action | a11y | Status |
|---|---|---|---|---|---|---|---|
| N1 | Creating key | On mount (POST setup) | Skeleton, no flash | «در حال ساخت کلید…» | — | `aria-busy` | TODAY |
| N2 | Steps | Key ready | 3 numbered steps: install app, scan QR (server SVG) + manual key with copy, enter code | «۱. یک برنامهٔ احراز هویت روی گوشی نصب کنید.» · «۲. کد QR را اسکن کنید.» · «۳. کد شش‌رقمی‌ای را که برنامه نشان می‌دهد وارد کنید.» · «فعال‌سازی» | Activate | QR has alt text «کد QR تأیید دومرحله‌ای»; key block `dir="ltr"` | TODAY |
| N3 | Wrong / locked / network | as V3, V4, V6 | same components | | | | TODAY |
| N4 | Done | OK | «تأیید دومرحله‌ای فعال شد.» → continue | | | | TODAY |
| N5 | Warning | always | «اگر گوشی خود را گم کنید، فقط مدیر آکادمی می‌تواند دسترسی شما را بازنشانی کند.» | | | | TODAY |
| N6 | Error creating key | setup fails | «مشکلی پیش آمد. دوباره تلاش کنید.» + «تلاش دوباره» | | | | TODAY |

### 2.5 E3 Admin login `/admin/login` (Payload)

| ID | State | Trigger | What Payload does today | Spec (what the skin must show) | Status |
|---|---|---|---|---|---|
| A1 | Empty | Load | Card on paper background, `Logo` (E-031), email + password, «فراموشی رمز» link | Same Frame as E2: welcome, theme-consistent, plus `beforeLogin` line «ورود به بخش مدیریت [نام آکادمی]» and `afterLogin` link «ورود از صفحهٔ کارکنان / کد دومرحله‌ای دارید؟» | UI (skin + 2 injected components) |
| A2 | Wrong credentials | 401 | Payload toast, text from its Persian i18n | Cannot restyle the text; style the toast to the Seal Alert look. Do not add helper text that changes the generic message | UI (CSS only) |
| A3 | Locked | Payload lockout | Payload toast with its message | Same: CSS only; the countdown cannot be added here | BACKEND (and not possible in Payload's form) |
| A4 | Suspended / archived | `beforeLogin` 403 `This account is not active` (English message) | English toast (to verify) | Prefer the Persian text of T5. If message can only come from the hook: change the thrown string to Persian (one-line change in `Users.ts`, **tech-lead decision**, this is not auth logic but touch it consciously) | Needs tiny code change |
| A5 | Pending 2FA | Password OK, session unverified, `/admin` | "Unauthorized" page, dead end | Redirect to `/staff/2fa/verify` (phase 2) | BACKEND-ish (view override + redirect) |
| A6 | Session expired | 8 h | Payload redirects to login | Notice via `beforeLogin` is not possible (no reason info) → none | none |
| A7 | Forgot password | Link | Payload's page; cannot send mail | Hide link via CSS until R1–R3 exist, or keep with honest text of T13 | UI |
| A8 | Network/server | | Payload toast | CSS only | UI |

---

## 3. The brand moment (multi-tenant)

Nothing IBA-specific in code: every value is read from the tenant resolved by Host (`getCurrentTenant`, ADR 005). Only public fields are used before login.

| Element | Source | If missing |
|---|---|---|
| Logo | `tenants.logo` (upload → `media`) via `tenantLogo()` | `AcademyMark` initial: first letter of `tenants.name` on a `bg-brand` tile (exists) |
| Academy name | `tenants.name` | always present (required) |
| Brand colour | `tenants.primaryColor` → `--brand`, `--brand-ink` derived (contrast-safe) | default `#1A56DB` |
| Accent colour | `tenants.accentColor` | default `#F59E0B` (login should not need it; gold stays reserved for milestones) |
| Welcome line (short Persian sentence under the logo) | **Proposed new field** `tenants.loginWelcome` (text, ≤ ۸۰ characters, Branding tab, `settings.edit`). Flagged **BACKEND (config + migration)**. | Fall back to `tenants.tagline`; if empty, nothing (no generic filler, no IBA text) |
| Story panel for option A | `tenants.stats` (value+label, take up to 3), `tenants.tagline`, `tenants.clientLogos` (up to 6, greyscale). Proposed optional `tenants.loginImage` (upload) is **not** needed; do not require it. | Panel collapses to the seal pattern + welcome line; on mobile the panel is hidden anyway |
| Seal / girih watermark | Platform asset (`Brand` Icon, `currentColor`), tinted with `--brand` at 6–10 % | always available |
| Theme | `tenants.defaultTheme` + user toggle (kept from `BareAuthLayout`) | light |
| Support contact on suspended state | `tenants.contact.phone` | omit the line |

Copy examples in the welcome slot: [«خوش آمدید به {نام آکادمی}»] (default, built from `name`, so it is never blank). Do not write IBA claims. Never show the DBA «Ministry of Science» claim (AGENTS.md).

Tenant unknown: today there is no such state (fallback to default tenant). Proposed (BACKEND + decision, §7 Q4): on a host that matches no tenant in production, show a neutral Edvora page, not another academy's login. Copy: H1 «این نشانی به آکادمی‌ای وصل نیست.» Body «نشانی را بررسی کنید یا از پیوند رسمی آکادمی وارد شوید.» No form.

---

## 4. Accessibility and device rules

| Topic | Rule |
|---|---|
| Focus order | Skip link → logo (not a tab stop unless a link) → theme toggle → H1 (programmatic focus target on step change) → fields → submit → secondary links. After an error, focus the first invalid field; for server errors focus the alert only if there is no single field to fix. After step change (phone → code) focus the code field. |
| Labels | Visible `<label>` for every field, never placeholder-only. Hints in `aria-describedby`. Required marked by wording, not colour alone. |
| Autocomplete | Email: `username`. Password: `current-password` (new: `new-password`). SMS code: `one-time-code`. 2FA code: `one-time-code`. Phone: `tel`. Name: `name`. |
| Numeric | OTP and 2FA: `inputmode="numeric"`, `dir="ltr"`. Phone: `inputmode="tel"`. Never `type="number"` (strips leading zero, spinners, drops Persian digits). |
| Digit input | Accept Persian (۰–۹) and Arabic-Indic (٠–٩) digits, spaces, hyphens, `+98`; normalise with `toLatinDigits` / `normalizeIranMobile` / `normaliseCode` before sending. Display digits in Persian in copy, Latin only inside the code/phone/email fields (as the app does). |
| Errors | One `role="alert"` container present in the DOM from load (empty), filled on error so it is announced; one error at a time; no auto-dismiss. Field errors linked with `aria-describedby` + `aria-invalid`. |
| Countdowns | The visible mm:ss changes each second but is **not** `aria-live`; use `role="timer"` (implicitly off). Announce only: the start of the lock (alert once) and the end (polite status). Never announce each tick. |
| Reduced motion | `prefers-reduced-motion`: no slide/parallax/shimmer; the seal watermark is static; transitions limited to colour/opacity ≤ 150 ms. No heavy effects on mid-range Android even without the preference: no blur, no video, no large animated SVG; watermark is a single inline SVG or CSS pattern < ۱۰ KB. |
| Contrast | Text and focus ring ≥ 4.5:1 / 3:1 on both themes with the tenant's colour. Use `--brand-ink` for text on `bg-brand`, `--brand-text` for brand-coloured text on paper. A brand-colour tint behind text (split panel) must be checked per tenant: darken the tint automatically if ratio fails; never gray text on colour. Error colour needs an icon or the word «خطا» too, not colour only. |
| RTL | Logical utilities only (`ms-`, `pe-`, `start-`). Mixed-direction values (email, phone, code, URL) in `dir="ltr"` spans and aligned to the end/start consistently. Split layout mirrors: story panel on the visual start. |
| Touch and keyboard | Targets ≥ 44 px. Submit remains visible when the soft keyboard is open (sticky or the form scrolls into view; test 360×640 with keyboard). Enter submits. `100dvh`, not `100vh`. No horizontal overflow at 375 px. |
| Password manager / autofill | Do not block paste; do not use `autocomplete="off"` anywhere. |
| Language | `lang="fa" dir="rtl"` on the page; Latin fragments get `lang="en"` only where meaningful. |
| Offline-first constraints | Self-hosted fonts (Vazirmatn UI, Morabba display for H1 only, Space Grotesk for codes), no external scripts, images or fonts. Login must be usable at ≤ 200 KB first load and with images failing (logo has alt text). |

---

## 5. Persian copy rules

1. Warm, brief, second person polite («شما»). One idea per message, ≤ 12 words where possible.
2. No blame («اشتباه کردید» no; «کد درست نیست» yes). Say what to do next.
3. Never reveal whether an account exists: wrong email, unknown email, student account tried on staff login, and reset requests all return the same text (T4, R1). Suspension is revealed only after authentication succeeded (S15, T5).
4. Half-spaces: «دومرحله‌ای», «پیامک‌شده», «می‌توانید», «ورودی‌ها», «به‌روزرسانی». Persian digits in every number in copy (`toPersianDigits`); Latin digits inside codes, phone, email, URLs.
5. Use «شما»; avoid exclamation marks and emoji; use «…» (single character) for loading, never "...".
6. Buttons are verbs: «دریافت کد ورود», «ورود», «تأیید و ادامه». One primary button per screen.
7. Times: «۱۵ دقیقه», «۲ دقیقه»; countdown «۰۱:۳۰» in Persian digits, `dir="ltr"`.
8. Never mention internal terms (`session`, `token`, `403`, `TOTP`) to users; «برنامهٔ احراز هویت» for authenticator app.
9. Contact lines come from tenant config (`contact.phone`); if empty, say «با مدیر آکادمی تماس بگیرید».
10. Tenant welcome line is the academy's voice; all other lines are the platform's and must read the same for every academy.

### Copy sheet (new strings beyond §2; existing strings stay as they are)
| Key | Text |
|---|---|
| `student.title` | ورود یا ثبت‌نام |
| `student.sub` | شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست. |
| `student.editPhone` | ویرایش شماره |
| `student.resendIn` | ارسال دوباره‌ی کد تا ۰۰:۴۵ دیگر |
| `student.resend` | کد نرسید؟ ارسال دوباره |
| `student.staffLink` | کارمند آکادمی هستید؟ ورود کارکنان |
| `student.newUserName` | نام و نام خانوادگی (فقط بار اول) |
| `staff.sub` | [برای ورود به میز کار و بخش مدیریت.] |
| `staff.studentLink` | دانشجو هستید؟ ورود با شماره موبایل |
| `staff.expired` | نشست شما تمام شده است. دوباره وارد شوید. |
| `staff.out` | از حساب خارج شدید. |
| `staff.forgot` | رمز را فراموش کرده‌اید؟ از مدیر آکادمی بخواهید رمز تازه برایتان تعیین کند. |
| `staff.phoneInEmail` | اینجا ایمیل کارکنان لازم است. دانشجو هستید؟ [با شماره موبایل وارد شوید]. |
| `admin.before` | ورود به بخش مدیریت {نام آکادمی} |
| `admin.after` | کد دومرحله‌ای دارید؟ از صفحهٔ ورود کارکنان وارد شوید. |
| `net.retry` | تلاش دوباره |
| `maint.title` | در حال به‌روزرسانی هستیم |
| `lock.generic` | ورود موقتاً بسته شده است. [n] دقیقهٔ دیگر دوباره امتحان کنید. |

---

## 6. Low-fi wireframes

Layout-neutral: blocks marked `[Frame]` (logo, welcome, theme toggle, story) can be arranged as (A) split screen, (B) centred seal card with girih/guilloche watermark, (C) minimal ink page with large Morabba headline. The **Form card** content is identical in all three. Data source tags in `⟨ ⟩`.

### 6.1 Student: phone step (S1)
```
[Frame]  logo ⟨tenants.logo / name⟩            [☀/☾ theme toggle]
         welcome line ⟨tenants.loginWelcome → tagline⟩  (optional)
[Form card]
  H1  ورود یا ثبت‌نام                          purpose: name the task (Morabba in option C)
  sub  شماره موبایل خود را بنویسید…            purpose: reassure, "no password"
  label شماره موبایل
  [ ۰۹۱۲۳۴۵۶۷۸۹                    ]  ltr, tel keypad, autocomplete=tel
  [alert region: S3/S5/S6/S7]                  role=alert, present but empty
  [ دریافت کد ورود ]   primary, brand colour   → requestOtp
  footer: کارمند آکادمی هستید؟ ورود کارکنان    → /staff/login
  (optional) «مشاوره می‌خواهید؟ تماس با مشاور» → advisor path (lead form), ⟨leads⟩
```
Primary: send code · Secondary: staff link / advisor callback · First-time = returning.

### 6.2 Student: code step (S10–S14)
```
[Frame]
[Form card]
  H2  کد را وارد کنید
  کد ۵رقمی به ‎۰۹۱۲۳۴۵۶۷۸۹ پیامک شد.   [ویرایش شماره]   → back to phone step
  label کد ورود
  [  ·  ·  ·  ·  ·  ]  one-time-code, numeric, ltr, paste ok
  (new users only) label نام و نام خانوادگی (فقط بار اول)  [____________]
  [alert region: S12/S13/S14/S15]
  [ ورود ]  primary
  ارسال دوباره‌ی کد تا ۰۰:۴۵ دیگر  →  «کد نرسید؟ ارسال دوباره»  (button)
```
Dev only (mock SMS): the «حالت توسعه» code notice stays out of the design; keep it as a plain unstyled dev box.

### 6.3 Staff: login (T1) → 2FA (V1)
```
[Frame]  logo + name                                  [theme]
[Form card]
  H1  ورود کارکنان
  sub [برای ورود به میز کار و بخش مدیریت.]
  [notice region: T11 expired / T12 logged out]      role=status
  [alert region: T4–T9]                              role=alert
  label ایمیل      [ name@example.com            ]  username, ltr
  label رمز عبور   [ ••••••••••         ] [👁]      current-password, toggle
  [ ورود ]
  help: رمز را فراموش کرده‌اید؟ از مدیر آکادمی بخواهید…
  [ دانشجو هستید؟ ورود با شماره موبایل ]  secondary

────────── next screen (same Frame) ──────────
  H1  تأیید دومرحله‌ای
  کد ۶رقمی را از برنامهٔ احراز هویت گوشی خود وارد کنید.
  ‎name@example.com‎
  [lock banner: V4 with ۱۴:۵۹]  /  [alert: V2,V3]
  label کد تأیید   [ ۶ digits ]
  [ تأیید و ادامه ]
  ▸ گوشی خود را ندارید؟  (details)
  [ خروج از حساب ]   POST /staff/logout
```

### 6.4 Admin login (A1) — Payload form, skin only
```
[Frame injected by beforeLogin]  logo ⟨Logo graphic⟩  «ورود به بخش مدیریت {نام آکادمی}»
[Payload form]  ایمیل / رمز عبور / ورود   (fields and toasts are Payload's, restyled)
[afterLogin]    کد دومرحله‌ای دارید؟ از صفحهٔ ورود کارکنان وارد شوید.  → /staff/login
```
Constraint: the form box itself keeps Payload's markup; only wrapper, background, typography, buttons, toasts are styled.

### 6.5 Locked state (V4 shown; S14 / T6 use the same banner)
```
[Frame]
[Form card]
  H1  تأیید دومرحله‌ای
  ┌ lock banner (border danger, icon + word «قفل») ───────────────┐
  │ چند بار کد اشتباه وارد شد. تا ۱۵ دقیقهٔ دیگر امکان ورود ندارید. │  role=alert (once)
  │ زمان باقی‌مانده:  ۱۴:۵۹                                        │  role=timer, not live
  └───────────────────────────────────────────────────────────────┘
  label کد تأیید   [ ______ ]  disabled
  [ تأیید و ادامه ]  disabled
  [ خروج از حساب ]   enabled
  at 00:00: banner removed, fields enabled, polite status «می‌توانید دوباره امتحان کنید.»
```

### 6.6 Per-option notes for the designer
| | A · Split with the academy story | B · Centred seal card | C · Minimal ink page |
|---|---|---|---|
| Frame content | Story panel (tagline, up to 3 stats, greyscale client logos) at the visual start; form at the end. Panel hidden below `md`: mobile shows logo + welcome only. | Card centred on paper; girih/guilloche watermark in `--brand` at low opacity behind/around the card; logo as seal above the card. | Large Morabba headline (welcome line or `name`) top, form beneath; hairline rules, no card. |
| Risk | Tint contrast per tenant colour; panel must not push the form below the fold on 360×640. | Watermark weight on low-end phones: static SVG, no blur. | Long academy names wrapping; clamp to 2 lines. |
| Must stay | Same states, same copy, same alert regions, same tab order, no gold. | | |

---

## 7. Open issues and questions for Farjad

1. **Unify staff and admin login?** Recommendation above (staff login canonical; `/admin/login` as doorway). OK to ask tech-lead for the `/admin` redirect + allow `next=/admin`?
2. **Welcome line field** `tenants.loginWelcome` (and fallback to `tagline`): approve adding it (Branding tab + migration)? Who writes IBA's line? `TODO(client)`.
3. **Forgot password**: no email adapter and email delivery in Iran is unreliable. Options: (a) admin resets (today), (b) SMS-based reset, (c) email. Needs an ADR before any UI beyond the honest help text.
4. **Unknown host**: today it silently shows the default academy. Show a neutral "no academy here" page instead? (BACKEND decision.)
5. **Lockout countdown for passwords** and **attempts-left for SMS code**: need server responses that do not exist. Worth adding, or keep generic copy?
6. **Info leak check — verified in `payload/dist/auth/operations/login.js` (3.93):** `beforeLogin` runs *after* the password is verified, so the suspended/archived message only shows to someone who knew the password (no existence leak). A locked account throws `LockedAuth` with HTTP **401** (same status as wrong credentials; distinguishable only by error name/message) and the response carries no `lockUntil`, so the form's 423/429 mapping never fires and a countdown needs a server change (BACKEND).
7. **Maintenance mode** flag (env or tenant): wanted now or later?
8. **Admin suspended message** is English (`This account is not active`) in Payload's toast; OK to change the string to Persian?
9. **Support phone** for suspended students: use `tenants.contact.phone`; IBA value `TODO(client)`.
10. Recovery codes for 2FA are not planned; confirm that «ask the admin to reset» remains the only path.

---

## Handoff
- **Task:** E-034 step 1 · UX spec for the login experience (student OTP, staff + 2FA, Payload admin).
- **Output:** `docs/ux/E-034-login.md` (state inventory ~60 states with status flags, brand-moment data map, a11y, copy sheet, ASCII wireframes for A/B/C).
- **Decisions made:** Staff login `/staff/login` is the canonical branded staff+admin door; `/admin/login` is skinned now (beforeLogin/afterLogin/CSS/Logo) and becomes a redirect doorway later; student login stays separate but visually one family; no gold on login; welcome line is tenant config with fallback to `tagline` then to the name.
- **Open issues:** §7 (notably unknown host fallback, password-lock mapping/status, forgot-password, maintenance flag, `loginWelcome` field).
- **Next owner:** `ui-designer` (visual options A/B/C), then `tech-lead` for the **BACKEND** rows (S9, S12 attempts-left, S20, S21, T6 countdown, T12 flag, R1–R3, A5 redirect, `loginWelcome`).
