/**
 * Advisor CRM desk rules (E-015). Pure and client-safe (`@edvora/core/crm`): no Payload, no node built-ins.
 * - Jalali ⇄ UTC for the follow-up picker (stored UTC, shown Jalali, Tehran wall clock).
 * - Queue rules: due state, search normalisation, KPIs.
 * - Who may see the unassigned pool and claim a lead (`leads.claim`, never with `ownRecordsOnly`).
 * - Call-log validation (outcome + status via `canTransitionLead` + next follow-up) and lost reasons.
 * - The lead timeline (created, status/owner changes, calls, orders), newest first.
 */
import { activeMemberships, can, isPlatformAdmin, type AccessContext, type Id } from './access'
import { toLatinDigits } from './digits'
import { dayStartsAt, tehranDayNumber } from './gamification/calendar'
import { formatJalali } from './jalali'
import { LEAD_STATUSES, canTransitionLead, type LeadStatus } from './leads'
import { normalizeIranMobile } from './phone'
import { satisfies } from './permissions'
import { DATE_MOVED, STATUS_CHANGED, isLeadOutcome, type FollowUpKind, type LeadOutcome } from './staffGoals'

export type { LeadStatus }

const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------- Jalali calendar (jalaali algorithm, Borkowski)

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]
const div = (a: number, b: number) => ~~(a / b)
const mod = (a: number, b: number) => a - ~~(a / b) * b

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const gy = jy + 621
  let leapJ = -14
  let jp = BREAKS[0]!
  let jump = 0
  if (jy < jp || jy >= BREAKS[BREAKS.length - 1]!) throw new RangeError(`Jalali year out of range: ${jy}`)
  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i]!
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

function g2d(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

export type JalaliDate = { jy: number; jm: number; jd: number }

export const isLeapJalaliYear = (jy: number): boolean => jalCal(jy).leap === 0

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return isLeapJalaliYear(jy) ? 30 : 29
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  const r = jalCal(jy)
  return d2g(g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1)
}

export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const jdn = g2d(gy, gm, gd)
  let jy = gy - 621
  const r = jalCal(jy)
  let k = jdn - g2d(gy, 3, r.march)
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 }
}

export const JALALI_MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'] as const

export type TehranLocal = JalaliDate & { hour: number; minute: number }

/** Tehran wall-clock Jalali date + time → UTC instant. Null for an impossible date (e.g. 31 Mehr, 30 Esfand of a common year). */
export function tehranLocalToUtc(v: TehranLocal): Date | null {
  const { jy, jm, jd, hour, minute } = v
  if (![jy, jm, jd, hour, minute].every(Number.isInteger)) return null
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > jalaliMonthLength(jy, jm)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd)
  const day = Math.round(Date.UTC(gy, gm - 1, gd) / DAY_MS)
  return new Date(dayStartsAt(day).getTime() + (hour * 60 + minute) * 60_000)
}

/** UTC instant → Tehran wall-clock Jalali parts (for prefilling the picker). */
export function utcToTehranLocal(at: Date | string): TehranLocal {
  const day = tehranDayNumber(at)
  const g = new Date(day * DAY_MS)
  const j = gregorianToJalali(g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate())
  const minutes = Math.round((new Date(at).getTime() - dayStartsAt(day).getTime()) / 60_000)
  return { ...j, hour: Math.floor(minutes / 60), minute: minutes % 60 }
}

// ---------------------------------------------------------------- Queue rules

export type LeadDue = 'overdue' | 'today' | 'later' | 'none'

/** Overdue = a Tehran day before today; today; later; none = nothing scheduled. Closed leads are never due. */
export function leadDue(lead: { status: LeadStatus; nextFollowUpAt?: Date | string | null }, now: Date): LeadDue {
  if (!lead.nextFollowUpAt || isClosedLead(lead.status)) return 'none'
  const day = tehranDayNumber(lead.nextFollowUpAt)
  const today = tehranDayNumber(now)
  return day < today ? 'overdue' : day === today ? 'today' : 'later'
}

export const CLOSED_LEAD_STATUSES: readonly LeadStatus[] = ['enrolled', 'lost']
export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = LEAD_STATUSES.filter((s) => !CLOSED_LEAD_STATUSES.includes(s))
export const isClosedLead = (s: LeadStatus) => CLOSED_LEAD_STATUSES.includes(s)

/** Statuses a call can move the lead to (the current one first). */
export function nextLeadStatuses(from: LeadStatus): LeadStatus[] {
  return [from, ...LEAD_STATUSES.filter((s) => s !== from && canTransitionLead(from, s))]
}

