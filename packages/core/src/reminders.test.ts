import { describe, expect, it } from 'vitest'
import { ACADEMY_PERMISSIONS, ROLE_TEMPLATES } from './permissions'
import {
  DEFAULT_REMINDER_SETTINGS,
  DEFAULT_REMINDER_TEXTS,
  MAX_SEND_ATTEMPTS,
  REMINDER_RULES,
  academyOrigin,
  afterFailure,
  decideSend,
  followupDigest,
  instalmentReminders,
  instalmentWindow,
  isQuietTime,
  liveReminders,
  mustUseMockSms,
  nextSendableAt,
  parseNumberList,
  readReminderSettings,
  remindersEnabledByEnv,
  retryDelayMs,
  tehranClock,
} from './reminders'
import { MESSAGE_EVENTS, SECTION_PERMISSION, unknownVariables } from './settings'

/** Tehran is UTC+3:30 (no DST). `teh('2026-11-09', 10)` = 10:00 Tehran. */
const teh = (day: string, h: number, m = 0) => new Date(Date.parse(`${day}T00:00:00Z`) + (h * 60 + m - 210) * 60_000)
const on = readReminderSettings({ enabled: true })
const inst = (dueDate: Date, over: Partial<Parameters<typeof instalmentReminders>[0]> = {}) => ({
  tenantId: 7,
  orderId: 42,
  orderStatus: 'partially_paid',
  index: 1,
  dueDate,
  status: 'pending',
  ...over,
})

describe('settings', () => {
  it('defaults are safe: off, with sensible offsets and night-time quiet hours', () => {
    expect(DEFAULT_REMINDER_SETTINGS.enabled).toBe(false)
    expect(DEFAULT_REMINDER_SETTINGS.instalment).toEqual({ enabled: true, daysBefore: [3, 0], daysAfter: [7, 1] })
    expect(DEFAULT_REMINDER_SETTINGS.live.hoursBefore).toEqual([24, 1])
    expect(DEFAULT_REMINDER_SETTINGS.followup.digestHour).toBe(8)
    expect(DEFAULT_REMINDER_SETTINGS.quietHours).toEqual({ start: 21, end: 8 })
  })
  it('garbage falls back to the defaults; partial JSON is merged', () => {
    expect(readReminderSettings('nope')).toEqual(DEFAULT_REMINDER_SETTINGS)
    expect(readReminderSettings({ enabled: true, instalment: { daysBefore: [999] } })).toEqual(DEFAULT_REMINDER_SETTINGS)
    const s = readReminderSettings({ enabled: true, live: { hoursBefore: [1, 2, 2] } })
    expect(s.live.hoursBefore).toEqual([2, 1])
    expect(s.instalment.daysBefore).toEqual([3, 0])
  })
  it('rejects 0 as an overdue offset and parses Persian digit lists', () => {
    expect(readReminderSettings({ instalment: { daysAfter: [0] } })).toEqual(DEFAULT_REMINDER_SETTINGS)
    expect(parseNumberList('۳، ۰ ,x 7')).toEqual([3, 0, 7])
  })
  it('kill switch is on only for the literal "true"', () => {
    expect(remindersEnabledByEnv(undefined)).toBe(false)
    expect(remindersEnabledByEnv('1')).toBe(false)
    expect(remindersEnabledByEnv(' true ')).toBe(true)
  })
})

describe('Tehran clock and quiet hours', () => {
  it('reads Tehran wall-clock time', () => {
    expect(tehranClock(teh('2026-11-09', 10, 15))).toEqual({ hour: 10, minute: 15 })
    expect(tehranClock(teh('2026-11-09', 0, 0))).toEqual({ hour: 0, minute: 0 })
  })
  it('wraps midnight (21 → 8)', () => {
    const q = { start: 21, end: 8 }
    expect(isQuietTime(teh('2026-11-09', 20, 59), q)).toBe(false)
    expect(isQuietTime(teh('2026-11-09', 21, 0), q)).toBe(true)
    expect(isQuietTime(teh('2026-11-09', 3, 0), q)).toBe(true)
    expect(isQuietTime(teh('2026-11-09', 8, 0), q)).toBe(false)
    expect(isQuietTime(teh('2026-11-09', 3), { start: 5, end: 5 })).toBe(false)
    expect(isQuietTime(teh('2026-11-09', 13), { start: 12, end: 14 })).toBe(true)
  })
  it('next sendable instant is 08:00 the next morning', () => {
    expect(nextSendableAt(teh('2026-11-09', 22, 10), { start: 21, end: 8 })).toEqual(teh('2026-11-10', 8))
    const day = teh('2026-11-09', 10, 7)
    expect(nextSendableAt(day, { start: 21, end: 8 })).toEqual(day)
  })
})

