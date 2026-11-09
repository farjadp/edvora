import { describe, expect, it } from 'vitest'
import type { AccessContext, MembershipGrant } from './access'
import {
  actorSeesLead,
  buildLeadTimeline,
  canAssignLead,
  canClaimLead,
  checkCallLog,
  crmKpis,
  gregorianToJalali,
  isLeapJalaliYear,
  jalaliMonthLength,
  jalaliMonthStart,
  jalaliToGregorian,
  leadDue,
  leadPoolAccess,
  leadSearch,
  leadSourceKey,
  matchesLeadSearch,
  nextLeadStatuses,
  sortFollowUps,
  tehranLocalToUtc,
  utcToTehranLocal,
} from './crm'
import { toLatinDigits } from './digits'
import { formatJalali } from './jalali'
import { ROLE_TEMPLATES } from './permissions'

const NOW = new Date('2026-11-09T09:00:00Z') // 18 Aban 1405, 12:30 Tehran

describe('Jalali calendar', () => {
  it('converts known dates both ways', () => {
    expect(gregorianToJalali(2024, 3, 20)).toEqual({ jy: 1403, jm: 1, jd: 1 })
    expect(gregorianToJalali(2025, 3, 21)).toEqual({ jy: 1404, jm: 1, jd: 1 })
    expect(gregorianToJalali(2026, 11, 9)).toEqual({ jy: 1405, jm: 8, jd: 18 })
    expect(jalaliToGregorian(1405, 8, 18)).toEqual({ gy: 2026, gm: 11, gd: 9 })
    expect(jalaliToGregorian(1403, 12, 30)).toEqual({ gy: 2025, gm: 3, gd: 20 })
  })

  it('knows leap years and month lengths', () => {
    expect(isLeapJalaliYear(1403)).toBe(true)
    expect(isLeapJalaliYear(1404)).toBe(false)
    expect(jalaliMonthLength(1405, 1)).toBe(31)
    expect(jalaliMonthLength(1405, 7)).toBe(30)
    expect(jalaliMonthLength(1403, 12)).toBe(30)
    expect(jalaliMonthLength(1404, 12)).toBe(29)
  })

  it('agrees with the display formatter for two years of days', () => {
    for (let t = Date.UTC(2025, 0, 1, 12); t < Date.UTC(2027, 0, 1); t += 86_400_000) {
      const d = new Date(t)
      const j = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
      expect(`${j.jy}-${j.jm}-${j.jd}`).toBe(toLatinDigits(formatJalali(d, 'yyyy-M-d')))
      expect(jalaliToGregorian(j.jy, j.jm, j.jd)).toEqual({ gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() })
    }
  })

  it('maps Tehran wall clock to UTC and back', () => {
    const at = tehranLocalToUtc({ jy: 1405, jm: 8, jd: 19, hour: 10, minute: 30 })
    expect(at?.toISOString()).toBe('2026-11-10T07:00:00.000Z')
    expect(utcToTehranLocal(at!)).toEqual({ jy: 1405, jm: 8, jd: 19, hour: 10, minute: 30 })
    expect(utcToTehranLocal('2026-11-09T21:00:00Z')).toEqual({ jy: 1405, jm: 8, jd: 19, hour: 0, minute: 30 })
  })

  it('rejects impossible dates and times', () => {
    expect(tehranLocalToUtc({ jy: 1405, jm: 7, jd: 31, hour: 9, minute: 0 })).toBeNull()
    expect(tehranLocalToUtc({ jy: 1404, jm: 12, jd: 30, hour: 9, minute: 0 })).toBeNull()
    expect(tehranLocalToUtc({ jy: 1405, jm: 13, jd: 1, hour: 9, minute: 0 })).toBeNull()
    expect(tehranLocalToUtc({ jy: 1405, jm: 1, jd: 1, hour: 24, minute: 0 })).toBeNull()
    expect(tehranLocalToUtc({ jy: 1405, jm: 1, jd: 1.5, hour: 9, minute: 0 })).toBeNull()
  })

  it('finds the start of the Jalali month in UTC', () => {
    expect(jalaliMonthStart(NOW).toISOString()).toBe('2026-10-22T20:30:00.000Z') // 1 Aban 1405 00:00 Tehran
  })
})

