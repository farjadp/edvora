# E-022 · `/staff` desk shell + staff 2FA screens — UX

Step 1 of 3 (ux-architect → ui-designer → tech-lead). Builds on ADR 005/006/007, E-021, `@edvora/ui` tokens.
Persian copy uses half-spaces and Persian digits; `[brackets]` = placeholder to confirm. Desk contents are **placeholders** (E-015 / E-023 / E-024).
All strings are tenant-neutral: the academy name, logo and colours come from `tenants` (`name`, `branding.logo`, `primaryColor`, `accentColor`, `defaultTheme`) via `tenantPalette`.

## 0. Facts that shape the design

- Students log in by SMS and get the `edvora_session` cookie. **Staff authenticate with Payload (email + password, `payload-token` cookie + `sid`)**. Two separate sessions. `/staff` only trusts the Payload one.
- Today the only staff login is Payload's `/admin/login`. A pending-2FA session gets "unauthorized" there. So E-022 needs its own **`/staff/login`** (email + password, posts to `/api/users/login`, then full navigation per ADR 005) or the whole 2FA flow cannot start from `/staff`.
- While a session is pending 2FA, permissions resolve to nothing. Pending pages (`login`, `verify`, forced `enrol`) therefore render **without nav and without permission lookups**. They show only the academy (public tenant data) and the account email.
- `/admin` is open to any staff today (`isStaffRequest`). The nav link to it is a convenience filter, not a security boundary.

## 1. Route map

```
/staff                    → resolves landing desk (§3), redirects; neutral "Start" page if none matches
/staff/login              bare layout   email + password
/staff/2fa/verify         bare layout   enter code for this session
/staff/2fa/enrol          bare layout   forced enrolment (STAFF_2FA_REQUIRED and not enrolled)
/staff/overview | leads | finance | students | teaching | support | content     shell layout, placeholders
/staff/security           shell layout  2FA status, turn on (inline enrol steps), turn off
```

```mermaid
flowchart TD
  A[GET /staff/*] --> B{Payload session?}
  B -- no --> L[/staff/login?next=…/]
  B -- yes --> C{account active?}
  C -- no --> L2[/staff/login + 'حساب غیرفعال']
  C -- yes --> D{2FA state}
  D -- enabled, session not verified --> V[/staff/2fa/verify?next=…/]
  D -- required by flag, not enrolled --> E[/staff/2fa/enrol?next=…/]
  D -- ok --> F{active membership in THIS academy, or platform admin?}
  F -- no --> X1[403 · not a member]
  F -- yes --> G{any staff permission?}
  G -- no --> X2[403 · student/no access]
  G -- yes --> H{page needs permission P?}
  H -- lacks P --> X3[403 · desk, inside shell]
  H -- ok --> OK[render desk]
```

Order matters: 2FA is checked **before** any 403, so a pending session never learns which roles exist. `next` must start with `/staff` and not `//`. Anonymous visitors get no hint whether a path exists.

## 2. Shell layout

```
DESKTOP (≥ 1024px)  RTL — nav on the inline-start (right) edge
┌────────────────────────────────────────────────────────────────────────┐
│ [logo] نام آکادمی ▾        عنوان صفحه          [☾ تم]  [م] نام کاربر ▾ │ header 56px
├──────────────┬─────────────────────────────────────────────────────────┤
│ ▣ نمای کلی   │                                                         │
│ ▣ مشتریان    │   <main>  page title (h1) · primary action              │
│ ▣ مالی       │   desk content / placeholder                            │
│ ▣ دانشجویان  │                                                         │
│ ▣ آموزش      │                                                         │
│ ▣ پشتیبانی   │                                                         │
│ ▣ محتوا      │                                                         │
│ ──────────── │                                                         │
│ ⚙ تنظیمات و  │                                                         │
│   راه‌اندازی ↗│                                                         │
│ 🔒 امنیت حساب │                                                         │
└──────────────┴─────────────────────────────────────────────────────────┘
MOBILE (< 1024px)
┌──────────────────────────────┐
│ ☰  نام آکادمی        [م]     │  ☰ opens the drawer (all items); [م] user menu
├──────────────────────────────┤
│  main                        │
├──────────────────────────────┤
│ مشتریان│مالی│دانشجویان│⋯ بیشتر│  bottom bar: first 4 permitted desks by §3 order;
└──────────────────────────────┘  "بیشتر" opens the drawer (rest + ⚙ + 🔒). Hidden if ≤ 4 items total.
```