describe('instalment reminders', () => {
  const due = teh('2026-11-20', 12)
  it('3 days before, on the day, 1 and 7 days after — one stage per day', () => {
    expect(instalmentReminders(inst(due), teh('2026-11-17', 9), on).map((r) => r.stage)).toEqual(['before-3'])
    expect(instalmentReminders(inst(due), teh('2026-11-18', 9), on)).toEqual([])
    expect(instalmentReminders(inst(due), teh('2026-11-20', 0, 5), on).map((r) => [r.rule, r.stage])).toEqual([['instalment.due', 'due']])
    expect(instalmentReminders(inst(due), teh('2026-11-21', 9), on).map((r) => [r.rule, r.stage])).toEqual([['instalment.overdue', 'after-1']])
    expect(instalmentReminders(inst(due), teh('2026-11-27', 9), on).map((r) => r.stage)).toEqual(['after-7'])
    expect(instalmentReminders(inst(due), teh('2026-11-28', 9), on)).toEqual([])
  })
  it('uses the Tehran day, not the UTC day', () => {
    // 22:00 UTC on the 19th is 01:30 on the 20th in Tehran → the due-day reminder.
    expect(instalmentReminders(inst(due), new Date('2026-11-19T22:00:00Z'), on).map((r) => r.stage)).toEqual(['due'])
  })
  it('key is stable across runs, per recipient instalment and stage, and re-arms when the due date moves', () => {
    const a = instalmentReminders(inst(due), teh('2026-11-20', 9), on)[0]!
    const b = instalmentReminders(inst(due), teh('2026-11-20', 18), on)[0]!
    expect(a.key).toBe(b.key)
    expect(a.key).toBe('t7:instalment:42:1:2026-11-20:due')
    const moved = instalmentReminders(inst(teh('2026-11-21', 12)), teh('2026-11-21', 9), on)[0]!
    expect(moved.key).not.toBe(a.key)
    expect(a.expiresAt).toEqual(teh('2026-11-21', 0))
  })
  it('nothing for paid instalments, other order states, imported orders, or when switched off', () => {
    const now = teh('2026-11-20', 9)
    expect(instalmentReminders(inst(due, { status: 'paid' }), now, on)).toEqual([])
    for (const orderStatus of ['pending', 'paid', 'cancelled', 'refunded', 'failed']) expect(instalmentReminders(inst(due, { orderStatus }), now, on)).toEqual([])
    expect(instalmentReminders(inst(due, { orderSource: 'import' }), now, on)).toEqual([])
    expect(instalmentReminders(inst(due), now, DEFAULT_REMINDER_SETTINGS)).toEqual([])
    expect(instalmentReminders(inst(due), now, readReminderSettings({ enabled: true, instalment: { enabled: false } }))).toEqual([])
  })
  it('query window covers every configured offset', () => {
    const w = instalmentWindow(teh('2026-11-20', 9), on)
    expect(w.from).toEqual(teh('2026-11-13', 0))
    expect(w.to).toEqual(teh('2026-11-24', 0))
  })
})

describe('live class reminders', () => {
  const sess = { tenantId: 7, sessionId: 9, startsAt: teh('2026-11-20', 18), status: 'scheduled' }
  it('24h then 1h, each valid until the next offset; nothing once started', () => {
    expect(liveReminders(sess, 5, teh('2026-11-19', 17, 59), on)).toEqual([])
    const day = liveReminders(sess, 5, teh('2026-11-19', 18), on)[0]!
    expect(day.stage).toBe('24h')
    expect(day.expiresAt).toEqual(teh('2026-11-20', 17))
    expect(liveReminders(sess, 5, teh('2026-11-20', 16, 59), on)[0]!.stage).toBe('24h')
    expect(liveReminders(sess, 5, teh('2026-11-20', 17, 30), on)[0]!.stage).toBe('1h')
    expect(liveReminders(sess, 5, teh('2026-11-20', 18), on)).toEqual([])
  })
  it('one key per student; cancelled or moved classes behave', () => {
    const a = liveReminders(sess, 5, teh('2026-11-20', 17, 30), on)[0]!
    const b = liveReminders(sess, 6, teh('2026-11-20', 17, 30), on)[0]!
    expect(a.key).not.toBe(b.key)
    expect(liveReminders({ ...sess, status: 'cancelled' }, 5, teh('2026-11-20', 17, 30), on)).toEqual([])
    const moved = liveReminders({ ...sess, startsAt: teh('2026-11-20', 19) }, 5, teh('2026-11-20', 18, 30), on)[0]!
    expect(moved.key).not.toBe(a.key)
  })
})

