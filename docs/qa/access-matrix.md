# Access matrix — E-041 baseline

**Date:** 2026-11-08 · **Commit:** `b69983b` (develop) · **Tester:** access-tester agent · **Where:** local stack, own
database `edvora_access`, `demo` academy (+ a local `demo2` test academy), mock SMS/payment. `iba` untouched.

This is the baseline before E-039 (role settings) and E-040 (profiles) change roles and profiles.

**Expected** comes from the permission catalog (`packages/core/src/permissions.ts`), the role templates in the same
file, the desk table (`packages/core/src/staff.ts`) and ADR 006. **Actual** is what the running app answered.
✅ match · ❌ mismatch (bug in [`bugs.md`](bugs.md)) · ⚠️ spec unclear or a gap.

## How to reproduce

```bash
pnpm db:up && pnpm seed
pnpm --filter @edvora/web seed:access      # cast below; passwords → apps/web/.env as ACCESS_<KEY>_PASSWORD
pnpm dev
E2E_NO_SERVER=1 pnpm e2e e2e/tests/access-matrix.spec.ts   # the matrix as a test (own cast per run)
```

`seed:access` refuses `NODE_ENV=production` (unless `ALLOW_DEMO_SEED=true`) and any tenant other than `demo`.

## The cast (16 users + super admin + anonymous)

Emails `access+<key>@edvora.demo`. Students use phones `0912999020x` (seed's fake range).

| key | Membership in `demo` | Notes |
| --- | --- | --- |
| `super` | — (platform `super-admin`) | the seed's admin, reused |
| `academy-admin` | academy-admin | |
| `advisor` | advisor | owns lead `09129990211` |
| `instructor` | instructor, no scope | |
| `finance` | finance | |
| `support` | support | |
| `content-editor` | content-editor | |
| `instructor-scoped` | instructor, scope = course `demo-program` + its cohort | out of scope: draft `access-scope-course` |
| `advisor-own` | advisor + `ownRecordsOnly` | owns lead `09129990212` |
| `multi-role` | advisor + content-editor in one membership | |
| `two-academies` | academy-admin in `demo`, nothing in `demo2` | `demo2` holds one course + one lead |
| `expired` | academy-admin, `expiresAt` yesterday | |
| `suspended` | academy-admin, user status `suspended` | |
| `archived-role` | only role `access-archived` (archived after assignment) | role would grant leads/orders/users/roles |
| `student`, `student-other` | none; paid order + active enrollment each | IDOR pair |
| `student-unpaid` | none; order `partially_paid`, 2nd instalment overdue, no enrollment | |
| `company-manager` | not created | ⚠️ no flow exists (legacy role only, nothing reads it) |
| `anon` | logged out | |

## 1. Surfaces

`/admin` = Payload's `canAccessAdmin`. Desks: `overview, leads, finance, students, teaching, support, content` (200 = opens,
403 = forbidden page). `/security` = «امنیت حساب». Student pages use the SMS session cookie.