| Element | Purpose | Data |
| --- | --- | --- |
| Academy block (logo + name) | Tenant indicator, link to `/staff` | `tenants.name`, `branding.logo`; Latin host shown in the user menu |
| User menu | Who am I, role, security, exit | `users.name/email`; role names from the membership's `roles.name` |
| Theme toggle | Light default, dark toggle | existing `ThemeToggle` |
| Nav | Permission-filtered (§4); active item `aria-current="page"` | `AccessContext` for this tenant |

Rules: single column on mobile, no blur/shadow animation, touch targets ≥ 44px, drawer is a plain slide (respect `prefers-reduced-motion`), `<meta robots noindex>`, no external assets. Desktop nav never collapses (≤ 8 items). The staff shell does **not** use the public Stream header.

First-time vs returning: no difference in the shell; first-time staff with 2FA off see a dismissible card on their landing desk: «حساب خود را امن‌تر کنید — تأیید دومرحله‌ای را روشن کنید» → `/staff/security` (hidden once on, or when the academy requires it, since they would be forced anyway). Dismissal stored per user in `localStorage`.

### Tenant indicator

Header always shows the academy name (+ logo). User menu shows `نام آکادمی · host` (Latin, LTR, e.g. `demo.localhost`). Tenant brand colours tint the header's active nav item only, so two academies in two tabs are distinguishable by name/logo/colour, not by a banner. **No switcher**: another academy = another host. If the same person is not a member of this host's academy, §6 "not a member" explains it.

## 3. Landing rule

Permissions are unioned across the roles of the user's (single) active membership in **this** tenant. Memberships are per academy and the host picks the academy, so "several memberships" = several academies (separate hosts), never a merge. Several roles in one membership = union.

`/staff` redirects to the **first** desk whose condition is true:

| # | Desk (route) | Lands here if the user has ANY of |
| --- | --- | --- |
| 1 | overview `/staff/overview` | `roles.manage`, `settings.edit` |
| 2 | leads `/staff/leads` | `leads.view.own`, `leads.view.all` |
| 3 | finance `/staff/finance` | `orders.view`, `payments.manual.approve`, `refunds.approve`, `finance.export` |
| 4 | support `/staff/support` | `tickets.view.own`, `tickets.view.all` |
| 5 | teaching `/staff/teaching` | `assignments.grade`, `live.host`, `qa.answer`, `defense.score`, `lessons.edit` |
| 6 | content `/staff/content` | `content.edit`, `content.publish`, `media.upload` |
| 7 | none | stay on `/staff` and show the neutral **Start** page (cards for every nav item the user can see, plus security) |

Template check: academy-admin → overview · advisor → leads · finance → finance · support → support · instructor → teaching · content-editor → content · student → 403. Advisor also holds `users.view`+`enrollments.view`, so they get the Students item but the Students desk is never a landing target (support lands on tickets; E-024 may move this). Platform admin (`super-admin`) without membership → overview.
Priority is a constant list in code (one table, tested); a custom role needs nothing but permissions. Deliberately **no "remember last desk"** in v1.

## 4. Navigation from permissions

Show an item if the user has **any** key listed (scoped keys satisfy base keys via `satisfies`). Order = this table.

| Item (fa) | Route | Shown for any of |
| --- | --- | --- |
| نمای کلی | `/staff/overview` | `roles.manage`, `settings.edit`, `audit.view` |
| مشتریان بالقوه (nav: «مشتریان») | `/staff/leads` | `leads.view.own`, `leads.view.all` |
| مالی | `/staff/finance` | `orders.view`, `payments.manual.approve`, `refunds.approve`, `finance.export`, `reports.finance` |
| دانشجویان (Student 360) | `/staff/students` | `users.view` **and** `enrollments.view` |
| آموزش | `/staff/teaching` | `assignments.grade`, `live.host`, `qa.answer`, `defense.score`, `lessons.edit` |
| پشتیبانی | `/staff/support` | `tickets.view.own`, `tickets.view.all` |
| محتوا | `/staff/content` | `content.edit`, `content.publish`, `media.upload` |
| — separator — | | |
| تنظیمات و راه‌اندازی ↗ (`/admin`, new tab off, same tab) | `/admin` | `settings.edit`, `roles.manage`, `roles.assign`, `users.create`, `users.edit`, `courses.edit`, `courses.publish`, `pricing.edit`, `cohorts.manage`, `lessons.edit`, `content.edit`, `templates.edit` |
| امنیت حساب | `/staff/security` | **every** staff user (no key) |