/** Today's follow-ups: overdue + due today, oldest first (overdue rises to the top by time). */
export function sortFollowUps<T extends { nextFollowUpAt?: Date | string | null }>(rows: readonly T[]): T[] {
  const t = (r: T) => (r.nextFollowUpAt ? new Date(r.nextFollowUpAt).getTime() : Number.POSITIVE_INFINITY)
  return [...rows].sort((a, b) => t(a) - t(b))
}

export type LeadSearch = { text: string; phone: string | null }

/**
 * Normalises the desk search box. Persian/Arabic digits → Latin; a full Iranian mobile in any form (+98, 0098,
 * spaces) becomes `09…`; three or more digits search the phone as a substring. Empty text = no search.
 */
export function leadSearch(raw: string | null | undefined): LeadSearch | null {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!text) return null
  const latin = toLatinDigits(text)
  const mobile = normalizeIranMobile(latin)
  const digits = latin.replace(/\D/g, '')
  return { text, phone: mobile ?? (digits.length >= 3 ? digits.replace(/^0+(?=9)/, '') : null) }
}

/** In-memory match with the same rule as the database filter (used where rows are already loaded). */
export function matchesLeadSearch(lead: { name: string; phone: string }, s: LeadSearch | null): boolean {
  if (!s) return true
  if (s.phone && toLatinDigits(lead.phone).includes(s.phone)) return true
  return lead.name.toLowerCase().includes(s.text.toLowerCase())
}

/** Source key for the filter: the UTM source, else `direct` (the academy's own forms). Latin, lower-case. */
export function leadSourceKey(source: { utmSource?: string | null } | null | undefined): string {
  const s = (source?.utmSource ?? '').trim().toLowerCase()
  return s ? s.slice(0, 60) : 'direct'
}

export type KpiLead = {
  createdAt: Date | string
  status: LeadStatus
  advisorId: Id | null
  nextFollowUpAt?: Date | string | null
}

export type CrmKpis = {
  /** Leads created today (Tehran) among the leads this person works (own + claimable pool, or the team). */
  newToday: number
  /** The person's own open leads due later today / already overdue. */
  dueToday: number
  overdue: number
  /** Leads created in this Jalali month and how many of them enrolled. `pct` null when none were created. */
  conversion: { created: number; enrolled: number; pct: number | null }
}

const sameId = (a: Id | null | undefined, b: Id | null | undefined) => a != null && b != null && String(a) === String(b)

export function crmKpis(input: { leads: readonly KpiLead[]; userId: Id; now: Date }): CrmKpis {
  const today = tehranDayNumber(input.now)
  const month = jalaliMonthOf(input.now)
  let newToday = 0
  let dueToday = 0
  let overdue = 0
  let created = 0
  let enrolled = 0
  for (const l of input.leads) {
    if (tehranDayNumber(l.createdAt) === today) newToday += 1
    if (sameId(l.advisorId, input.userId)) {
      const due = leadDue(l, input.now)
      if (due === 'today') dueToday += 1
      if (due === 'overdue') overdue += 1
    }
    if (jalaliMonthOf(l.createdAt) === month) {
      created += 1
      if (l.status === 'enrolled') enrolled += 1
    }
  }
  return { newToday, dueToday, overdue, conversion: { created, enrolled, pct: created ? Math.round((enrolled / created) * 100) : null } }
}

function jalaliMonthOf(at: Date | string): string {
  const j = utcToTehranLocal(at)
  return `${j.jy}-${j.jm}`
}

/** UTC start of the current Jalali month (Tehran) — for "this month" queries. */
export function jalaliMonthStart(now: Date): Date {
  const j = utcToTehranLocal(now)
  return tehranLocalToUtc({ jy: j.jy, jm: j.jm, jd: 1, hour: 0, minute: 0 })!
}

/** UTC start of the Tehran day of `now` (+ `days`). */
export function tehranDayStart(now: Date, days = 0): Date {
  return dayStartsAt(tehranDayNumber(now) + days)
}

// ---------------------------------------------------------------- Pool and claiming

export type PoolAccess = { canSee: false } | { canSee: true; courses: Id[] | null }

/**
 * The unassigned pool (leads with no advisor) is visible to holders of `leads.claim` in this academy whose
 * membership is NOT `ownRecordsOnly` (that switch means "only my own records", so no pool). A course scope on the
 * membership narrows the pool to those courses; a pool lead without a course is then outside it (fail closed).
 */