| user | login | `/admin` | `/staff` lands on | desks that open (rest 403) | `/dashboard` | `/learn/demo-program` | result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| anon | — | login page | → `/staff/login` | none (all → login) | → `/login` | → `/login` | ✅ |
| super | 200 | yes | overview | all 7 + import + security | → `/login` (no student session) | — | ✅ |
| academy-admin | 200 | yes | overview | all 7 + import + security | → `/login` | — | ✅ |
| advisor | 200 | yes | leads | leads, students, security | → `/login` | — | ✅ |
| instructor | 200 | yes | teaching | teaching, security | → `/login` | — | ✅ |
| finance | 200 | yes | finance | finance, students, security | → `/login` | — | ✅ |
| support | 200 | yes | support | support, students, security | → `/login` | — | ✅ |
| content-editor | 200 | yes | content | content, security | → `/login` | — | ✅ |
| instructor-scoped | 200 | yes | teaching | teaching, security | → `/login` | — | ✅ |
| advisor-own | 200 | yes | leads | leads, students, security | → `/login` | — | ✅ |
| multi-role | 200 | yes | leads | leads, students, content, security | → `/login` | — | ✅ |
| two-academies | 200 | yes | overview | all 7 + import + security | → `/login` | — | ✅ |
| expired | 200 | → `/admin/unauthorized` | 403 | none | → `/login` | — | ✅ |
| suspended | **403** «This account is not active» | — | → `/staff/login` | none | → `/login` | — | ✅ |
| archived-role | 200 | → `/admin/unauthorized` | 403 | none | → `/login` | — | ✅ |
| student | 200 (API only) | → `/admin/unauthorized` | 403 | none | 200 | 200 | ✅ |
| student-other | 200 (API only) | → `/admin/unauthorized` | 403 | none | 200 | 200 | ✅ |
| student-unpaid | 200 (API only) | → `/admin/unauthorized` | 403 | none | 200 | → `/courses/demo-program` | ✅ |

Notes: every staff user reaches `/admin` (E-022 decision: `/admin` admits any staff; nav link is cosmetic) ✅. Students
are Payload users with a random password; with a known password they get a REST token (only used here to test the API).
A student cookie from `demo` used on `demo2.localhost` → `/login` ✅. `/learn/access-scope-course` (not bought) → 404 ✅.

## 2. REST reads (`GET /api/<collection>`, demo host)

all = sees other people's rows · own = only own rows · — = 403 or 0 rows.
Expected comes from the template permissions; every cell matched unless marked.

| user | users | memberships | roles | leads | orders | enrollments | coupons | audit-logs | certificates | submissions | import-connections | otp-codes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anon | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |
| super | all ✅ | all ✅ | all ✅ | all (+demo2) ✅ | all ✅ | all ✅ | all ✅ | all ✅ | all ✅ | all ✅ | all ✅ | — ✅ |
| academy-admin | all ✅ | all ✅ | all ✅ | all demo ✅ | all ✅ | all ✅ | all ✅ | all ✅ | all ✅ | all ✅ | all ✅ | — ✅ |
| advisor | all ✅ | all ⚠️¹ | — ✅ | own (1) ✅ | — ⚠️² | all ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |
| instructor | own ⚠️³ | own ✅ | — ✅ | — ✅ | — ✅ | all ✅ | — ✅ | — ✅ | all ✅ | all ✅ | — ✅ | — ✅ |
| finance | all ✅ | all ⚠️¹ | — ✅ | — ✅ | all ✅ | all ✅ | all ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |
| support | all ✅ | all ⚠️¹ | — ✅ | — ✅ | — ✅ | all ✅ | — ✅ | — ✅ | all ✅ | — ✅ | — ✅ | — ✅ |
| content-editor | own ✅ | own ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |
| instructor-scoped | own ✅ | own ✅ | — ✅ | — ✅ | — ✅ | in scope ✅ | — ✅ | — ✅ | all ✅ | in scope ✅ | — ✅ | — ✅ |
| advisor-own | all ✅ | all ⚠️¹ | — ✅ | own (1) ✅ | — ⚠️² | all ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |
| multi-role | all ✅ | all ⚠️¹ | — ✅ | own (0) ✅ | — ✅ | all ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |
| two-academies | all demo ✅ | all ✅ | all ✅ | all demo, no demo2 ✅ | all ✅ | all ✅ | all ✅ | all ✅ | all ✅ | all ✅ | all ✅ | — ✅ |
| expired | own ✅ | own ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |
| suspended | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |
| archived-role | own ✅ | own ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |
| student / -other / -unpaid | own ✅ | — ✅ | — ✅ | — ✅ | own ✅ | own ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ | — ✅ |

Public collections (read = anyone by design): `cohorts`, `media`, `posts`, `pages`, `testimonials`, `courses`, `lessons`.