Notes: «Student 360» label stays internal; staff see «دانشجویان». Desk pages repeat the same check server-side (`requirePermission`) — hiding a link never grants or protects anything. `/staff/security` and the pending pages need no permission beyond being a signed-in staff user (security: ≥1 active membership permission, or platform admin).
Tech-lead: because `/admin` itself admits any staff, either tighten `isStaffRequest` for `/admin` to match the list above or accept the link filter as cosmetic.

## 5. Desk placeholders

Same block on every desk: h1 = desk name, an icon-less card, one sentence of what lands here, one honest line that it is not ready, optional link to the Payload list where this user has access. No dates, no fake numbers, no skeletons.

```
┌──────────────────────────────────────────┐
│  مشتریان بالقوه                           │  h1
│ ┌──────────────────────────────────────┐ │
│ │ این میز هنوز آماده نیست.              │ │  title
│ │ [صف کار روزانهٔ مشاوران، تماس‌ها و    │ │  what will be here
│ │ پیگیری‌ها اینجا نمایش داده می‌شود.]    │ │
│ │ تا آن زمان کار با فهرست در بخش        │ │
│ │ تنظیمات و راه‌اندازی انجام می‌شود.     │ │  only if user can enter /admin
│ │ [ رفتن به فهرست مشتریان بالقوه ↗ ]    │ │  secondary-looking link, hidden otherwise
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

| Desk | "What will be here" [placeholder] | Link target (if permitted) |
| --- | --- | --- |
| overview | [خلاصهٔ وضعیت آکادمی: فروش، ثبت‌نام‌ها و کارهای نیازمند توجه.] | `/admin` |
| leads | [صف کار روزانهٔ مشاوران، تماس‌ها و پیگیری‌ها.] | `/admin/collections/leads` |
| finance | [پرداخت‌ها، اقساط، رسیدهای دستی و بازگشت وجه.] | `/admin/collections/orders` |
| students | [پروندهٔ کامل هر دانشجو: ثبت‌نام، پرداخت‌ها و پیام‌ها.] | none |
| teaching | [دوره‌ها و گروه‌های شما، تکالیف و کلاس‌های زنده.] | `/admin/collections/courses` |
| support | [درخواست‌های پشتیبانی و پاسخ به آن‌ها.] | none |
| content | [متن صفحه‌ها، مقاله‌ها و رسانه‌ها.] | `/admin/collections/posts` |

(Collection slugs: tech-lead to confirm; omit the link if the collection is missing or the user lacks read.)
Empty vs placeholder: once a desk is built, its own empty state (no leads today etc.) belongs to that epic. Load failure on any desk: card «بارگذاری نشد. دوباره تلاش کنید.» + button «تلاش دوباره» (full reload, no stack trace).
Start page (no matching desk): «میز کاری برای نقش شما تعریف نشده است.» + cards for visible nav items; if none besides security: «هنوز به بخشی دسترسی ندارید. از مدیر آکادمی بخواهید دسترسی شما را بررسی کند.»

## 6. Access outcomes

| Who | Result |
| --- | --- |
| Anonymous (or only a student SMS cookie) | 302 `/staff/login?next=<path>`; after login → `next` (default `/staff`) |
| Disabled/archived account | login page error, no session kept |
| 2FA on, session unverified | `/staff/2fa/verify?next=` |
| Flag on, staff not enrolled | `/staff/2fa/enrol?next=` (forced) |
| Signed in, **no active membership here** (or expired/suspended) | 403 variant A |
| Signed in, no staff permission at all (student) | 403 variant B |
| Staff, lacks the permission for this desk | 403 variant C (shell stays, nav intact) |

**403 page** (HTTP status really 403; `noindex`). Layout: centered card, «۴۰۳» large (Persian digits), title, body, 1 primary + 1 secondary button.

| | A · not a member / inactive | B · student | C · desk |
| --- | --- | --- | --- |
| Title | شما در این آکادمی دسترسی کارکنان ندارید | این بخش مخصوص کارکنان آکادمی است | به این بخش دسترسی ندارید |
| Body | دسترسی شما به این آکادمی وجود ندارد یا غیرفعال شده است. اگر در آکادمی دیگری کار می‌کنید، از نشانی همان آکادمی وارد شوید. | با حساب دانشجویی وارد شده‌اید. میز کارکنان برای دانشجویان باز نیست. | حساب شما اجازهٔ دیدن این صفحه را ندارد. اگر فکر می‌کنید اشتباه شده، از مدیر آکادمی بخواهید دسترسی شما را بررسی کند. |
| Primary | خروج از حساب | رفتن به پنل دانشجو (`/dashboard`) | بازگشت به میز کار من (landing) |
| Secondary | بازگشت به سایت (`/`) | خروج از حساب | خروج از حساب |
| Detail line | — | — | `کد دسترسی: leads.view` (Latin, LTR, muted; helps the admin) |

Logout for staff needs a route handler that ends the Payload session (303, ADR 005); today's `/logout` only clears the student cookie.

## 7. 2FA flows

### 7.1 Login `/staff/login`
Fields: ایمیل (LTR input), رمز عبور. Primary «ورود». Secondary link «دانشجو هستید؟ ورود با شماره موبایل» → `/login`. Failure: single generic error (never say which field). After success: full navigation to `next`; the guard then routes to verify/enrol if needed. Rate-limit/lock messages come from Payload.

### 7.2 Verify per session `/staff/2fa/verify`
```
        [logo] نام آکادمی
 ┌─────────────────────────────────────┐
 │ تأیید دومرحله‌ای                     │
 │ کد ۶‌رقمی را از برنامهٔ احراز هویت    │
 │ گوشی خود وارد کنید.   (ali@…)        │
 │ کد تأیید  [ ۱۲۳ ۴۵۶ ]  inputmode=numeric,
 │                       autocomplete=one-time-code, LTR
 │ [ تأیید و ادامه ]                    │ primary (no auto-submit: typos cost tries)
 │ ‌‌گوشی خود را ندارید؟  (expand help)  │
 │ خروج از حساب                         │ secondary
 └─────────────────────────────────────┘
