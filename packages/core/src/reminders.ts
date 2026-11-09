/**
 * SMS reminder rules (E-016, ADR 020). Pure: which reminders are due at an instant, quiet hours, idempotency keys,
 * per-academy settings with safe defaults, retry back-off and the default Persian texts. The worker in apps/web reads
 * the data, asks these functions what to send, and records every decision in the send log.
 *
 * Time: storage is UTC; days, hours and quiet hours are Asia/Tehran wall-clock (tz database via Intl).
 * No node:crypto here, so client components may import `@edvora/core/reminders`.
 */
import { z } from 'zod'
import { tehranDayNumber, dayKey, dayStartsAt } from './gamification/calendar'

const HOUR_MS = 60 * 60 * 1000

// ---------------------------------------------------------------- Rules and settings

/** One row per rule in the send log. `instalment.overdue` and `instalment.due` share a template family. */
export const REMINDER_RULES = ['instalment.due', 'instalment.overdue', 'followup.digest', 'live.reminder'] as const
export type ReminderRule = (typeof REMINDER_RULES)[number]

export const REMINDER_RULE_LABELS: Record<ReminderRule, string> = {
  'instalment.due': 'یادآوری قسط (پیش از سررسید و روز سررسید)',
  'instalment.overdue': 'قسط عقب‌افتاده',
  'followup.digest': 'خلاصهٔ پیگیری‌های امروز مشاور',
  'live.reminder': 'یادآوری کلاس زنده',
}

const hour = z.coerce.number().int().min(0).max(23)
const dayList = (max: number) =>
  z
    .array(z.coerce.number().int().min(0).max(max))
    .max(4)
    .transform((a) => [...new Set(a)].sort((x, y) => y - x))

export const reminderSettingsSchema = z.object({
  /** Master switch for this academy. Off by default: an academy turns reminders on deliberately. */
  enabled: z.boolean().default(false),
  instalment: z
    .object({
      enabled: z.boolean().default(true),
      /** Days before the due date (0 = on the day). */
      daysBefore: dayList(30).default([3, 0]),
      /** Days after the due date while still unpaid. */
      daysAfter: dayList(60).refine((a) => !a.includes(0), 'روز صفر همان روز سررسید است').default([7, 1]),
    })
    .default({ enabled: true, daysBefore: [3, 0], daysAfter: [7, 1] }),
  followup: z
    .object({
      enabled: z.boolean().default(true),
      /** Tehran hour from which the advisor's morning digest may go out. */
      digestHour: hour.default(8),
    })
    .default({ enabled: true, digestHour: 8 }),
  live: z
    .object({
      enabled: z.boolean().default(true),
      /** Hours before the class starts. */
      hoursBefore: z
        .array(z.coerce.number().int().min(1).max(72))
        .max(4)
        .transform((a) => [...new Set(a)].sort((x, y) => y - x))
        .default([24, 1]),
    })
    .default({ enabled: true, hoursBefore: [24, 1] }),
  /** No sends from `start` to `end` (Tehran hours; wraps midnight when start > end). start = end means none. */
  quietHours: z.object({ start: hour.default(21), end: hour.default(8) }).default({ start: 21, end: 8 }),
})
export type ReminderSettings = z.output<typeof reminderSettingsSchema>

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = reminderSettingsSchema.parse({})

/** Stored JSON → settings. Anything unreadable falls back to the safe defaults (reminders off). */
export function readReminderSettings(raw: unknown): ReminderSettings {
  const p = reminderSettingsSchema.safeParse(raw ?? {})
  return p.success ? p.data : DEFAULT_REMINDER_SETTINGS
}

/** "3، 0" / "3,0" / "۳ ۰" → [3, 0]. Non-numbers are dropped; validation happens in the schema. */
export function parseNumberList(input: string): number[] {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .split(/[\s,،]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n))
}

// ---------------------------------------------------------------- Tehran clock