| check | expected | actual | result |
| --- | --- | --- | --- |
| anon `GET /api/courses` | published courses only | **all 13 courses of all academies, drafts included** (`demo2-course` draft: title, status, tenant) | ❌ [ACC-04](bugs.md) |
| anon `GET /api/lessons?where[course]=<draft>` | 0 | 1 (outline of a draft course) | ❌ [ACC-04](bugs.md) |
| anon `GET /api/cohorts` | demo cohorts on the demo host | cohorts of `iba` and `demo` | ⚠️ public by design, but not host-scoped |
| logged-in staff `GET /api/courses/<draft in own academy>` | 200 (staff) | 200 | ✅ |
| any staff `GET /api/courses/<demo2 course>` | 404 | 404 | ✅ |
| users.view holders list `?where[roles][contains]=super-admin` | Edvora staff not visible to an academy | super admin visible with email + `roles: [super-admin]` | ❌ [ACC-05](bugs.md) |

¹ `users.view` lets advisor/finance/support read every membership of the academy (roles, scope, expiry, note). Pinned as
intended by `console-qa-access.spec.ts`; ADR 006 does not say. ² Advisor holds `orders.create_for_lead` but cannot see
any order (orders have no `.own` scope) — see gaps. ³ Instructor has no `users.view`: enrollments come back with the
student as a bare id (`depth=2` does not populate) — see gaps.

## 3. Scope, IDOR, other academy, hidden fields

| check | who | expected | actual | result |
| --- | --- | --- | --- | --- |
| own lead only | advisor / advisor-own | 1 own lead each | 1 own lead each | ✅ |
| `?where[advisor][not_equals]=me` widens? | advisor, advisor-own, multi-role | 0 | 0 | ✅ |
| edit another advisor's lead | advisor-own | 403 | 403 | ✅ |
| edit an unassigned lead | advisor | 403 | 403 | ✅ |
| read / edit / create lead in `demo2` | academy-admin, two-academies, advisor | 404 / 403 / 400 | 404 / 403 / 400 | ✅ |
| create course in `demo2` | academy-admin, content-editor | refused | 400 «tenant» | ✅ |
| edit lesson in scoped course | instructor-scoped | 200 | 200 | ✅ |
| edit lesson outside scope | instructor-scoped | 403 | 403 | ✅ |
| read enrollment outside scope | instructor-scoped | 404 | 404 | ✅ |
| edit lesson of any course | instructor (no scope) | 200 (template: "set the scope") | 200 | ⚠️ unscoped = whole academy |
| own order / enrollment | student | 200 | 200 | ✅ |
| other student's order / enrollment / user | student | 404 | 404 | ✅ |
| student's `nationalCode`, `internalNotes` | academy-admin / super | both | both | ✅ |
| same | advisor, finance, support | neither | neither | ✅ |
| same, `orders?depth=2` / `enrollments?depth=2` | advisor, finance | neither | neither (finance sees `tags`) | ✅ |
| own `nationalCode` / `internalNotes` | student | yes / no | yes / no | ✅ |
| `twoFactor` group in any response | everyone | never | never | ✅ |
| `otp-codes` | everyone incl. super | 403 | 403 | ✅ |
| delete user / lead | everyone | 403 (no hard delete) | 403 | ✅ |

## 4. Writes and escalation