describe('queue rules', () => {
  it('classifies due state by Tehran day; closed leads are never due', () => {
    expect(leadDue({ status: 'contacted', nextFollowUpAt: '2026-11-08T19:00:00Z' }, NOW)).toBe('overdue')
    // 23:59 Tehran yesterday is still overdue; 00:30 Tehran today is today.
    expect(leadDue({ status: 'contacted', nextFollowUpAt: '2026-11-08T20:29:00Z' }, NOW)).toBe('overdue')
    expect(leadDue({ status: 'contacted', nextFollowUpAt: '2026-11-08T21:00:00Z' }, NOW)).toBe('today')
    expect(leadDue({ status: 'new', nextFollowUpAt: '2026-11-09T20:31:00Z' }, NOW)).toBe('later')
    expect(leadDue({ status: 'new', nextFollowUpAt: null }, NOW)).toBe('none')
    expect(leadDue({ status: 'lost', nextFollowUpAt: '2026-11-01T00:00:00Z' }, NOW)).toBe('none')
    expect(leadDue({ status: 'enrolled', nextFollowUpAt: '2026-11-01T00:00:00Z' }, NOW)).toBe('none')
  })

  it('sorts follow-ups by time, unscheduled last', () => {
    const rows = [{ id: 1, nextFollowUpAt: null }, { id: 2, nextFollowUpAt: '2026-11-09T08:00:00Z' }, { id: 3, nextFollowUpAt: '2026-11-07T08:00:00Z' }]
    expect(sortFollowUps(rows).map((r) => r.id)).toEqual([3, 2, 1])
  })

  it('offers only allowed status moves, current first', () => {
    expect(nextLeadStatuses('new')).toEqual(['new', 'contacted', 'lost'])
    expect(nextLeadStatuses('enrolled')).toEqual(['enrolled'])
    expect(nextLeadStatuses('lost')).toEqual(['lost', 'follow_up'])
  })
})

describe('search', () => {
  it('normalises a full mobile in any form', () => {
    expect(leadSearch('+98 912 123 4567')).toEqual({ text: '+98 912 123 4567', phone: '09121234567' })
    expect(leadSearch('۰۹۱۲۱۲۳۴۵۶۷')?.phone).toBe('09121234567')
    expect(leadSearch('0098-912-123-4567')?.phone).toBe('09121234567')
  })

  it('treats partial digits as a phone substring and names as text', () => {
    expect(leadSearch('۴۵۶۷')).toEqual({ text: '۴۵۶۷', phone: '4567' })
    expect(leadSearch('0912 12')?.phone).toBe('91212')
    expect(leadSearch('سارا')).toEqual({ text: 'سارا', phone: null })
    expect(leadSearch('   ')).toBeNull()
    expect(leadSearch(undefined)).toBeNull()
  })

  it('matches loaded rows with the same rule', () => {
    const lead = { name: 'سارا احمدی', phone: '09121234567' }
    expect(matchesLeadSearch(lead, leadSearch('۴۵۶۷'))).toBe(true)
    expect(matchesLeadSearch(lead, leadSearch('+989121234567'))).toBe(true)
    expect(matchesLeadSearch(lead, leadSearch('احمدی'))).toBe(true)
    expect(matchesLeadSearch(lead, leadSearch('رضا'))).toBe(false)
    expect(matchesLeadSearch(lead, null)).toBe(true)
  })

  it('keys sources by UTM, else direct', () => {
    expect(leadSourceKey({ utmSource: ' Instagram ' })).toBe('instagram')
    expect(leadSourceKey({ utmSource: null })).toBe('direct')
    expect(leadSourceKey(null)).toBe('direct')
  })
})

describe('KPIs', () => {
  it('counts new today, my due/overdue and this month conversion', () => {
    const k = crmKpis({
      userId: 7,
      now: NOW,
      leads: [
        { createdAt: '2026-11-09T05:00:00Z', status: 'new', advisorId: null, nextFollowUpAt: '2026-11-09T07:00:00Z' },
        { createdAt: '2026-11-01T05:00:00Z', status: 'contacted', advisorId: 7, nextFollowUpAt: '2026-11-09T15:00:00Z' },
        { createdAt: '2026-11-01T05:00:00Z', status: 'follow_up', advisorId: 7, nextFollowUpAt: '2026-11-05T15:00:00Z' },
        { createdAt: '2026-11-02T05:00:00Z', status: 'enrolled', advisorId: 7, nextFollowUpAt: null },
        { createdAt: '2026-10-01T05:00:00Z', status: 'enrolled', advisorId: 7, nextFollowUpAt: null }, // last month
        { createdAt: '2026-11-03T05:00:00Z', status: 'contacted', advisorId: 9, nextFollowUpAt: '2026-11-05T15:00:00Z' }, // someone else's
      ],
    })
    expect(k.newToday).toBe(1)
    expect(k.dueToday).toBe(1)
    expect(k.overdue).toBe(1)
    expect(k.conversion).toEqual({ created: 5, enrolled: 1, pct: 20 })
  })

  it('has no conversion percentage without leads this month', () => {
    expect(crmKpis({ userId: 1, now: NOW, leads: [] }).conversion).toEqual({ created: 0, enrolled: 0, pct: null })
  })
})