export function leadPoolAccess(ctx: AccessContext, tenantId: Id): PoolAccess {
  if (isPlatformAdmin(ctx)) return { canSee: true, courses: null }
  const grants = activeMemberships(ctx).filter((m) => sameId(m.tenantId, tenantId) && !m.scope?.ownRecordsOnly && m.permissions.some((p) => satisfies(p, 'leads.claim')))
  if (grants.length === 0) return { canSee: false }
  if (grants.some((m) => !m.scope?.courses || m.scope.courses.length === 0)) return { canSee: true, courses: null }
  const courses: Id[] = []
  for (const m of grants) for (const c of m.scope?.courses ?? []) if (!courses.some((x) => sameId(x, c))) courses.push(c)
  return { canSee: true, courses }
}

export type ClaimTarget = { advisorId: Id | null; courseId: Id | null; status: LeadStatus }

export type ClaimDecision = { ok: true } | { ok: false; reason: 'taken' | 'closed' | 'forbidden' }

export function canClaimLead(ctx: AccessContext, tenantId: Id, lead: ClaimTarget): ClaimDecision {
  const pool = leadPoolAccess(ctx, tenantId)
  if (!pool.canSee) return { ok: false, reason: 'forbidden' }
  if (pool.courses && !pool.courses.some((c) => sameId(c, lead.courseId))) return { ok: false, reason: 'forbidden' }
  if (lead.advisorId != null) return { ok: false, reason: 'taken' }
  if (isClosedLead(lead.status)) return { ok: false, reason: 'closed' }
  return { ok: true }
}

/**
 * Assigning to someone else needs `leads.assign` over the lead (scope included), and the new advisor must be able to
 * work it: `leads.view` in this academy covering that lead as its owner (checked on the target's own grants).
 */
export function canAssignLead(actor: AccessContext, target: AccessContext, tenantId: Id, lead: { advisorId: Id | null; courseId: Id | null }): boolean {
  if (!can(actor, tenantId, 'leads.assign', { courseId: lead.courseId })) return false
  // The actor must see the lead: through `leads.view` (own/all + course scope), or as a pool lead they may claim.
  if (!actorSeesLead(actor, tenantId, lead)) return false
  return can(target, tenantId, 'leads.view', { ownerId: target.userId, courseId: lead.courseId })
}

/** Can this person open the lead at all (desk lead page)? `leads.view` scope, or the claimable pool. */
export function actorSeesLead(ctx: AccessContext, tenantId: Id, lead: { advisorId: Id | null; courseId: Id | null }): boolean {
  if (can(ctx, tenantId, 'leads.view', { ownerId: lead.advisorId, courseId: lead.courseId })) return true
  if (lead.advisorId != null) return false
  const pool = leadPoolAccess(ctx, tenantId)
  return pool.canSee && (pool.courses === null || pool.courses.some((c) => sameId(c, lead.courseId)))
}

// ---------------------------------------------------------------- Call log and lost reasons

export const LEAD_LOST_REASONS = ['price', 'timing', 'chose_other', 'not_reachable', 'not_a_fit', 'other'] as const
export type LeadLostReason = (typeof LEAD_LOST_REASONS)[number]

export const LEAD_LOST_REASON_LABELS_FA: Record<LeadLostReason, string> = {
  price: 'شهریه برایش مناسب نبود',
  timing: 'زمان دوره برایش مناسب نبود',
  chose_other: 'جای دیگری ثبت‌نام کرد',
  not_reachable: 'در دسترس نبود',
  not_a_fit: 'دوره مناسب نیازش نبود',
  other: 'دلیل دیگر',
}

export const isLostReason = (v: unknown): v is LeadLostReason => typeof v === 'string' && (LEAD_LOST_REASONS as readonly string[]).includes(v)

export type CallLogInput = {
  from: LeadStatus
  to: LeadStatus
  outcome: LeadOutcome
  /** undefined = stage default, null = no next follow-up. */
  nextFollowUpAt?: Date | string | null
  lostReason?: LeadLostReason | null
  now: Date
}

export type CallLogCheck = { ok: true } | { ok: false; field: 'status' | 'next' | 'lostReason' | 'outcome'; message: string }

/** Grace for "in the past": a picker set to the current minute must still pass a slow submit. */
const PAST_GRACE_MS = 5 * 60_000