| check | who | expected | actual | result |
| --- | --- | --- | --- | --- |
| set own `roles: [super-admin]` | every user | refused | 200, field dropped (not saved) | ✅ (silent; see ⚠️ below) |
| change own academies | academy-admin | 403 | 403 «You cannot change your own academies» | ✅ |
| change own academies | others | refused | 200, field dropped | ✅ |
| change own status | every user | 403 | 403 | ✅ |
| create / edit own membership | academy-admin | 403 | 403 «You cannot change your own roles» | ✅ |
| create / edit own membership | others | 403 | 403 | ✅ |
| **write own `internalNotes` / `tags`** | **every user incl. students** | refused (staff-only fields) | **200, saved** | ❌ [ACC-01](bugs.md) |
| change own phone to someone else's | every user | refused | 400 (unique) | ✅ |
| change own email / national code | student | ⚠️ no rule | 200, saved, no verification | ⚠️ gap |
| create role with all academy permissions | academy-admin | 201 | 201 | ✅ |
| create role | everyone else | 403 | 403 | ✅ |
| create role with `tenants.manage` | academy-admin | 400 | 400 «Platform permission cannot be granted» | ✅ |
| edit the super admin | academy-admin | 403 | 403 «Only Edvora can edit a platform admin» | ✅ |
| edit a peer academy admin | academy-admin | allowed (holds the same) | 200 | ✅ |
| create a user | academy-admin / others | 201 / 403 | 201 / 403 | ✅ |
| make the new user academy admin | academy-admin | 201 | 201 | ✅ |
| assigner (`roles.assign` + narrow set) grants academy-admin | assigner | 403 | 403 «Cannot grant users.edit» | ✅ |
| assigner grants advisor | assigner | 403 | 403 «Cannot grant leads.create» | ✅ |
| assigner grants a role inside own set | assigner | 201 | 201 | ✅ |
| assigner grants in `demo2` | assigner | refused | 400 | ✅ |
| publish a course | content-editor, multi-role | 403 | 403 «needs courses.publish» | ✅ |
| change course price | content-editor | 403 | 403 «needs pricing.edit» | ✅ |
| create coupon | finance / support, advisor | 201 / 403 | 201 / 403 | ✅ |
| **create an order with `status: paid`, `total: 0`** | **advisor** | refused (payment flow / `discount.give` limits) | **201, stored paid / 0** | ❌ [ACC-02](bugs.md) |
| **set order `status: paid`, change `total`** | **finance, academy-admin** | only via record → approve (four-eyes) | **200, saved** | ❌ [ACC-03](bugs.md) |
| mark own order paid / self-enroll | student | 403 | 403 | ✅ |
| edit orders | advisor, support, instructor | 403 | 403 | ✅ |

⚠️ Forbidden fields (`roles`, `tenants`) are silently dropped with 200 instead of a 403. Safe, but a client cannot tell.

## 4b. Finance desk (E-023, ADR 021) — added 2026-11-09

Spec: `e2e/tests/access-matrix.spec.ts` (two `E-023` tests) and `e2e/tests/finance-desk.spec.ts` (flows).

| action | user | expected | result |
| --- | --- | --- | --- |
| `GET /api/refunds`, `/api/finance-contacts` | academy-admin, finance | 200 | ✅ |
| same | advisor, support, instructor, content-editor, student | nothing (403 or empty) | ✅ |
| `POST /api/refunds`, `/api/finance-contacts` | academy-admin, finance | 403 (server code only) | ✅ |
| `/staff/finance?tab=overdue` (needs `finance.view`) | academy-admin, finance | 200 with the tab | ✅ |
| `/staff/payments/export?from&to` (needs `finance.export`) | academy-admin, finance | 200 `.xlsx`, audit row `finance.exported` | ✅ |
| same | advisor, support, instructor, content-editor, student, expired | 404 | ✅ |
| approve / mark refunded a refund one requested | finance (holds `refunds.approve`) | refused, button not offered (four-eyes) | ✅ |
| approve / mark refunded someone else's refund | second finance person | allowed | ✅ |
| refund more than paid − (requested + approved + refunded) | finance | refused with the limit | ✅ |

`finance.view` is new in the catalog: templates `finance` and `academy-admin` hold it (seed and migration
`e023_finance_view_roles`); `reporting` does not, because it also allows contact notes. With E-023,
`refunds.request`, `refunds.approve` and `finance.export` are enforced, so G1 below drops from 20 to 17 keys.

## 5. Lifecycle (token taken before the change, checked on the next request)

Probe = `GET /api/audit-logs` / `GET /api/leads` / `GET /staff/overview`.