// ---------------------------------------------------------------- pool, claim and assign

const T = 1
const OTHER_T = 2
const perms = (key: string) => ROLE_TEMPLATES.find((r) => r.key === key)!.permissions
const member = (permissions: readonly string[], scope: MembershipGrant['scope'] = {}, extra: Partial<MembershipGrant> = {}): MembershipGrant => ({ tenantId: T, status: 'active', permissions, scope, ...extra })
const ctx = (userId: number, memberships: MembershipGrant[], isPlatformAdmin = false): AccessContext => ({ userId, isPlatformAdmin, memberships, now: NOW })

describe('pool and claim', () => {
  const advisor = ctx(10, [member(perms('advisor'))])
  const advisorOwn = ctx(11, [member(perms('advisor'), { ownRecordsOnly: true })])
  const scoped = ctx(12, [member(perms('advisor'), { courses: [5] })])
  const noClaim = ctx(13, [member(['leads.view.own'])])
  const manager = ctx(14, [member(perms('sales-manager'))])

  it('advisor template can claim; ownRecordsOnly sees no pool', () => {
    expect(perms('advisor')).toContain('leads.claim')
    expect(perms('sales-manager')).toContain('leads.claim')
    expect(leadPoolAccess(advisor, T)).toEqual({ canSee: true, courses: null })
    expect(leadPoolAccess(advisorOwn, T)).toEqual({ canSee: false })
    expect(leadPoolAccess(noClaim, T)).toEqual({ canSee: false })
    expect(leadPoolAccess(advisor, OTHER_T)).toEqual({ canSee: false })
  })

  it('suspended or expired memberships grant no pool', () => {
    expect(leadPoolAccess(ctx(1, [member(perms('advisor'), {}, { status: 'suspended' })]), T).canSee).toBe(false)
    expect(leadPoolAccess(ctx(1, [member(perms('advisor'), {}, { expiresAt: '2026-01-01T00:00:00Z' })]), T).canSee).toBe(false)
  })

  it('claims only unassigned, open leads inside the course scope', () => {
    const open = { advisorId: null, courseId: 5, status: 'new' as const }
    expect(canClaimLead(advisor, T, open)).toEqual({ ok: true })
    expect(canClaimLead(advisor, T, { ...open, advisorId: 99 })).toEqual({ ok: false, reason: 'taken' })
    expect(canClaimLead(advisor, T, { ...open, status: 'lost' })).toEqual({ ok: false, reason: 'closed' })
    expect(canClaimLead(advisorOwn, T, open)).toEqual({ ok: false, reason: 'forbidden' })
    expect(canClaimLead(scoped, T, open)).toEqual({ ok: true })
    expect(canClaimLead(scoped, T, { ...open, courseId: 6 })).toEqual({ ok: false, reason: 'forbidden' })
    expect(canClaimLead(scoped, T, { ...open, courseId: null })).toEqual({ ok: false, reason: 'forbidden' })
    expect(canClaimLead(advisor, OTHER_T, open)).toEqual({ ok: false, reason: 'forbidden' })
    expect(canClaimLead(ctx(1, [], true), OTHER_T, open)).toEqual({ ok: true })
  })

  it('advisors open own and pool leads only; managers open all', () => {
    expect(actorSeesLead(advisor, T, { advisorId: 10, courseId: 5 })).toBe(true)
    expect(actorSeesLead(advisor, T, { advisorId: null, courseId: 5 })).toBe(true)
    expect(actorSeesLead(advisor, T, { advisorId: 99, courseId: 5 })).toBe(false)
    expect(actorSeesLead(advisorOwn, T, { advisorId: null, courseId: 5 })).toBe(false)
    expect(actorSeesLead(manager, T, { advisorId: 99, courseId: 5 })).toBe(true)
  })

  it('assigning needs leads.assign and a target who can work the lead', () => {
    const lead = { advisorId: 10, courseId: 5 }
    expect(canAssignLead(manager, advisor, T, lead)).toBe(true)
    expect(canAssignLead(manager, scoped, T, lead)).toBe(true)
    expect(canAssignLead(manager, scoped, T, { ...lead, courseId: 6 })).toBe(false)
    expect(canAssignLead(manager, ctx(20, [member(['courses.view'])]), T, lead)).toBe(false)
    expect(canAssignLead(manager, ctx(21, [{ ...member(perms('advisor')), tenantId: OTHER_T }]), T, lead)).toBe(false)
    expect(canAssignLead(advisor, manager, T, lead)).toBe(false)
  })
})

