import 'server-only'
/**
 * Advisor desk data (E-028 U5): the signed-in advisor's own leads, tenant-filtered, with the due state per row.
 * The daily counter always comes from the core rule (`advisorDailyGoal`: only a RECORDED outcome moves it); the ring,
 * streak and team line are gated by the staff-goals switch (`getAdvisorGoals`, `getTeamGoal` return null when off).
 */
import { advisorDailyGoal, tehranDayNumber, type DailyGoal, type FollowUpEntry, type GoalLead, type LeadOutcome, type TeamGoal } from '@edvora/core'
import { getAdvisorGoals, getTeamGoal, type AdvisorGoals } from './gamificationQueries'
import { docOf, idOf } from './ids'
import type { requireStaff } from './staff'
import type { Course, Lead } from '../payload-types'

type StaffCtx = Awaited<ReturnType<typeof requireStaff>>

export type DeskFilter = 'today' | 'overdue' | 'all'
export const isDeskFilter = (v: unknown): v is DeskFilter => v === 'today' || v === 'overdue' || v === 'all'

export type AdvisorRow = {
  id: number
  name: string
  phone: string
  courseTitle: string | null
  nextFollowUpAt: string | null
  /** overdue = a day before today · today · later · none. */
  due: 'overdue' | 'today' | 'later' | 'none'
  /** Handled today with a recorded outcome by this advisor: shown as done, no chips. */
  doneOutcome: LeadOutcome | null
}

export type AdvisorDesk = {
  rows: AdvisorRow[]
  counts: { today: number; overdue: number; all: number }
  daily: DailyGoal
  goals: AdvisorGoals | null
  team: TeamGoal | null
  /** First row still due (overdue first, then by time): the primary action. */
  next: AdvisorRow | null
}

const CLOSED = new Set(['enrolled', 'lost'])
const OUTCOMES: readonly string[] = ['reached', 'no_answer', 'callback', 'wrong_number', 'not_interested']

const toGoalLead = (l: Lead): GoalLead => ({
  id: l.id,
  advisorId: idOf(l.advisor),
  nextFollowUpAt: l.nextFollowUpAt ?? null,
  followUps: (l.followUps ?? []).map((f): FollowUpEntry => ({ at: f.at, outcome: f.outcome, by: idOf(f.by), dueAt: f.dueAt ?? null })),
})

export async function getAdvisorDesk(s: StaffCtx, filter: DeskFilter, now = new Date()): Promise<AdvisorDesk> {
  const res = await s.req.payload.find({
    collection: 'leads',
    where: { and: [{ tenant: { equals: s.tenant.id } }, { advisor: { equals: s.user.id } }] },
    depth: 1,
    limit: 500,
    pagination: false,
    sort: 'nextFollowUpAt',
    overrideAccess: true,
  })
  const today = tehranDayNumber(now)
  const rows: AdvisorRow[] = []
  for (const l of res.docs) {
    const doneToday = (l.followUps ?? []).find(
      (f) => OUTCOMES.includes(f.outcome) && idOf(f.by) === s.user.id && tehranDayNumber(f.at) === today && f.dueAt != null && tehranDayNumber(f.dueAt) <= today,
    )
    const open = !CLOSED.has(l.status)
    if (!open && !doneToday) continue
    const day = l.nextFollowUpAt ? tehranDayNumber(l.nextFollowUpAt) : null
    const due: AdvisorRow['due'] = day === null ? 'none' : day < today ? 'overdue' : day === today ? 'today' : 'later'
    rows.push({
      id: l.id,
      name: l.name,
      phone: l.phone,
      courseTitle: docOf<Course>(l.course)?.title ?? null,
      nextFollowUpAt: l.nextFollowUpAt ?? null,
      due,
      doneOutcome: doneToday ? (doneToday.outcome as LeadOutcome) : null,
    })
  }
  const byDue = (a: AdvisorRow, b: AdvisorRow) => (a.nextFollowUpAt ?? '9') .localeCompare(b.nextFollowUpAt ?? '9')
  const dueRows = rows.filter((r) => r.due === 'overdue' || r.due === 'today' || r.doneOutcome)
  const overdueRows = rows.filter((r) => r.due === 'overdue' && !r.doneOutcome)
  const counts = { today: dueRows.length, overdue: overdueRows.length, all: rows.length }
  const shown = (filter === 'all' ? rows : filter === 'overdue' ? overdueRows : dueRows).sort(byDue)
  const next = dueRows.filter((r) => !r.doneOutcome).sort(byDue)[0] ?? null
  const [goals, team] = await Promise.all([getAdvisorGoals(s, now).catch(() => null), getTeamGoal(s, now).catch(() => null)])
  return { rows: shown, counts, daily: advisorDailyGoal({ leads: res.docs.map(toGoalLead), advisorId: s.user.id, now }), goals, team, next }
}
