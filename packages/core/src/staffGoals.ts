/**
 * Staff goals (PRD §4, G8–G10): outcomes, not activity. Pure and client-safe (`@edvora/core/staff-goals`).
 * - Advisor daily goal: due follow-ups closed with a RECORDED OUTCOME. Moving the date alone never counts.
 * - Follow-up streak: consecutive working days with every due follow-up handled; weekends, breaks and zero-due
 *   days are neutral; one freeze per Jalali month is spent automatically.
 * - Team goal: one shared weekly number, no individual ranking.
 * - Finance inbox zero: instalments waiting for a check, failed attempts, overdue instalments.
 */
import { breakDays, inBreak, jalaliMonthKey, tehranDayNumber, weekOf, weekdayOf } from './gamification/calendar'
import { WEEK_DAY_INDEX, type GamificationBreak, type WeekDay } from './gamification/settings'

export const LEAD_OUTCOMES = ['reached', 'no_answer', 'callback', 'wrong_number', 'not_interested'] as const
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number]

export const LEAD_OUTCOME_LABELS_FA: Record<LeadOutcome, string> = {
  reached: 'صحبت شد',
  no_answer: 'پاسخ نداد',
  callback: 'خواست بعداً تماس بگیریم',
  wrong_number: 'شماره اشتباه است',
  not_interested: 'فعلاً تمایل ندارد',
}

/** Written when a due follow-up date is moved WITHOUT an outcome: it stays "due" and never counts as done. */
export const DATE_MOVED = 'date_moved' as const
export type FollowUpKind = LeadOutcome | typeof DATE_MOVED

export const isLeadOutcome = (v: unknown): v is LeadOutcome => typeof v === 'string' && (LEAD_OUTCOMES as readonly string[]).includes(v)

export type FollowUpEntry = {
  at: Date | string
  outcome: FollowUpKind
  by: number | string | null
  /** The follow-up date this entry resolved (the lead's `nextFollowUpAt` before the change). */
  dueAt: Date | string | null
}

export type GoalLead = {
  id: number | string
  advisorId: number | string | null
  /** Current follow-up date (UTC); null = nothing scheduled. */
  nextFollowUpAt: Date | string | null
  followUps: readonly FollowUpEntry[]
}

const same = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b)
const counts = (e: FollowUpEntry) => e.outcome !== DATE_MOVED
const dayOf = (v: Date | string) => tehranDayNumber(v)

export type DailyGoal = { due: number; done: number; remaining: number; complete: boolean }

/**
 * «۵ از ۸ پیگیری انجام شد». `due` = this advisor's leads that were due today (still open, handled today, or moved
 * today); `done` = those handled today with an outcome by this advisor. Same lead twice in a day counts once.
 */
export function advisorDailyGoal(input: { leads: readonly GoalLead[]; advisorId: number | string; now: Date }): DailyGoal {
  const today = dayOf(input.now)
  const due = new Set<string>()
  const done = new Set<string>()
  for (const lead of input.leads) {
    if (!same(lead.advisorId, input.advisorId)) continue
    const id = String(lead.id)
    if (lead.nextFollowUpAt && dayOf(lead.nextFollowUpAt) <= today) due.add(id)
    for (const e of lead.followUps) {
      if (dayOf(e.at) !== today || !e.dueAt || dayOf(e.dueAt) > today) continue
      due.add(id)
      if (counts(e) && same(e.by, input.advisorId)) done.add(id)
    }
  }
  const d = due.size
  const n = [...done].filter((id) => due.has(id)).length
  return { due: d, done: n, remaining: Math.max(0, d - n), complete: d > 0 && n >= d }
}

export type StaffDayState = 'good' | 'missed' | 'frozen' | 'neutral'

export type FollowUpStreak = {
  current: number
  /** Today, once every due follow-up is handled, is already included in `current`. */
  todayComplete: boolean
  /** Per day, oldest first (lookback window only). */
  days: { day: number; state: StaffDayState }[]
}

/**
 * Consecutive working days with all due follow-ups handled. Reconstructed from the follow-up log: a follow-up due
 * on day D and handled on day H (≥ D) misses D…H-1; a moved date misses D…(move day); a lead still overdue misses
 * every day from its date until yesterday. Early handling is fine. Today never breaks anything.
 */