// ---------------------------------------------------------------- call log

describe('call log', () => {
  const base = { from: 'contacted' as const, to: 'contacted' as const, outcome: 'reached' as const, now: NOW }

  it('accepts a normal call with a future follow-up', () => {
    expect(checkCallLog({ ...base, nextFollowUpAt: '2026-11-10T07:00:00Z' })).toEqual({ ok: true })
    expect(checkCallLog({ ...base, nextFollowUpAt: null })).toEqual({ ok: true })
    expect(checkCallLog(base)).toEqual({ ok: true })
  })

  it('refuses a status move the pipeline does not allow', () => {
    expect(checkCallLog({ ...base, from: 'new', to: 'enrolled' })).toMatchObject({ ok: false, field: 'status' })
    expect(checkCallLog({ ...base, from: 'enrolled', to: 'contacted' })).toMatchObject({ ok: false, field: 'status' })
  })

  it('needs a lost reason when marking lost', () => {
    expect(checkCallLog({ ...base, to: 'lost' })).toMatchObject({ ok: false, field: 'lostReason' })
    expect(checkCallLog({ ...base, to: 'lost', lostReason: 'price' })).toEqual({ ok: true })
  })

  it('refuses a past follow-up and a follow-up after enrolment', () => {
    expect(checkCallLog({ ...base, nextFollowUpAt: '2026-11-09T08:00:00Z' })).toMatchObject({ ok: false, field: 'next' })
    expect(checkCallLog({ ...base, nextFollowUpAt: '2026-11-09T08:57:00Z' })).toEqual({ ok: true }) // within the grace
    expect(checkCallLog({ ...base, to: 'enrolled', nextFollowUpAt: '2026-11-10T07:00:00Z' })).toMatchObject({ ok: false, field: 'next' })
    expect(checkCallLog({ ...base, nextFollowUpAt: 'not a date' })).toMatchObject({ ok: false, field: 'next' })
  })

  it('refuses an unknown outcome', () => {
    expect(checkCallLog({ ...base, outcome: 'maybe' as never })).toMatchObject({ ok: false, field: 'outcome' })
  })
})

describe('timeline', () => {
  it('merges created, calls, status and owner changes and orders, newest first', () => {
    const t = buildLeadTimeline({
      createdAt: '2026-11-01T08:00:00Z',
      source: 'instagram',
      followUps: [
        { at: '2026-11-02T08:00:00Z', outcome: 'no_answer', note: null, by: 7 },
        { at: '2026-11-03T08:00:00Z', outcome: 'reached', note: 'قیمت را پرسید', by: 7 },
        { at: '2026-11-04T08:00:00Z', outcome: 'status_changed', note: 'شهریه برایش مناسب نبود', by: 7 },
        { at: '2026-11-04T09:00:00Z', outcome: 'mystery', note: null, by: 7 },
      ],
      changes: [
        { at: '2026-11-01T09:00:00Z', by: 3, advisor: { from: null, to: 7 } },
        { at: '2026-11-03T08:00:00Z', by: 7, status: { from: 'new', to: 'contacted' } },
        { at: '2026-11-03T10:00:00Z', by: 7, status: { from: 'contacted', to: 'contacted' } },
        { at: '2026-11-03T11:00:00Z', by: 7, advisor: { from: { id: 7, createdAt: 'x' }, to: 7 } },
      ],
      orders: [{ id: 50, createdAt: '2026-11-05T08:00:00Z', status: 'paid', total: 10_000_000, courseTitle: 'برندسازی' }],
    })
    expect(t.map((e) => e.kind)).toEqual(['order', 'followUp', 'status', 'call', 'call', 'owner', 'created'])
    expect(t[2]).toMatchObject({ kind: 'status', from: 'new', to: 'contacted' })
    expect(t[5]).toMatchObject({ kind: 'owner', from: null, to: 7, by: 3 })
  })
})
