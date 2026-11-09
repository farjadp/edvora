# ADR 021 — Finance desk: overdue follow-up, refunds with four-eyes, Excel export

**Status:** accepted (2026-11-09, E-023). Builds on ADR 006 (four-eyes), ADR 017 (payments) and ADR 008 (desks).

## Context
E-045 (ADR 017) gave the finance desk a payment queue and manual payments with two people. The finance team still had
no way to chase overdue instalments, see what is coming due, give money back, or hand the accountant a file.
`refunds.request`, `refunds.approve` and `finance.export` existed in the catalog but were enforced nowhere (E-041 G1).

## Decision

### 1. One desk, tabs by permission
`/staff/finance` keeps its overview (E-028 inbox, E-045 queue, orders list) and gains tabs: **اقساط معوق**,
**اقساط پیش رو**, **بازپرداخت‌ها**, **خروجی اکسل** (`?tab=`). A tab shows only for the key that opens it; the server
checks again on every action.
- New key **`finance.view`**: the overview KPIs, overdue and upcoming lists, the refunds list and contact notes. Added
  to the finance group (so the `finance` and `academy-admin` templates get it), to the finance desk's access and
  landing, and granted by migration `e023_finance_view_roles` to existing roles made from those two templates.
  Custom roles are left as the academy set them. Not added to the read-only `reporting` template, because it also
  lets a person write contact notes.
- `refunds.request`, `refunds.approve`, `finance.export` are now enforced (E-041 G1 shrinks by three keys).

### 2. Rules in `@edvora/core/finance` (Vitest)
- **Overdue** = unpaid instalment of an open order (`pending`, `partially_paid`, not imported) whose due day (Tehran
  calendar) is before today. Due today is not overdue. Buckets: 1–7, 8–30, 31–60, 60+ days.
- **Upcoming** = due today up to 7 or 30 days ahead (today included).
- An instalment covered by an E-045 payment still waiting for a person is marked «در انتظار بررسی» on both lists,
  so nobody chases a student who already paid.
- **KPIs** (toman, Persian digits): collected this Jalali month (instalments marked paid since the 1st, 00:00 Tehran),
  due in the next 7 days, overdue amount and count, payments waiting for confirmation (the E-045 queue). Refunds
  are shown in their own tab, not netted from «collected».

### 3. Contact notes
`finance-contacts` (tenant-owned, append-only, server writes only): order, instalment, student, outcome
(صحبت شد / قول پرداخت داد / پاسخ نداد / شماره اشتباه / پیام گذاشته شد), note, who, when. The overdue list shows the
latest one per instalment. Needs `finance.view`. Audit-logged.

### 4. Refunds (`refunds` collection, server writes only)
State machine, same four-eyes rule as manual payments:

`requested → approved → refunded`, `requested | approved → rejected`, `requested → cancelled`.

- **request** (`refunds.request`): from the order page. Amount typed in toman, stored as integer rials, > 0 and
  never above *paid − (requested + approved + refunded)*. One open request per order. A reason is required.
  Refused for imported orders (refund those outside Edvora) and for one's own order.
- **approve** (`refunds.approve`): never the requester (`checkFourEyes`).
- **complete** — mark paid back with the bank / transfer reference (`refunds.approve`, never the requester). Edvora
  does not move money: the transfer happens in the bank; this records it.
- **reject** (`refunds.approve`, reason required) — also allowed to the requester if they hold the key (refusing
  money is the safe direction, as in ADR 017). **cancel** — only the requester, before approval.
- Every step is compare-and-set on `status` and writes an audit-log row.

**Effects (`refundEffects`)**: a refund that brings the refunded total to the paid total is *full*: the order
becomes `refunded`, the active enrolment becomes `cancelled`, and the cohort seat taken by the first payment is
released (mirror of `onFirstPayment`). Unpaid instalments of a refunded order drop off the overdue list. A
*partial* refund changes nothing but the money record. The student gets an SMS (errors logged, never thrown).

**XP, badges, certificates: revoke both** (Farjad, 2026-11-09). On a *full* refund, when it is marked refunded,
`refundRevocation` (core) revokes every still-valid certificate of the enrolment (same course; same cohort when
both name one) and reverses every standing positive-XP row on the enrolment's ledger (badge XP included) with the
usual `reversal` rows, then the cached totals are rebuilt. Completed enrolments are cancelled too, not only active
ones. Idempotent (revoked / reversed rows are skipped; certificate writes are compare-and-set on status). Failure is
logged and written as `refunds.revoke_failed`, never thrown: the refund stays done. Success writes
`refunds.revoked` (who = the person who marked it refunded, when, certificate codes, XP removed). A partial refund
keeps the enrolment and changes neither.

### 5. Excel export
`GET /staff/payments/export?from=YYYY-MM-DD&to=YYYY-MM-DD` (both days included, Tehran calendar, ≤ 366 days).
One `.xlsx` with three right-to-left sheets: payments (created in range), instalments (due in range), refunds
(requested in range). Money in toman with the exact rial beside it; dates Jalali (Tehran time).
- Built on the server by `lib/xlsx.ts`, a small Office Open XML writer on top of `fflate` (already a dependency):
  no new package, no CDN. Cells are inline strings or numbers, never formulas.
- Needs `finance.export` (checked from the session and against the database); everyone else gets 404. The academy
  comes from the Host header and every query filters by tenant.
- The audit row (`finance.exported`, range and row counts) is written **before** the file is sent; if it cannot be
  written the export is refused.

## Consequences
- New tables `refunds`, `finance_contacts`; enum value `finance.view` (migrations `e023_finance_desk`,
  `e023_finance_view_roles`). Both collections are in the multi-tenant plugin and the sandbox purge list.
- The date inputs of the export are Gregorian (browser date picker); the page states the Jalali month. A Jalali
  picker is a later UI task.
- Advisors and support hold `refunds.request` but cannot open the finance desk or the order page, so in practice
  only finance and academy admins request refunds. Opening a request path for them is a follow-up.