export function followUpStreak(input: {
  leads: readonly GoalLead[]
  advisorId: number | string
  now: Date
  weekendDays: readonly WeekDay[]
  breaks?: readonly GamificationBreak[]
  /** Days to look back (default 120). */
  lookbackDays?: number
}): FollowUpStreak {
  const today = dayOf(input.now)
  const from = today - (input.lookbackDays ?? 120)
  const weekend = new Set(input.weekendDays.map((d) => WEEK_DAY_INDEX[d]))
  const breaks = breakDays(input.breaks ?? [])
  const missed = new Set<number>()
  const handled = new Set<number>()
  const miss = (a: number, b: number) => {
    for (let d = Math.max(a, from); d <= Math.min(b, today - 1); d++) missed.add(d)
  }
  for (const lead of input.leads) {
    if (!same(lead.advisorId, input.advisorId)) continue
    for (const e of lead.followUps) {
      if (!e.dueAt) continue
      const due = dayOf(e.dueAt)
      const at = dayOf(e.at)
      if (at < due) continue // handled early: never due
      if (counts(e)) {
        miss(due, at - 1)
        handled.add(at)
      } else miss(due, at)
    }
    if (lead.nextFollowUpAt) miss(dayOf(lead.nextFollowUpAt), today - 1)
  }
  const neutralDay = (d: number) => weekend.has(weekdayOf(d)) || inBreak(d, breaks)

  const days: FollowUpStreak['days'] = []
  for (let d = from; d < today; d++) {
    const state: StaffDayState = neutralDay(d) ? 'neutral' : missed.has(d) ? 'missed' : handled.has(d) ? 'good' : 'neutral'
    days.push({ day: d, state })
  }
  // Freezes: one per Jalali month, spent automatically on a missed working day, walking forward in time.
  const usedMonths = new Set<string>()
  for (const entry of days) {
    if (entry.state !== 'missed') continue
    const m = jalaliMonthKey(entry.day)
    if (!usedMonths.has(m)) {
      usedMonths.add(m)
      entry.state = 'frozen'
    }
  }
  let current = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const s = days[i]!.state
    if (s === 'good') current++
    else if (s === 'missed') break
  }
  const goal = advisorDailyGoal({ leads: input.leads, advisorId: input.advisorId, now: input.now })
  const todayComplete = !neutralDay(today) && goal.complete
  return { current: current + (todayComplete ? 1 : 0), todayComplete, days }
}

export type TeamGoal = { done: number; target: number; pct: number; reached: boolean; weekKey: string }

/**
 * One shared weekly ring (G9): follow-ups handled on time (on or before their date) this week, by anyone. Target =
 * the academy's number, or every follow-up due this week when none is set. No per-person numbers leave here.
 */
export function teamWeeklyGoal(input: { leads: readonly GoalLead[]; now: Date; weekStart: WeekDay; target: number | null }): TeamGoal {
  const week = weekOf(input.now, input.weekStart)
  const inWeek = (d: number) => d >= week.startDay && d <= week.endDay
  const doneKeys = new Set<string>()
  const dueKeys = new Set<string>()
  for (const lead of input.leads) {
    for (const e of lead.followUps) {
      if (!e.dueAt) continue
      const due = dayOf(e.dueAt)
      const at = dayOf(e.at)
      if (inWeek(due)) dueKeys.add(`${lead.id}:${due}`)
      if (counts(e) && inWeek(at) && at <= due) doneKeys.add(`${lead.id}:${due}`)
    }
    if (lead.nextFollowUpAt && inWeek(dayOf(lead.nextFollowUpAt))) dueKeys.add(`${lead.id}:${dayOf(lead.nextFollowUpAt)}`)
  }
  const done = doneKeys.size
  const target = Math.max(0, input.target ?? dueKeys.size)
  return { done, target, pct: target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0, reached: target > 0 && done >= target, weekKey: week.key }
}

// ---------------------------------------------------------------- Finance inbox zero

export type InboxOrder = {
  id: number | string
  status: string | null | undefined
  instalments: readonly { index: number; amount: number; dueDate: Date | string; status?: string | null }[]
  /** Gateway attempts in the order they were made. */
  payments: readonly { instalmentIndex: number; status?: string | null }[]
}

export type InboxItem = { orderId: number | string; instalmentIndex: number; amount: number; kind: 'to_verify' | 'needs_attention' | 'overdue' }

export type FinanceInbox = { toVerify: number; needsAttention: number; overdue: number; total: number; zero: boolean; items: InboxItem[] }

const CLOSED_ORDERS = new Set(['paid', 'refunded', 'cancelled', 'failed'])

/**
 * Real state only (G10): per unpaid instalment, the LAST gateway attempt decides — `started` = waiting for a
 * check, `failed` = needs attention (never silently closed). Instalments past due on partly paid orders are
 * overdue. Amounts are integer rials; show them with formatToman() and only to finance/admin.
 */
export function financeInbox(input: { orders: readonly InboxOrder[]; now: Date }): FinanceInbox {
  const today = dayOf(input.now)
  const items: InboxItem[] = []
  for (const o of input.orders) {
    if (CLOSED_ORDERS.has(o.status ?? '')) continue
    for (const inst of o.instalments) {
      if (inst.status === 'paid') continue
      const attempts = o.payments.filter((p) => p.instalmentIndex === inst.index)
      const last = attempts[attempts.length - 1]
      const base = { orderId: o.id, instalmentIndex: inst.index, amount: inst.amount }
      if (last?.status === 'started') items.push({ ...base, kind: 'to_verify' })
      else if (last?.status === 'failed') items.push({ ...base, kind: 'needs_attention' })
      else if (o.status === 'partially_paid' && dayOf(inst.dueDate) < today) items.push({ ...base, kind: 'overdue' })
    }
  }
  const n = (k: InboxItem['kind']) => items.filter((i) => i.kind === k).length
  const total = items.length
  return { toVerify: n('to_verify'), needsAttention: n('needs_attention'), overdue: n('overdue'), total, zero: total === 0, items }
}