let hmFormatter: Intl.DateTimeFormat | null = null
/** Tehran wall-clock hour and minute of an instant. */
export function tehranClock(at: Date): { hour: number; minute: number } {
  hmFormatter ??= new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const parts = Object.fromEntries(hmFormatter.formatToParts(at).map((p) => [p.type, p.value]))
  return { hour: Number(parts.hour) % 24, minute: Number(parts.minute) }
}

export function isQuietTime(at: Date, quiet: { start: number; end: number }): boolean {
  const { hour: h } = tehranClock(at)
  if (quiet.start === quiet.end) return false
  return quiet.start < quiet.end ? h >= quiet.start && h < quiet.end : h >= quiet.start || h < quiet.end
}

/** First instant at or after `at` outside quiet hours (searched in 15-minute steps, at most two days). */
export function nextSendableAt(at: Date, quiet: { start: number; end: number }): Date {
  let t = at
  for (let i = 0; i < 2 * 24 * 4 && isQuietTime(t, quiet); i++) {
    const next = new Date(t.getTime() + 15 * 60 * 1000)
    t = new Date(Math.floor(next.getTime() / (15 * 60 * 1000)) * 15 * 60 * 1000)
  }
  return t
}

// ---------------------------------------------------------------- What is due

/** A reminder the worker should send now (or defer, when `deferred` is true). */
export type DueReminder = {
  rule: ReminderRule
  /** Idempotency key: one send per reminder per recipient, ever. Latin digits only. */
  key: string
  /** Stage label for the log (`before-3`, `due`, `after-7`, `24h`, `digest`). */
  stage: string
  /** After this instant the reminder is stale and must not be sent or retried. */
  expiresAt: Date
}

export type InstalmentInput = {
  tenantId: number
  orderId: number
  orderStatus: string | null | undefined
  orderSource?: string | null
  index: number
  dueDate: Date | string
  status: string | null | undefined
}

/** Orders whose open instalments get reminders: partly paid site orders (a pending order may be an abandoned cart). */
export const instalmentOrderRemindable = (orderStatus: string | null | undefined, source?: string | null) =>
  orderStatus === 'partially_paid' && (source ?? 'site') === 'site'

/**
 * Instalment reminders due on the Tehran day of `now`: `daysBefore` (0 = the due day) and `daysAfter` while unpaid.
 * Only today's stage is returned, so a missed day is never sent late; the key includes the due day, so moving the
 * due date re-arms the reminders.
 */
export function instalmentReminders(i: InstalmentInput, now: Date, s: ReminderSettings): DueReminder[] {
  if (!s.enabled || !s.instalment.enabled) return []
  if (i.status === 'paid' || !instalmentOrderRemindable(i.orderStatus, i.orderSource)) return []
  const due = tehranDayNumber(i.dueDate)
  const today = tehranDayNumber(now)
  const diff = today - due // > 0 = overdue
  const base = `t${i.tenantId}:instalment:${i.orderId}:${i.index}:${dayKey(due)}`
  const expiresAt = dayStartsAt(today + 1)
  if (diff <= 0 && s.instalment.daysBefore.includes(-diff)) {
    const stage = diff === 0 ? 'due' : `before-${-diff}`
    return [{ rule: 'instalment.due', key: `${base}:${stage}`, stage, expiresAt }]
  }
  if (diff > 0 && s.instalment.daysAfter.includes(diff)) {
    const stage = `after-${diff}`
    return [{ rule: 'instalment.overdue', key: `${base}:${stage}`, stage, expiresAt }]
  }
  return []
}

/** The widest window of due dates the worker must load for `now` (query bounds; filter with instalmentReminders). */
export function instalmentWindow(now: Date, s: ReminderSettings): { from: Date; to: Date } {
  const today = tehranDayNumber(now)
  const before = Math.max(0, ...s.instalment.daysBefore)
  const after = Math.max(0, ...s.instalment.daysAfter)
  return { from: dayStartsAt(today - after), to: dayStartsAt(today + before + 1) }
}

export type LiveSessionInput = { tenantId: number; sessionId: number; startsAt: Date | string; status: string | null | undefined }

