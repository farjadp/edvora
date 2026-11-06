import 'server-only'
/**
 * Read-only gamification queries for pages (E-028 T7). Every query is tenant-filtered explicitly; student queries
 * use the student session, staff queries take the session from `requireStaff()` and re-check desk + permission.
 * Each returns `null` when the mechanic is switched off for the academy: render nothing (no empty stubs, PRD §2).
 */
import {
  advisorDailyGoal,
  canOpenDesk,
  cohortLeaderboard,
  financeInbox,
  followUpStreak,
  initialsOf,
  levelFor,
  teamWeeklyGoal,
  weekOf,
  type DailyGoal,
  type FinanceInbox,
  type FollowUpEntry,
  type FollowUpStreak,
  type GoalLead,
  type Leaderboard,
  type LevelState,
  type TeamGoal,
} from '@edvora/core'
import type { Course, Lead, User } from '../payload-types'
import { canIn } from '../access/permissions'
import { gamificationFor, refreshEnrollmentGamification, type GamificationView } from './gamification'
import { docOf, idOf } from './ids'
import { getPayloadClient } from './payload'
import { getCurrentUser } from './session'
import type { requireStaff } from './staff'
import { studentCourse } from './student'
import { getCurrentTenant } from './tenant'

// ---------------------------------------------------------------- Student

/** Gamification for one of the signed-in student's courses. Null = not enrolled / not signed in / other academy. */
export async function getStudentCourseGamification(courseSlug: string): Promise<GamificationView | null> {
  const ctx = await studentCourse(courseSlug)
  if (!ctx) return null
  return refreshEnrollmentGamification({ payload: await getPayloadClient() }, ctx.state.enrollment.id, { wait: true })
}

export type DashboardGamification = {
  /** Student-facing gamification on at all (master × audience). False → show progress % and certificate only. */
  enabled: boolean
  enrollments: { course: { id: number; title: string; slug: string }; view: GamificationView }[]
  /** Academy-wide: XP summed over enrollments, one level (G2.9). Null when XP is off. */
  total: { xp: number; level: LevelState } | null
}

/** `/dashboard`: every live enrollment of the signed-in student in this academy. */
export async function getStudentDashboardGamification(): Promise<DashboardGamification | null> {
  const [tenant, user] = await Promise.all([getCurrentTenant(), getCurrentUser()])
  if (!user) return null
  const payload = await getPayloadClient()
  const flags = gamificationFor(tenant)
  const res = await payload.find({
    collection: 'enrollments',
    where: { and: [{ tenant: { equals: tenant.id } }, { user: { equals: user.id } }, { status: { not_equals: 'cancelled' } }] },
    depth: 1,
    limit: 50,
    overrideAccess: true,
  })
  const enrollments: DashboardGamification['enrollments'] = []
  for (const e of res.docs) {
    const course = docOf<Course>(e.course)
    if (!course || idOf(course.tenant) !== tenant.id) continue
    const view = await refreshEnrollmentGamification({ payload }, e.id, { wait: true })
    if (view) enrollments.push({ course: { id: course.id, title: course.title, slug: course.slug }, view })
  }
  const xp = enrollments.reduce((s, x) => s + (x.view.xp?.total ?? 0), 0)
  const peak = enrollments.reduce((s, x) => s + (x.view.xp?.peak ?? 0), 0)
  const graduated = enrollments.some((x) => x.view.path.steps.some((st) => st.key === 'certificate' && st.complete))
  return { enabled: flags.students, enrollments, total: flags.xp ? { xp, level: levelFor(peak, { graduated }) } : null }
}

/**
 * Cohort leaderboard for the signed-in student (G7, logic only; no UI yet). Pseudonyms/initials only, never ids,
 * names, emails or phones. Null when the academy has it off.
 */