| change (by super admin) | before | after | result |
| --- | --- | --- | --- |
| user suspended | 200 / 200 / 200 | 403 / 403 / → `/staff/login`; re-login 403 | ✅ |
| membership `expiresAt` in the past | 200 / 200 / 200 | 403 / 403 / 403 | ✅ |
| membership status `suspended` | 200 / 200 / 200 | 403 / 403 / 403 | ✅ |
| only role archived | 200 / 200 / 200 | 403 / 403 / 403 | ✅ |
| role academy-admin → advisor | 200 / 200 / 200 | 403 / 200 (own leads) / 403 | ✅ |
| student suspended (SMS cookie) | `/dashboard` 200 | → `/login` | ✅ |

## 6. Staff 2FA (`STAFF_2FA_REQUIRED=true`)

| user | `/api/leads` | `/staff` | result |
| --- | --- | --- | --- |
| super, academy-admin, advisor, finance (not enrolled) | 403 | → `/staff/2fa/enrol` | ✅ |
| student | 403 | 403 | ✅ |

## Totals

| | count |
| --- | --- |
| Users tested | **18** = 16 seeded + super admin + anonymous (`company-manager`: no flow to test) |
| Checks (marked cells in §1–§6) | **276** |
| ✅ match | **256** |
| ❌ mismatch | **6** checks → **5 bugs** (ACC-01…ACC-05): 2 blockers, 2 major, 1 minor |
| ⚠️ unclear spec / gap | **14** |

A row that covers several users (e.g. the three students) counts once. The spec `e2e/tests/access-matrix.spec.ts`
turns the matrix into 97 tests (93 pass, 4 are `test.fail` pinning ACC-01…ACC-04).

## Gaps — role settings and profiles (facts, then suggestions; decisions are Farjad's via head-of-product)

### Role settings

| # | Fact (evidence) | Suggestion |
| --- | --- | --- |
| G1 | **20 of the 63 catalog keys are enforced nowhere** in `apps/web`: `users.import`, `users.export`, `leads.export`, `discount.give`, `payments.manual.record`, `payments.manual.approve`, `refunds.request`, `refunds.approve`, `finance.export`, `qa.answer`, `tickets.*` (4), `sms.send_single`, `sms.broadcast`, `templates.edit`, `reports.*` (3). An admin can tick them in the role editor and nothing changes. (`grep -rlF "'<key>'" apps/web/src`, 2026-11-08) | Mark them «به‌زودی» / hide in the role editor until their module exists (E-039). |
| G2 | **Four-eyes cannot be set up**: `payments.manual.record/approve` are unused and the `finance` template holds both; `orders.edit` lets anyone holding it set `status: paid` directly (ACC-03). ADR 006 calls four-eyes a decision. | Split template: «ثبت پرداخت» vs «تأیید پرداخت»; block status/total edits outside the payment action. |
| G3 | **Advisor can create orders but never see them** (`orders.create_for_lead`, no `orders.view`; orders have no `.own` scope). Advisor `GET /api/orders` = 0 rows, even the order they just made. | Add `orders.view.own` (orders created for my leads) to the catalog and the advisor template. |
| G4 | **`ownRecordsOnly` changes nothing for the advisor template** (it only holds `leads.view.own`); only leads and tickets have `.own/.all` variants. advisor vs advisor-own answered identically on every probe. | Explain on the membership form which permissions it narrows, or drop it until more `.all` keys exist. |
| G5 | **Instructor can't see who their students are**: no `users.view`, so `enrollments`/`submissions` show the student as an id. The teaching desk is still a placeholder. | Scoped `users.view` (students of my cohorts) for instructors. |
| G6 | **Unscoped instructor = every course** (lessons of `access-scope-course` editable). The template description says "set the scope" but the form allows saving without one. | Warn (or require scope) when an instructor role is saved with empty scope. |
| G7 | **Archived role cannot be picked, but existing memberships keep it silently** (membership create with an archived role fails «فیلد زیر نامعتبر است: نقش‌ها»; the seeded `archived-role` user just loses access with no hint on the membership). | Show «نقش بایگانی‌شده — بدون دسترسی» on the membership and in the staff list. |
| G8 | **`users.view` exposes every staff member's memberships** (roles, scope, expiry, note) to advisor/finance/support (note ¹). | Read memberships only with `roles.view`/`roles.assign`; show a person's own. |
| G9 | **No expiry warning**: an expired membership drops access instantly (✅) but nothing tells the person or the admin before or after. | Notice at 7 days + a filter «منقضی‌شده» in staff list. |
| G10 | **`company-manager` role has no flow** — legacy value on `users.roles`, no permission, no screen. | Decide B2B scope (company → seats → reports) before E-040, or remove the value. |
| G11 | **Finance cannot see the national code** (`users.view_sensitive` not in template), which official invoices/receipts usually need. | Ask the client; if yes, add to the finance template. |