export function checkCallLog(v: CallLogInput): CallLogCheck {
  if (!isLeadOutcome(v.outcome)) return { ok: false, field: 'outcome', message: 'نتیجهٔ تماس را انتخاب کنید.' }
  if (!canTransitionLead(v.from, v.to)) return { ok: false, field: 'status', message: 'این تغییر وضعیت مجاز نیست.' }
  if (v.to === 'lost' && v.from !== 'lost' && !v.lostReason) return { ok: false, field: 'lostReason', message: 'دلیل از دست رفتن را انتخاب کنید.' }
  if (v.nextFollowUpAt) {
    const t = new Date(v.nextFollowUpAt).getTime()
    if (!Number.isFinite(t)) return { ok: false, field: 'next', message: 'تاریخ پیگیری بعدی معتبر نیست.' }
    if (t < v.now.getTime() - PAST_GRACE_MS) return { ok: false, field: 'next', message: 'تاریخ پیگیری بعدی باید در آینده باشد.' }
    if (v.to === 'enrolled') return { ok: false, field: 'next', message: 'برای سرنخی که ثبت‌نام کرده پیگیری بعدی لازم نیست.' }
  }
  return { ok: true }
}

// ---------------------------------------------------------------- Timeline

export type TimelineEvent =
  | { kind: 'created'; at: string; source: string }
  | { kind: 'status'; at: string; from: LeadStatus; to: LeadStatus; by: Id | null }
  | { kind: 'owner'; at: string; from: Id | null; to: Id | null; by: Id | null }
  | { kind: 'call'; at: string; outcome: LeadOutcome; note: string | null; by: Id | null }
  | { kind: 'followUp'; at: string; entry: typeof STATUS_CHANGED | typeof DATE_MOVED; note: string | null; by: Id | null }
  | { kind: 'order'; at: string; orderId: Id; status: string; total: number; courseTitle: string | null }

export type TimelineInput = {
  createdAt: Date | string
  source: string
  followUps: readonly { at: Date | string; outcome: FollowUpKind | string; note?: string | null; by: Id | null }[]
  /** From the audit log: changes to `status` / `advisor` of this lead. */
  changes: readonly { at: Date | string; by: Id | null; status?: { from: unknown; to: unknown }; advisor?: { from: unknown; to: unknown } }[]
  orders: readonly { id: Id; createdAt: Date | string; status: string; total: number; courseTitle: string | null }[]
}

const iso = (v: Date | string) => new Date(v).toISOString()
const isStatus = (v: unknown): v is LeadStatus => typeof v === 'string' && (LEAD_STATUSES as readonly string[]).includes(v)
const asId = (v: unknown): Id | null => (typeof v === 'number' || (typeof v === 'string' && v !== '') ? v : v && typeof v === 'object' && 'id' in v ? asId((v as { id: unknown }).id) : null)

/** Newest first. Unknown follow-up kinds are dropped rather than shown raw. */
export function buildLeadTimeline(v: TimelineInput): TimelineEvent[] {
  const out: TimelineEvent[] = [{ kind: 'created', at: iso(v.createdAt), source: v.source }]
  for (const f of v.followUps) {
    if (isLeadOutcome(f.outcome)) out.push({ kind: 'call', at: iso(f.at), outcome: f.outcome, note: f.note ?? null, by: f.by })
    else if (f.outcome === STATUS_CHANGED || f.outcome === DATE_MOVED) out.push({ kind: 'followUp', at: iso(f.at), entry: f.outcome, note: f.note ?? null, by: f.by })
  }
  for (const c of v.changes) {
    if (c.status && isStatus(c.status.from) && isStatus(c.status.to) && c.status.from !== c.status.to) out.push({ kind: 'status', at: iso(c.at), from: c.status.from, to: c.status.to, by: c.by })
    if (c.advisor) {
      const from = asId(c.advisor.from)
      const to = asId(c.advisor.to)
      if (!sameId(from, to) && !(from == null && to == null)) out.push({ kind: 'owner', at: iso(c.at), from, to, by: c.by })
    }
  }
  for (const o of v.orders) out.push({ kind: 'order', at: iso(o.createdAt), orderId: o.id, status: o.status, total: o.total, courseTitle: o.courseTitle })
  // Stable: same instant keeps insertion order (a call and the status change it caused).
  return out.map((e, i) => ({ e, i })).sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i).map((x) => x.e)
}

/** «۱۸ آبان ۱۴۰۵، ۱۴:۳۰» */
export const formatJalaliDateTime = (at: Date | string): string => `${formatJalali(at, 'd MMMM yyyy')}، ${formatJalali(at, 'HH:mm')}`