describe('follow-up digest', () => {
  it('once per Tehran day from the digest hour, only with due follow-ups', () => {
    const input = { tenantId: 7, advisorId: 3, dueCount: 4 }
    expect(followupDigest(input, teh('2026-11-20', 7, 59), on)).toBeNull()
    const d = followupDigest(input, teh('2026-11-20', 8), on)!
    expect(d.key).toBe('t7:followup:2026-11-20:u3')
    expect(followupDigest(input, teh('2026-11-20', 15), on)!.key).toBe(d.key)
    expect(followupDigest({ ...input, dueCount: 0 }, teh('2026-11-20', 9), on)).toBeNull()
  })
})

describe('send decision', () => {
  const r = instalmentReminders(inst(teh('2026-11-20', 12)), teh('2026-11-20', 9), on)[0]!
  const ok = { mobile: '09121234567' }
  it('sends in the day, defers in quiet hours, skips opt-out / missing mobile / inactive / expired', () => {
    expect(decideSend(r, ok, teh('2026-11-20', 9), on)).toEqual({ action: 'send' })
    expect(decideSend(r, ok, teh('2026-11-20', 22), on)).toEqual({ action: 'defer', until: teh('2026-11-21', 8) })
    expect(decideSend(r, { ...ok, optedOut: true }, teh('2026-11-20', 9), on)).toEqual({ action: 'skip', reason: 'opted-out' })
    expect(decideSend(r, { mobile: null }, teh('2026-11-20', 9), on)).toEqual({ action: 'skip', reason: 'no-mobile' })
    expect(decideSend(r, { mobile: '12345' }, teh('2026-11-20', 9), on)).toEqual({ action: 'skip', reason: 'no-mobile' })
    expect(decideSend(r, { ...ok, active: false }, teh('2026-11-20', 9), on)).toEqual({ action: 'skip', reason: 'inactive' })
    expect(decideSend(r, ok, teh('2026-11-21', 9), on)).toEqual({ action: 'skip', reason: 'expired' })
  })
})

describe('retry', () => {
  it('backs off 5, 15, 45 minutes and gives up after the last attempt or past expiry', () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([5, 15, 45].map((m) => m * 60_000))
    expect(retryDelayMs(10)).toBe(3 * 3_600_000)
    const now = teh('2026-11-20', 9)
    expect(afterFailure(1, now, teh('2026-11-21', 0))).toEqual({ status: 'failed', nextAttemptAt: new Date(now.getTime() + 5 * 60_000) })
    expect(afterFailure(MAX_SEND_ATTEMPTS, now, teh('2026-11-21', 0))).toEqual({ status: 'dead' })
    expect(afterFailure(1, now, new Date(now.getTime() + 60_000))).toEqual({ status: 'dead' })
  })
})

describe('providers, links, texts and permissions', () => {
  it('sandboxes and demo always use the mock', () => {
    expect(mustUseMockSms({ slug: 'demo' })).toBe(true)
    expect(mustUseMockSms({ slug: 'x', isSandbox: true })).toBe(true)
    expect(mustUseMockSms({ slug: 'iba', isSandbox: false })).toBe(false)
  })
  it('academy origin: custom domain over https, localhost keeps the dev port', () => {
    expect(academyOrigin(['iranbrand.academy'], 'https://edvora.ir/')).toBe('https://iranbrand.academy')
    expect(academyOrigin(['demo.localhost'], 'http://localhost:3000')).toBe('http://demo.localhost:3000')
    expect(academyOrigin([], 'http://localhost:3000/')).toBe('http://localhost:3000')
  })
  it('every rule has a template event and a default text using only its variables, with no digits', () => {
    for (const rule of REMINDER_RULES) {
      expect(MESSAGE_EVENTS.some((e) => e.key === rule), rule).toBe(true)
      expect(unknownVariables(rule, DEFAULT_REMINDER_TEXTS[rule]), rule).toEqual([])
      expect(DEFAULT_REMINDER_TEXTS[rule]).not.toMatch(/[0-9۰-۹]/)
    }
  })
  it('new permissions: in the catalog, admin has both, finance/support view only, advisor neither', () => {
    const t = (k: string) => ROLE_TEMPLATES.find((r) => r.key === k)!.permissions as readonly string[]
    expect(ACADEMY_PERMISSIONS).toEqual(expect.arrayContaining(['notifications.view', 'notifications.manage']))
    expect(t('academy-admin')).toEqual(expect.arrayContaining(['notifications.view', 'notifications.manage']))
    expect(t('finance')).toContain('notifications.view')
    expect(t('support')).toContain('notifications.view')
    expect(t('finance')).not.toContain('notifications.manage')
    expect(t('advisor')).not.toContain('notifications.view')
    expect(SECTION_PERMISSION.reminders).toBe('notifications.manage')
  })
})