/**
 * Live-class reminders for one student. The `h`-hour reminder is due from `startsAt − h` until the next smaller
 * offset (or the start), so a reminder held back by quiet hours still goes out later if it is still useful, and
 * never after the class has started. The key includes the start time, so a rescheduled class re-arms.
 */
export function liveReminders(sess: LiveSessionInput, userId: number, now: Date, s: ReminderSettings): DueReminder[] {
  if (!s.enabled || !s.live.enabled || sess.status !== 'scheduled') return []
  const start = new Date(sess.startsAt).getTime()
  const t = now.getTime()
  if (t >= start) return []
  const offsets = s.live.hoursBefore // sorted high → low
  for (let k = 0; k < offsets.length; k++) {
    const h = offsets[k]!
    const opens = start - h * HOUR_MS
    const closes = k + 1 < offsets.length ? start - offsets[k + 1]! * HOUR_MS : start
    if (t >= opens && t < closes) {
      const stage = `${h}h`
      return [{ rule: 'live.reminder', key: `t${sess.tenantId}:live:${sess.sessionId}:${new Date(start).toISOString()}:${stage}:u${userId}`, stage, expiresAt: new Date(closes) }]
    }
  }
  return []
}

/** Sessions to load for `now`: starting within the largest offset. */
export function liveWindow(now: Date, s: ReminderSettings): { from: Date; to: Date } {
  return { from: now, to: new Date(now.getTime() + Math.max(1, ...s.live.hoursBefore) * HOUR_MS) }
}

/** Lead statuses that still need follow-up (closed leads never count). */
export const OPEN_LEAD_STATUSES = ['new', 'contacted', 'follow_up'] as const

/**
 * The advisor's morning digest: once per Tehran day, from `digestHour`, when at least one open lead's follow-up is
 * due by the end of today. `dueCount` = how many.
 */
export function followupDigest(input: { tenantId: number; advisorId: number; dueCount: number }, now: Date, s: ReminderSettings): DueReminder | null {
  if (!s.enabled || !s.followup.enabled || input.dueCount <= 0) return null
  if (tehranClock(now).hour < s.followup.digestHour) return null
  const today = tehranDayNumber(now)
  return { rule: 'followup.digest', key: `t${input.tenantId}:followup:${dayKey(today)}:u${input.advisorId}`, stage: 'digest', expiresAt: dayStartsAt(today + 1) }
}

/** Upper bound for "due today" follow-ups (end of the Tehran day of `now`). */
export const endOfTehranDay = (now: Date): Date => dayStartsAt(tehranDayNumber(now) + 1)

// ---------------------------------------------------------------- Send decisions

export type Recipient = { mobile: string | null | undefined; optedOut?: boolean | null; active?: boolean }
export type SendDecision = { action: 'send' } | { action: 'defer'; until: Date } | { action: 'skip'; reason: string }

/**
 * Whether to send a due reminder now. Opt-out and missing numbers are recorded as skipped (so they are not
 * re-evaluated every run); quiet hours defer without recording anything, so the next run after quiet hours sends.
 */
export function decideSend(r: DueReminder, to: Recipient, now: Date, s: ReminderSettings): SendDecision {
  if (now.getTime() >= r.expiresAt.getTime()) return { action: 'skip', reason: 'expired' }
  if (to.active === false) return { action: 'skip', reason: 'inactive' }
  if (to.optedOut) return { action: 'skip', reason: 'opted-out' }
  if (!to.mobile || !/^09\d{9}$/.test(to.mobile)) return { action: 'skip', reason: 'no-mobile' }
  if (isQuietTime(now, s.quietHours)) return { action: 'defer', until: nextSendableAt(now, s.quietHours) }
  return { action: 'send' }
}

// ---------------------------------------------------------------- Retry

export const SEND_STATUSES = ['sending', 'sent', 'failed', 'dead', 'skipped', 'unknown'] as const
export type SendStatus = (typeof SEND_STATUSES)[number]