export async function getCohortLeaderboard(courseSlug: string, metric: 'week' | 'total' = 'week'): Promise<Leaderboard | null> {
  const ctx = await studentCourse(courseSlug)
  if (!ctx) return null
  const flags = gamificationFor(ctx.tenant)
  if (!flags.leaderboard) return null
  const cohortId = idOf(ctx.state.enrollment.cohort)
  if (!cohortId) return { visible: false, reason: 'not_enough', optedIn: 0, minimum: flags.settings.leaderboardMinimum }
  const payload = await getPayloadClient()
  const tenantId = ctx.tenant.id
  const members = await payload.find({
    collection: 'enrollments',
    where: { and: [{ tenant: { equals: tenantId } }, { cohort: { equals: cohortId } }, { status: { not_equals: 'cancelled' } }] },
    depth: 1,
    limit: 1000,
    pagination: false,
    overrideAccess: true,
  })
  const week = weekOf(new Date(), flags.settings.weekStart)
  const weekRows = await payload.find({
    collection: 'learning-events',
    where: { and: [{ tenant: { equals: tenantId } }, { cohort: { equals: cohortId } }, { occurredAt: { greater_than_equal: week.startsAt.toISOString() } }] },
    depth: 0,
    limit: 20_000,
    pagination: false,
    overrideAccess: true,
  })
  const weekXp = new Map<number, number>()
  for (const r of weekRows.docs) weekXp.set(idOf(r.user)!, (weekXp.get(idOf(r.user)!) ?? 0) + (r.xp ?? 0))
  return cohortLeaderboard({
    enabled: true,
    viewerId: ctx.user.id,
    size: flags.settings.leaderboardSize,
    minimum: flags.settings.leaderboardMinimum,
    metric,
    entries: members.docs.map((e) => {
      const uid = idOf(e.user)!
      const nickname = e.gamification?.nickname?.trim()
      return { userId: uid, optedIn: Boolean(e.gamification?.leaderboardOptIn), label: nickname || initialsOf(docOf<User>(e.user)?.name), weekXp: weekXp.get(uid) ?? 0, totalXp: e.gamification?.xp ?? 0 }
    }),
  })
}

// ---------------------------------------------------------------- Staff

type StaffCtx = Awaited<ReturnType<typeof requireStaff>>

const toGoalLead = (l: Lead): GoalLead => ({
  id: l.id,
  advisorId: idOf(l.advisor),
  nextFollowUpAt: l.nextFollowUpAt ?? null,
  followUps: (l.followUps ?? []).map((f): FollowUpEntry => ({ at: f.at, outcome: f.outcome, by: idOf(f.by), dueAt: f.dueAt ?? null })),
})

const LOOKBACK_DAYS = 120

async function leadsFor(s: StaffCtx, extra: { advisor?: number } = {}): Promise<GoalLead[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const res = await s.req.payload.find({
    collection: 'leads',
    where: {
      and: [
        { tenant: { equals: s.tenant.id } },
        ...(extra.advisor ? [{ advisor: { equals: extra.advisor } }] : []),
        { or: [{ nextFollowUpAt: { exists: true } }, { updatedAt: { greater_than_equal: since } }] },
      ],
    },
    depth: 0,
    limit: 5000,
    pagination: false,
    overrideAccess: true,
  })
  return res.docs.map(toGoalLead)
}

export type AdvisorGoals = { daily: DailyGoal; streak: Pick<FollowUpStreak, 'current' | 'todayComplete'> }

/** The signed-in advisor's own daily goal and follow-up streak (G8). Null when off or without the leads desk. */
export async function getAdvisorGoals(s: StaffCtx, now = new Date()): Promise<AdvisorGoals | null> {
  const flags = gamificationFor(s.tenant)
  if (!flags.staffGoals || !canOpenDesk(s, 'leads')) return null
  const leads = await leadsFor(s, { advisor: s.user.id })
  const daily = advisorDailyGoal({ leads, advisorId: s.user.id, now })
  const streak = followUpStreak({ leads, advisorId: s.user.id, now, weekendDays: flags.settings.weekendDays, breaks: flags.settings.breaks, lookbackDays: LOOKBACK_DAYS })
  return { daily, streak: { current: streak.current, todayComplete: streak.todayComplete } }
}

/** The academy's one shared weekly ring (G9). Never per person. Null when off or without the leads desk. */
export async function getTeamGoal(s: StaffCtx, now = new Date()): Promise<TeamGoal | null> {
  const flags = gamificationFor(s.tenant)
  if (!flags.staffGoals || !canOpenDesk(s, 'leads')) return null
  return teamWeeklyGoal({ leads: await leadsFor(s), now, weekStart: flags.settings.weekStart, target: flags.settings.teamWeeklyGoal })
}

/** Finance inbox zero (G10). Amounts are integer rials (formatToman in the UI). Finance desk + orders.view only. */
export async function getFinanceInbox(s: StaffCtx, now = new Date()): Promise<FinanceInbox | null> {
  const flags = gamificationFor(s.tenant)
  if (!flags.financeInbox || !canOpenDesk(s, 'finance')) return null
  if (!(await canIn(s.req, s.tenant.id, 'orders.view'))) return null
  const res = await s.req.payload.find({
    collection: 'orders',
    where: { and: [{ tenant: { equals: s.tenant.id } }, { status: { in: ['pending', 'partially_paid'] } }] },
    depth: 0,
    limit: 5000,
    pagination: false,
    overrideAccess: true,
  })
  return financeInbox({
    now,
    orders: res.docs.map((o) => ({
      id: o.id,
      status: o.status,
      instalments: (o.instalments ?? []).map((i) => ({ index: i.index, amount: i.amount, dueDate: i.dueDate, status: i.status })),
      payments: (o.payments ?? []).map((p) => ({ instalmentIndex: p.instalmentIndex, status: p.status })),
    })),
  })
}