### Profiles (per user type)

Today there is one `users` collection with tabs (identity, profile, status & access). Facts from `apps/web/src/collections/Users.ts` and the route list:

| # | Fact | Suggestion |
| --- | --- | --- |
| P1 | **Students have no profile screen**: `/dashboard` and `/dashboard/certificates/[id]` only; name/latin name (for certificates), city, job, national code are editable only by staff in `/admin`. | `/dashboard/profile` (E-040) with latin name check before certificate issue. |
| P2 | **Staff have no profile screen** either: `/staff/security` (2FA) only; staff edit their own record through `/admin`. | «پروفایل من» in the staff shell. |
| P3 | **Self-edit has no field policy**: a user can change their own email and national code with no verification (§4), and their own staff-only fields (ACC-01). | Per-field rules: who may edit, and which changes need re-verification (email, phone, national code). |
| P4 | **Missing fields** an academy usually needs: profile photo/avatar, postal address / postal code (invoices), marketing-SMS consent (needed before `sms.broadcast`), phone/email verified flags, emergency contact (in-person cohorts). None exist. | Pick per type in E-040: student (photo, address, consent), instructor (photo — today only `publicProfile.bio/title`), staff (job title exists). |
| P5 | **`company` is free text**, not a link to an organisation, so a company manager (G10) cannot be modelled. | Organisation collection if B2B is in scope. |
| P6 | **One profile shape for all types**: students see the same tabs as staff in `/admin` (e.g. `publicProfile` for a student, `jobTitle` for an instructor). | Show tabs by type (student / instructor / staff). |

## Handoff

- **Task:** E-041 access matrix baseline (access-tester).
- **Output:** `apps/web/src/scripts/seed-access-users.ts` (+ `pnpm --filter @edvora/web seed:access`), this file,
  bugs ACC-01…ACC-05 in `docs/qa/bugs.md`, `e2e/tests/access-matrix.spec.ts` (97 tests, ~35 s).
- **Decisions made:** tests ran on a separate local database (`edvora_access`) because the shared `edvora` database
  carries another branch's schema; the spec builds its own cast per run through the REST API (CI does not run
  `seed:access`), so no passwords exist outside memory/`apps/web/.env`; a local `demo2` academy is created for
  cross-academy checks (the spec creates it too); known bugs are pinned with `test.fail`; no product code changed.
- **Open issues:** ACC-01 and ACC-02 are blockers; ACC-03 major (four-eyes); ACC-04 major (draft/cross-academy course
  data public over REST); ACC-05 minor. 2FA was checked with enrolment redirects only (not a full TOTP round-trip —
  already covered by `staff.spec.ts`).
- **Next owner:** `tech-lead` for ACC-01…05; `security-auditor` for ACC-01, ACC-02, ACC-03, ACC-04 (exploitable);
  `head-of-product` for gaps G1–G11 and P1–P6 (inputs for E-039 / E-040).
