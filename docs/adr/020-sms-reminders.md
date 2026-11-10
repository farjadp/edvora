# ADR 020 — SMS reminders worker

**Status:** proposed (2026-11-09, E-016)

## Context
Academies need automatic SMS reminders: instalments (before, on and after the due date), live classes (before they
start, to enrolled students) and a morning digest of due follow-ups for advisors. The SMS adapter (Kavenegar + mock),
per-academy SMS accounts (ADR 019 §5) and message templates (settings hub, «قالب پیامک و ایمیل») already exist. The
Kavenegar contract and keys are not in hand, so everything must run on the mock; sandboxes and `demo` must never reach
a real phone (ADR 013).

## Decision

1. **Rules are pure (`packages/core/src/reminders.ts`).** Given an instalment / class / advisor and an instant, they
   return what is due, with an **idempotency key** (`t<tenant>:instalment:<order>:<index>:<due day>:<stage>`,
   `t<tenant>:live:<session>:<startsAt>:<h>h:u<user>`, `t<tenant>:followup:<day>:u<advisor>`). Days and hours are
   Asia/Tehran wall clock; storage stays UTC. Only today's instalment stage is returned (a missed day is never sent
   late). A live reminder for offset *h* is valid from `start − h` until the next smaller offset (or the start).
   The keys include the due day / start time, so moving a due date or rescheduling a class re-arms its reminders.
2. **Per-academy settings** (`tenants.reminderSettings`, JSON validated by `reminderSettingsSchema`, edited in the
   settings hub section «یادآورهای پیامکی», permission `notifications.manage`). Defaults: **off**; instalments 3 and
   0 days before, 1 and 7 days after; live 24 h and 1 h before; digest from 08:00; quiet hours 21:00–08:00. Unreadable
   JSON falls back to the defaults (off).
3. **Worker = cron-secured route handler**, `POST /api/cron/reminders`, `Authorization: Bearer REMINDERS_CRON_SECRET`
   (≥ 24 chars, else 404) — the same shape as the sandbox cleanup cron. Not the Payload jobs queue: its `autoRun`
   runs in every app process (`web` and `web-iba` share one database), the work is a periodic scan rather than a
   queue of jobs, and Railway cron is already the pattern. One cron per database.
4. **Send log = idempotency record** (`sms-log`, tenant-owned, in `multiTenantPlugin.collections` and the sandbox
   purge order). The row with the unique `key` is inserted **before** the send, so a rerun, an overlapping run or a
   second instance cannot send twice. Quiet hours defer without writing a row; opt-out, no mobile, inactive account
   are written as `skipped` with the reason. A row left in `sending` for 15 min (crash mid-send) becomes `unknown` and
   is **not** retried: at most once beats twice for a reminder. Failures retry with back-off 5 → 15 → 45 min (cap
   3 h), at most 4 attempts, never past the reminder's expiry; retries are claimed with an atomic SQL update.
5. **Who gets what.** Instalments: only `partially_paid` site orders (a `pending` order may be an abandoned checkout;
   imported orders never notify). Live: active enrolments of the session's cohort (or course, if no cohort).
   Digest: advisors with open leads (`new`, `contacted`, `follow_up`) whose `nextFollowUpAt` is before the end of today.
6. **Opt-out:** `users.smsReminders` (default on). OTP and receipts are not reminders and ignore it.
7. **Texts:** the academy's SMS template for the event when it is on and not empty, else the default text in core —
   variables only, no prices, dates or promises. Two template events were added: `instalment.overdue`,
   `followup.digest`. Amounts via `formatToman()`, dates via `formatJalali()`.
8. **Safety:** global kill switch `SMS_REMINDERS_ENABLED` (anything but `true` = off; off in the example and in
   production until the SMS contract is signed). Sandboxes and `demo` always get the mock provider
   (`mustUseMockSms`), whatever `SMS_PROVIDER` or their own settings say. Otherwise the academy's own SMS account when
   set (ADR 019), else the platform default.
9. **Access:** two new catalog keys — `notifications.view` (read the send log; academy-admin, finance, support) and
   `notifications.manage` (reminder settings; academy-admin). The full mobile is stored for retries but its field read
   access is `nobody`; lists show `toMasked`. Nobody creates or edits log rows through the API.

## Consequences
- A worker that is down for a whole day skips that day's instalment stage (by design); live reminders catch up while
  still useful.
- The e2e hook (`REMINDERS_E2E_HOOKS=true`: `?now=` and `?tenant=`) exists for tests only and must never be set on a
  public deployment.
- Students cannot switch reminders off themselves yet (no student profile form); staff do it on the user record.