```
Input accepts Persian digits and spaces (`toLatinDigits`, strip spaces). Success → `next` (full navigation). Wrong code (401) → inline `role="alert"`; after 2 failures add the clock hint. Network error → retry message, attempts untouched. First-time vs returning: identical; returning users on the same device get it again every new session (by design, ADR 007).
**Lockout** (5 wrong codes → 15 min): input and button disabled, message with countdown (`mm:ss`, Persian digits); «خروج از حساب» stays. Help text names the only recovery: ask an admin to reset. Backend gaps to close (§9): the 5th wrong code returns 401 (not 429), and no response carries `lockedUntil` or attempts left.

### 7.3 Enrol (voluntary) — inside `/staff/security`, and forced `/staff/2fa/enrol`
Same component, three steps on one page (mobile: stacked).
```
۱. برنامه نصب کنید      (Google Authenticator، FreeOTP، Aegis یا مشابه)
۲. [ QR ]   or on phones primary button «باز کردن در برنامهٔ احراز هویت» (href = otpauthUri)
   کلید دستی:  ABCD EFGH IJKL MNOP   [کپی کلید]      (groups of 4, LTR, monospace Latin)
۳. کد ۶‌رقمی  [ ______ ]   [ فعال‌سازی ]
⚠ اگر گوشی خود را گم کنید، فقط مدیر آکادمی می‌تواند دسترسی شما را بازنشانی کند.
```
- Data: `POST /api/users/2fa/setup` → `secret`, `otpauthUri` (called on click «شروع» in the voluntary flow, on mount in the forced flow; **reloading creates a new secret** — say so under the QR). `POST …/enable { code }`.
- QR must be generated locally (SVG, no CDN). Needs a small QR encoder: tech-lead decides dependency vs a tiny encoder in `packages/core` (bare-pages rule: client components import subpaths only).
- Same phone = can't scan its own screen, hence the deep-link button and manual key (many advisors work on one phone).
- Success: «تأیید دومرحله‌ای فعال شد» + «ادامه» (to `next`/landing). Enable also verifies the current session, no second prompt.
- Failure: same code-error and lockout states as 7.2. Already enrolled (409) → go to security page status.
- **Forced mode** (`STAFF_2FA_REQUIRED=true`, not enrolled): bare layout, banner «مدیر آکادمی تأیید دومرحله‌ای را برای همهٔ کارکنان الزامی کرده است. برای ادامه، آن را فعال کنید.», no skip, only «خروج از حساب».
- **Recovery codes — recommendation: do NOT build in E-022.** Backend has none; adding means schema + hashing + consume path + print/save UI + tests. v1 recovery = admin reset (§7.5). Risk accepted: a sole academy admin who loses the phone needs Edvora platform staff. Open as follow-up E-022b (8 one-time codes shown once at enrol, usable at verify, regenerate with a code).

### 7.4 Disable `/staff/security`
Status card: «تأیید دومرحله‌ای: روشن/خاموش». Off → «روشن‌کردن» starts 7.3. On → «خاموش‌کردن» opens an inline panel: «برای خاموش‌کردن، کد فعلی را وارد کنید.» + code input + «خاموش‌کردن» (danger style) / «انصراف». Success → status off + notice. When the flag is on the button is replaced by the text «تأیید دومرحله‌ای در این آکادمی الزامی است و خاموش نمی‌شود.» (Backend `disable` does not check the flag today → add a 409.) Failure/lock: as 7.2.

### 7.5 Admin reset (lost phone)
- **Permission:** new `users.2fa.reset`, group `users` in the catalog; granted to academy-admin automatically (via `ACADEMY_PERMISSIONS`; `pnpm seed` re-syncs templates), no other template. Label: «بازنشانی تأیید دومرحله‌ای».
- **Where:** Payload `/admin` → Users → edit user → Security group: button «بازنشانی تأیید دومرحله‌ای», visible only if the actor holds the permission **and** the target has 2FA on. (Setup-layer task; avoids building a team desk in E-022.)
- **Rules:** not on yourself; not on someone whose access you could not grant (existing no-escalation helper); platform-admin accounts only by platform admins; **2FA is per account, not per academy** — allow only if the actor holds the permission in every academy where the target has an active staff membership, otherwise show «این کاربر در آکادمی دیگری هم کارمند است؛ بازنشانی فقط توسط پشتیبانی ادورا ممکن است.»
- **Confirm dialog:** names the person, states the effects (key deleted, all their sessions end, they sign in with password and set 2FA again if required). Buttons «بازنشانی» (danger) / «انصراف». No typed confirmation.
- **Effect:** `twoFactorEnabled=false`, clear `twoFactor.*`, revoke the target's sessions, audit `users.2fa.reset` (actor, target, tenants) in the same transaction; fire-and-forget SMS to the target via the SMS adapter (log, never throw). Failure → «بازنشانی انجام نشد. دوباره تلاش کنید.»

## 8. Persian copy (key strings)

| Key | Text |
| --- | --- |
| Nav / menu | نمای کلی · مشتریان · مالی · دانشجویان · آموزش · پشتیبانی · محتوا · تنظیمات و راه‌اندازی · امنیت حساب · مشاهدهٔ سایت · خروج · بیشتر |
| Page `<title>` | میز کار · [نام آکادمی] |
| Login title / button | ورود کارکنان · ورود |
| Login errors | ایمیل یا رمز عبور درست نیست. · حساب شما غیرفعال است. با مدیر آکادمی تماس بگیرید. · ورود موقتاً بسته شده است. چند دقیقه بعد دوباره امتحان کنید. |
| Verify | تأیید دومرحله‌ای · کد تأیید · تأیید و ادامه · خروج از حساب |
| Verify help | گوشی خود را ندارید؟ از مدیر آکادمی بخواهید تأیید دومرحله‌ای حساب شما را بازنشانی کند. |
| Code errors | کد درست نیست. دوباره امتحان کنید. · کد را شش‌رقمی وارد کنید. · هنوز درست نیست؟ ساعت گوشی باید روی حالت خودکار باشد. · چند بار کد اشتباه وارد شد. تا ۱۵ دقیقهٔ دیگر امکان ورود ندارید. زمان باقی‌مانده: [۱۴:۵۹] · اتصال برقرار نشد. اینترنت خود را بررسی و دوباره تلاش کنید. · مشکلی پیش آمد. دوباره تلاش کنید. |
| Enrol | فعال‌سازی تأیید دومرحله‌ای · ۱. یک برنامهٔ احراز هویت روی گوشی نصب کنید. · ۲. کد QR را اسکن کنید. · اگر نمی‌توانید اسکن کنید، این کلید را دستی وارد کنید: · کپی کلید · کپی شد · باز کردن در برنامهٔ احراز هویت · ۳. کد شش‌رقمی‌ای را که برنامه نشان می‌دهد وارد کنید. · فعال‌سازی · با بارگذاری دوبارهٔ صفحه، کلید جدیدی ساخته می‌شود. |
| Enrol result | تأیید دومرحله‌ای فعال شد. از این پس در هر ورود جدید، کد را می‌پرسیم. · ادامه |
| Enrol warning | اگر گوشی خود را گم کنید، فقط مدیر آکادمی می‌تواند دسترسی شما را بازنشانی کند. |
| Forced banner | مدیر آکادمی تأیید دومرحله‌ای را برای همهٔ کارکنان الزامی کرده است. برای ادامه، آن را فعال کنید. |
| Security page | امنیت حساب · تأیید دومرحله‌ای · روشن · خاموش · با روشن‌کردن آن، علاوه بر رمز عبور، کدی از گوشی شما هم لازم است. توصیه می‌کنیم روشن کنید. · روشن‌کردن · خاموش‌کردن · برای خاموش‌کردن، کد فعلی را وارد کنید. · تأیید دومرحله‌ای خاموش شد. |
| Promo card | حساب خود را امن‌تر کنید. تأیید دومرحله‌ای را روشن کنید. · روشن‌کردن · بعداً |
| Admin reset | بازنشانی تأیید دومرحله‌ای · بازنشانی تأیید دومرحله‌ای برای [نام کاربر]؟ · کلید فعلی حذف می‌شود و [نام کاربر] از همهٔ دستگاه‌ها خارج می‌شود. او با رمز عبور وارد می‌شود و در صورت لزوم دوباره تأیید دومرحله‌ای را فعال می‌کند. این کار در گزارش رویدادها ثبت می‌شود. · بازنشانی · انصراف · تأیید دومرحله‌ای [نام کاربر] بازنشانی شد. |
| Placeholder | این میز هنوز آماده نیست. · تا آن زمان کار با فهرست در بخش تنظیمات و راه‌اندازی انجام می‌شود. · رفتن به فهرست [نام بخش] · بارگذاری نشد. دوباره تلاش کنید. · تلاش دوباره |
| Start page | میز کاری برای نقش شما تعریف نشده است. · هنوز به بخشی دسترسی ندارید. از مدیر آکادمی بخواهید دسترسی شما را بررسی کند. |
| 403 | see §6 table; «۴۰۳» |

## 9. Backend/engineering needs implied by the UX (for tech-lead)

1. `POST verify/enable/disable`: return 429 with `lockedUntil` on the 5th failure (today 401), and `attemptsLeft` on 401.
2. A server helper returning the staff gate state: `anonymous | disabled | needs-verify | needs-enrol | no-membership | no-permissions | ok` (+ `locked until`).
3. `disable` refuses when `STAFF_2FA_REQUIRED=true`.
4. Reset endpoint + `users.2fa.reset` in the catalog + audit row + session revoke + Persian label for the role editor.
5. Staff logout route handler; `/staff/login` form (client, `useRedirectTo`).
6. QR rendering without external services.

## 10. Open questions for Farjad

1. Is a dedicated `/staff/login` (email + password) approved, and should `/admin/login` keep working in parallel? (Recommended: yes, both.)
2. Recovery codes: confirm deferral to E-022b; a sole admin who loses their phone is rescued by Edvora platform staff.
3. 2FA reset across academies: OK to restrict to "actor holds the permission in all the person's academies", else platform-only?
4. Should `/admin` access be narrowed to setup permissions (§4), or leave all staff able to open it?

### Working answers for this build (until Farjad says otherwise)
1. Yes: `/staff/login` is added and `/admin/login` keeps working.
2. Recovery codes are deferred to E-022b.
3. The "all academies" rule for reset applies (platform admins can always reset).
4. `/admin` access is not narrowed in E-022; that becomes a follow-up. The nav link filter is cosmetic for now.
5. There is no SMS on admin reset in v1 (no template exists and staff may have no mobile). The audit row is the record.