export const SEND_STATUS_LABELS: Record<SendStatus, string> = {
  sending: 'در حال ارسال',
  sent: 'فرستاده شد',
  failed: 'ناموفق (تلاش دوباره)',
  dead: 'ناموفق (پایان تلاش‌ها)',
  skipped: 'فرستاده نشد',
  unknown: 'نامشخص (قطع در میانهٔ ارسال)',
}

export const SKIP_REASON_LABELS: Record<string, string> = {
  expired: 'زمانش گذشته بود',
  inactive: 'حساب غیرفعال',
  'opted-out': 'گیرنده یادآور پیامکی را خاموش کرده',
  'no-mobile': 'شمارهٔ موبایل ندارد',
}

export const MAX_SEND_ATTEMPTS = 4

/** Back-off after `attempts` failed tries: 5, 15, 45 minutes … capped at 3 hours. */
export function retryDelayMs(attempts: number): number {
  return Math.min(3 * HOUR_MS, 5 * 60 * 1000 * 3 ** Math.max(0, attempts - 1))
}

/** After a failed attempt: retry later, or give up. Retries never run past the reminder's expiry. */
export function afterFailure(attempts: number, now: Date, expiresAt: Date | string | null | undefined): { status: 'failed'; nextAttemptAt: Date } | { status: 'dead' } {
  if (attempts >= MAX_SEND_ATTEMPTS) return { status: 'dead' }
  const next = new Date(now.getTime() + retryDelayMs(attempts))
  if (expiresAt && next.getTime() >= new Date(expiresAt).getTime()) return { status: 'dead' }
  return { status: 'failed', nextAttemptAt: next }
}

/** A row stuck in `sending` this long was interrupted mid-send. It is never retried (at most once beats twice). */
export const STALE_SENDING_MS = 15 * 60 * 1000

// ---------------------------------------------------------------- Provider safety

/**
 * Sandboxes (ADR 013) and the `demo` academy always use the mock provider, whatever the env or their settings say.
 */
export function mustUseMockSms(tenant: { slug?: string | null; isSandbox?: boolean | null }): boolean {
  return tenant.isSandbox === true || tenant.slug === 'demo'
}

/** The global kill switch. Anything other than the literal `true` is off. */
export const remindersEnabledByEnv = (v: string | undefined): boolean => v?.trim() === 'true'

// ---------------------------------------------------------------- Texts

/**
 * Default SMS texts (used when the academy's template for the event is off or empty). Variables only — no prices,
 * dates or promises are written into the defaults.
 */
export const DEFAULT_REMINDER_TEXTS: Record<ReminderRule, string> = {
  'instalment.due': '{{name}} عزیز، قسط دورهٔ «{{course}}» به مبلغ {{amount}} در تاریخ {{dueDate}} سررسید می‌شود.\nپرداخت: {{link}}\n{{academy}}',
  'instalment.overdue': '{{name}} عزیز، قسط دورهٔ «{{course}}» به مبلغ {{amount}} که سررسیدش {{dueDate}} بود هنوز پرداخت نشده است.\nپرداخت: {{link}}\n{{academy}}',
  'followup.digest': '{{name}}، امروز {{count}} پیگیری مشتری دارید.\nفهرست: {{link}}\n{{academy}}',
  'live.reminder': '{{name}} عزیز، کلاس زندهٔ «{{course}}» {{startsAt}} شروع می‌شود.\nورود: {{link}}\n{{academy}}',
}

/**
 * The academy's site origin for links in an SMS: its first custom domain, else the platform URL. Hosts ending in
 * `localhost` keep the platform URL's protocol and port (local dev and e2e).
 */
export function academyOrigin(domains: readonly (string | null | undefined)[] | null | undefined, siteUrl: string): string {
  const d = (domains ?? []).find((x): x is string => typeof x === 'string' && x.trim() !== '')?.trim().toLowerCase()
  if (!d) return siteUrl.replace(/\/$/, '')
  if (d === 'localhost' || d.endsWith('.localhost')) {
    const u = new URL(siteUrl)
    return `${u.protocol}//${d}${u.port ? `:${u.port}` : ''}`
  }
  return `https://${d}`
}
