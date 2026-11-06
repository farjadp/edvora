/**
 * Gamification on the server (E-028 T2–T5). The `learning-events` ledger is the source of truth; totals cached on
 * `enrollments.gamification` are rebuilt from it by `refreshEnrollmentGamification`. Rules live in
 * @edvora/core/gamification; this file loads data, writes ledger rows and adapts results.
 *
 * Safety rules:
 * - Ledger rows are written only here, after the caller checked tenant + user + enrollment (overrideAccess).
 * - Nothing here joins the caller's transaction, so an expected duplicate key (idempotency) can never abort a grade
 *   or a quiz submit. Collection hooks run inside the caller's transaction, so they DEFER the work until after it
 *   (`deferGamification`): writing the enrollment from a second connection while the first one still holds its
 *   row lock would deadlock.
 * - Gamification never breaks the main flow: entry points used from hooks/actions catch and log (`safely`).
 * No `server-only`: collection hooks and scripts use it too.
 */
import {
  CAPPED_TYPES,
  XP,
  applyDailyCap,
  assignmentSubmitXp,
  badgeCandidates,
  certificatePath,
  courseFinished,
  dayStartsAt,
  earnedBadges,
  gamificationFlags,
  accumulateWatch,
  lessonDurationSeconds,
  levelFor,
  metWeeks,
  quizPassXp,
  standingEvents,
  summarizeXp,
  tehranDayNumber,
  watchedEnough,
  weeklyRhythm,
  xpKey,
  type BadgeKey,
  type CertificatePath,
  type GamificationBreak,
  type GamificationFlags,
  type LearningEventType,
  type LedgerEvent,
  type LevelState,
  type RhythmWeek,
  type WatchState,
  type WeeklyRhythm,
  type XpSummary,
} from '@edvora/core/gamification'
import type { CollectionAfterChangeHook, Payload } from 'payload'
import type { Assignment, Cohort, Course, Enrollment, LearningEvent, Lesson, Quiz, QuizAttempt, Submission, Tenant } from '../payload-types'
import { idOf } from './ids'
import { blockersFor, loadCourseState, type CourseState } from './learning'

/** Set on writes made by this module so collection hooks don't loop. */
export const GAMIFICATION_CONTEXT = 'edvoraGamification'

/** Never carries `req`: gamification writes use their own transactions (see the header). */
type Ctx = { payload: Payload }

/** The one way to read a tenant's settings (T1). Missing values resolve to the PRD defaults. */
export function gamificationFor(tenant: Pick<Tenant, 'gamification'> | null | undefined): GamificationFlags {
  return gamificationFlags(tenant?.gamification ?? null)
}

export async function safely<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[gamification] ${label}`, err)
    return null
  }
}

const pending = new Set<Promise<unknown>>()

/**
 * Runs `fn` after the current operation (and its transaction) has finished, on its own connection. Used by
 * collection hooks. Errors are logged, never thrown. A job that starts before the caller committed simply waits
 * for the row lock and then sees the committed data.
 */
export function deferGamification(label: string, fn: () => Promise<unknown>): void {
  const job: Promise<unknown> = new Promise<void>((resolve) => setTimeout(resolve, 0))
    .then(() => safely(label, fn))
    .finally(() => pending.delete(job))
  pending.add(job)
}

/** Waits for deferred work (scripts, tests) — e.g. before `process.exit`. */
export async function flushGamification(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending])
}

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string }; message?: string } | null
  return e?.code === '23505' || e?.cause?.code === '23505' || /duplicate key|unique/i.test(e?.message ?? '')
}

const toLedger = (e: LearningEvent): LedgerEvent => ({
  id: e.id,
  type: e.type as LearningEventType,
  xp: e.xp ?? 0,
  occurredAt: e.occurredAt,
  sourceId: e.sourceId ?? null,
  idempotencyKey: e.idempotencyKey,
  reverses: e.reverses ?? null,
  meta: e.meta && typeof e.meta === 'object' && !Array.isArray(e.meta) ? (e.meta as Record<string, unknown>) : null,
})

// ---------------------------------------------------------------- Ledger writes

export type RecordInput = {
  tenantId: number
  userId: number
  enrollmentId: number | null
  courseId?: number | null
  cohortId?: number | null
  type: LearningEventType
  sourceId?: string | null
  /** XP asked for; the daily cap may lower it (stored beside it). */
  xp: number
  idempotencyKey: string
  occurredAt?: Date
  reverses?: string | null
  meta?: Record<string, unknown>
  actorId?: number | null
  note?: string | null
}

export type RecordResult = { created: boolean; xp: number; capped: boolean; event: LearningEvent | null }

async function findByKey(payload: Payload, tenantId: number, key: string): Promise<LearningEvent | null> {
  const res = await payload.find({
    collection: 'learning-events',
    where: { and: [{ tenant: { equals: tenantId } }, { idempotencyKey: { equals: key } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs[0] ?? null
}

/** Capped XP the user already earned on the Tehran day of `at`, across the academy. */
async function earnedOnDay(payload: Payload, tenantId: number, userId: number, at: Date): Promise<number> {
  const day = tehranDayNumber(at)
  const res = await payload.find({
    collection: 'learning-events',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { user: { equals: userId } },
        { type: { in: [...CAPPED_TYPES] } },
        { occurredAt: { greater_than_equal: dayStartsAt(day).toISOString() } },
        { occurredAt: { less_than: dayStartsAt(day + 1).toISOString() } },
      ],
    },
    depth: 0,
    limit: 500,
    pagination: false,
    overrideAccess: true,
  })
  return res.docs.reduce((s, e) => s + Math.max(0, e.xp ?? 0), 0)
}

/**
 * Appends one ledger row, exactly once per idempotency key (pre-check + unique index for races). Applies the
 * daily cap. The CALLER must already have checked that the user belongs to the tenant and owns the enrollment.
 */
export async function recordLearningEvent({ payload }: Ctx, input: RecordInput): Promise<RecordResult> {
  const existing = await findByKey(payload, input.tenantId, input.idempotencyKey)
  if (existing) return { created: false, xp: existing.xp ?? 0, capped: false, event: existing }
  const at = input.occurredAt ?? new Date()
  const { xp, capped } =
    input.type === 'reversal'
      ? { xp: Math.min(0, Math.floor(input.xp)), capped: false }
      : applyDailyCap({ type: input.type, requested: input.xp, earnedToday: await earnedOnDay(payload, input.tenantId, input.userId, at), cap: await dailyCap(payload, input.tenantId) })
  try {
    const event = await payload.create({
      collection: 'learning-events',
      overrideAccess: true,
      context: { [GAMIFICATION_CONTEXT]: true },
      data: {
        tenant: input.tenantId,
        user: input.userId,
        enrollment: input.enrollmentId,
        course: input.courseId ?? null,
        cohort: input.cohortId ?? null,
        type: input.type,
        sourceId: input.sourceId ?? null,
        xp,
        requestedXp: Math.floor(input.xp),
        occurredAt: at.toISOString(),
        idempotencyKey: input.idempotencyKey,
        reverses: input.reverses ?? null,
        meta: { ...(input.meta ?? {}), ...(capped ? { capped: true } : {}) },
        actor: input.actorId ?? null,
        note: input.note ?? null,
      },
    })
    return { created: true, xp, capped, event }
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const again = await findByKey(payload, input.tenantId, input.idempotencyKey)
    return { created: false, xp: again?.xp ?? 0, capped: false, event: again }
  }
}

const capCache = new Map<number, { cap: number; at: number }>()
async function dailyCap(payload: Payload, tenantId: number): Promise<number> {
  const hit = capCache.get(tenantId)
  if (hit && Date.now() - hit.at < 60_000) return hit.cap
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true })
  const cap = gamificationFor(tenant).settings.dailyXpCap
  capCache.set(tenantId, { cap, at: Date.now() })
  return cap
}

/** A correction is a new negative row; the original is never edited (PRD §5 audit). */
export async function reverseLearningEvent(ctx: Ctx, event: LearningEvent, opts: { actorId?: number | null; note?: string | null } = {}): Promise<RecordResult> {
  return recordLearningEvent(ctx, {
    tenantId: idOf(event.tenant)!,
    userId: idOf(event.user)!,
    enrollmentId: idOf(event.enrollment),
    courseId: idOf(event.course),
    cohortId: idOf(event.cohort),
    type: 'reversal',
    sourceId: event.sourceId ?? null,
    xp: -(event.xp ?? 0),
    idempotencyKey: xpKey.reversal(event.idempotencyKey),
    reverses: event.idempotencyKey,
    actorId: opts.actorId ?? null,
    note: opts.note ?? null,
    meta: { reversedType: event.type },
  })
}

export async function ledgerFor({ payload }: Ctx, tenantId: number, enrollmentId: number): Promise<LearningEvent[]> {
  const res = await payload.find({
    collection: 'learning-events',
    where: { and: [{ tenant: { equals: tenantId } }, { enrollment: { equals: enrollmentId } }] },
    sort: 'occurredAt',
    depth: 0,
    limit: 10_000,
    pagination: false,
    overrideAccess: true,
  })
  return res.docs
}

const enrollmentRefs = (e: Enrollment) => ({ tenantId: idOf(e.tenant)!, userId: idOf(e.user)!, enrollmentId: e.id, courseId: idOf(e.course), cohortId: idOf(e.cohort) })

// ---------------------------------------------------------------- Summary (what the UI reads)

export type GamificationView = {
  enrollmentId: number
  /** Effective switches (master × audience × mechanic). Hidden mechanics are null below. */
  flags: Omit<GamificationFlags, 'settings'>
  /** `courseProgress` %, always shown (also when gamification is off). */
  progress: number
  xp: XpSummary | null
  level: LevelState | null
  rhythm: (Omit<WeeklyRhythm, 'weeks' | 'thisWeek'> & { thisWeek: WeekView; weeks: WeekView[] }) | null
  badges: { key: BadgeKey; name: string; description: string; earnedAt: string }[] | null
  /** Always shown: XP never unlocks it. */
  path: CertificatePath
  rings: { course: number; week: { days: number; goal: number; pct: number } | null }
  computedAt: string
}

export type WeekView = Omit<RhythmWeek, 'startsAt' | 'endsAt'> & { startsAt: string; endsAt: string }
const weekView = (w: RhythmWeek): WeekView => ({ ...w, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString() })

/**
 * Released-and-unfinished items a student had in a week (drip-aware streaks, G3.4/G3.5). Lessons use their drip
 * unlock moment; quizzes/assignments follow their lesson. Done times come from the ledger.
 */
function availabilityFrom(state: CourseState, events: readonly LedgerEvent[], enrolledAt: Date) {
  const doneAt = new Map<string, number>()
  for (const e of events) {
    const t = new Date(e.occurredAt).getTime()
    const key =
      e.type === 'lesson.completed' || e.type === 'lesson.marked' ? `lesson:${e.sourceId}` : e.type === 'quiz.passed' ? `quiz:${e.sourceId}` : e.type === 'assignment.submitted' ? `assignment:${e.sourceId}` : null
    if (key && !doneAt.has(key)) doneAt.set(key, t)
  }
  const lessonUnlock = (lessonId: number | null): number | null => {
    if (lessonId === null) return enrolledAt.getTime()
    const lock = state.locks.get(String(lessonId))
    if (!lock) return enrolledAt.getTime()
    if (lock.state === 'locked' && lock.reason === 'previous') return null
    return Math.max(enrolledAt.getTime(), lock.unlockAt ? lock.unlockAt.getTime() : enrolledAt.getTime())
  }
  type Item = { unlock: number | null; done: number | null; completedUntracked: boolean }
  const items: Item[] = [
    ...state.lessons.map((l): Item => ({ unlock: lessonUnlock(l.id), done: doneAt.get(`lesson:${l.id}`) ?? null, completedUntracked: state.completed.has(l.id) && !doneAt.has(`lesson:${l.id}`) })),
    ...state.quizzes.map((q): Item => ({ unlock: lessonUnlock(idOf(q.quiz.lesson)), done: doneAt.get(`quiz:${q.quiz.id}`) ?? null, completedUntracked: q.passed && !doneAt.has(`quiz:${q.quiz.id}`) })),
    ...state.assignments.map((a): Item => ({
      unlock: lessonUnlock(idOf(a.assignment.lesson)),
      done: doneAt.get(`assignment:${a.assignment.id}`) ?? null,
      completedUntracked: Boolean(a.submission?.submittedAt) && !doneAt.has(`assignment:${a.assignment.id}`),
    })),
  ]
  return (week: { startsAt: Date; endsAt: Date }) =>
    items.filter((i) => !i.completedUntracked && i.unlock !== null && i.unlock < week.endsAt.getTime() && (i.done === null || i.done >= week.startsAt.getTime())).length
}

const inFlight = new Map<number, Promise<GamificationView | null>>()

/**
 * Writes missing milestones / badges / weekly bonuses for one enrollment, then rebuilds and caches the summary.
 * Idempotent. While a refresh of the same enrollment is running, a nested call (from inside it, e.g. a quiz attempt
 * closed on the way) returns null at once; `wait: true` (page reads) waits for it and returns its result instead.
 */
export async function refreshEnrollmentGamification(ctx: Ctx, enrollmentId: number, opts: { now?: Date; wait?: boolean } = {}): Promise<GamificationView | null> {
  const running = inFlight.get(enrollmentId)
  if (running) return opts.wait ? running : null
  const job = refresh(ctx, enrollmentId, opts.now ?? new Date()).finally(() => inFlight.delete(enrollmentId))
  inFlight.set(enrollmentId, job)
  return job
}

async function refresh(ctx: Ctx, enrollmentId: number, now: Date): Promise<GamificationView | null> {
  const { payload } = ctx
  const enrollment = await payload.findByID({ collection: 'enrollments', id: enrollmentId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!enrollment) return null
  const refs = enrollmentRefs(enrollment)
  const [tenant, course] = await Promise.all([
    payload.findByID({ collection: 'tenants', id: refs.tenantId, depth: 0, overrideAccess: true }),
    payload.findByID({ collection: 'courses', id: refs.courseId!, depth: 0, overrideAccess: true }) as Promise<Course>,
  ])
  const flags = gamificationFor(tenant)
  // Course state first: it may close expired quiz attempts, which records their events before we read the ledger.
  const state = await loadCourseState({ payload }, { tenantId: refs.tenantId, course, enrollment, now })
  const cert = await payload.find({
    collection: 'certificates',
    where: { and: [{ tenant: { equals: refs.tenantId } }, { user: { equals: refs.userId } }, { course: { equals: course.id } }, { status: { equals: 'valid' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const certificateIssued = cert.docs.length > 0
  let rows = await ledgerFor(ctx, refs.tenantId, enrollment.id)
  const enrolledAt = new Date(enrollment.enrolledAt ?? enrollment.createdAt)

  const add = async (input: Omit<RecordInput, 'tenantId' | 'userId' | 'enrollmentId' | 'courseId' | 'cohortId'>) => {
    if (rows.some((r) => r.idempotencyKey === input.idempotencyKey)) return
    const r = await recordLearningEvent(ctx, { ...refs, occurredAt: now, ...input })
    if (r.event && !rows.some((x) => x.id === r.event!.id)) rows = [...rows, r.event]
  }

  if (flags.students) {
    // Milestones (cap-exempt). Course complete = lessons + required quizzes + assignments; never by XP.
    if (state.progress >= 100 && courseFinished(state.eligibility)) await add({ type: 'course.completed', xp: XP.courseCompleted, idempotencyKey: xpKey.course(enrollment.id), sourceId: String(course.id) })
    if (enrollment.defensePassed) await add({ type: 'defense.passed', xp: XP.defensePassed, idempotencyKey: xpKey.defense(enrollment.id), sourceId: String(course.id) })
  }

  const settings = flags.settings
  const cohort = state.cohort as (Cohort & { breaks?: GamificationBreak[] | null }) | null
  const breaks: GamificationBreak[] = [...settings.breaks, ...(cohort?.breaks ?? []).map((b) => ({ label: b.label ?? null, startsAt: b.startsAt, endsAt: b.endsAt }))]
  const rhythmOf = () =>
    weeklyRhythm({
      events: rows.map(toLedger),
      startsAt: enrolledAt,
      now,
      weekStart: settings.weekStart,
      goalDays: settings.weeklyGoalDays,
      freezeEveryWeeks: settings.freezeEveryWeeks,
      freezeMax: settings.freezeMax,
      breaks,
      availableInWeek: availabilityFrom(state, rows.map(toLedger), enrolledAt),
    })
  let rhythm: WeeklyRhythm | null = null
  if (flags.streak) {
    rhythm = rhythmOf()
    for (const w of metWeeks(rhythm)) {
      const at = w.endsAt.getTime() <= now.getTime() ? new Date(w.endsAt.getTime() - 60_000) : now
      await add({ type: 'weekly.goal', xp: XP.weeklyGoal, idempotencyKey: xpKey.week(enrollment.id, w.key), sourceId: w.key, occurredAt: at })
    }
  }

  if (flags.badges) {
    const candidates = badgeCandidates({
      events: rows.map(toLedger),
      enrolledAt,
      // Streak badges only while streaks are on (G3.9: nothing computed when off).
      longestStreak: rhythm?.longest ?? 0,
      progress: state.progress,
      eligibility: state.eligibility,
      requiresDefense: Boolean(course.requiresDefense),
      certificateIssued,
    })
    for (const key of candidates) await add({ type: 'badge.earned', xp: 0, idempotencyKey: xpKey.badge(enrollment.id, key), sourceId: key })
  }

  const ledger = rows.map(toLedger)
  const xp = summarizeXp(ledger, now)
  const level = levelFor(xp.peak, { graduated: certificateIssued })
  const view: GamificationView = {
    enrollmentId: enrollment.id,
    flags: { students: flags.students, staff: flags.staff, xp: flags.xp, levels: flags.levels, streak: flags.streak, badges: flags.badges, leaderboard: flags.leaderboard, celebrations: flags.celebrations, staffGoals: flags.staffGoals, financeInbox: flags.financeInbox },
    progress: state.progress,
    xp: flags.xp ? xp : null,
    level: flags.levels ? level : null,
    rhythm: rhythm ? { ...rhythm, thisWeek: weekView(rhythm.thisWeek), weeks: rhythm.weeks.slice(-12).map(weekView) } : null,
    badges: flags.badges ? earnedBadges(ledger) : null,
    path: certificatePath({
      lessonsDone: state.lessons.filter((l) => state.completed.has(l.id)).length,
      lessonsTotal: state.lessons.length,
      requirements: state.requirements,
      requiresDefense: Boolean(course.requiresDefense),
      defensePassed: Boolean(enrollment.defensePassed),
      eligibility: state.eligibility,
      certificateIssued,
    }),
    rings: {
      course: state.progress,
      week: rhythm ? { days: rhythm.thisWeek.learningDays, goal: rhythm.thisWeek.goal, pct: rhythm.thisWeek.goal > 0 ? Math.min(100, Math.round((rhythm.thisWeek.learningDays / rhythm.thisWeek.goal) * 100)) : 0 } : null,
    },
    computedAt: now.toISOString(),
  }

  // Cache (always computed from the full ledger, also while switches are off, so turning them on restores it).
  const cache = { xp: xp.total, level: level.level, streakWeeks: rhythm?.current ?? 0 }
  const prev = enrollment.gamification
  const prevSummary = JSON.stringify(prev?.summary ?? null)
  const nextSummary = JSON.stringify({ ...view, computedAt: undefined })
  if (prev?.xp !== cache.xp || prev?.level !== cache.level || prev?.streakWeeks !== cache.streakWeeks || prevSummary !== nextSummary) {
    await payload.update({
      collection: 'enrollments',
      id: enrollment.id,
      overrideAccess: true,
      context: { [GAMIFICATION_CONTEXT]: true },
      data: { gamification: { ...cache, summary: JSON.parse(nextSummary) as Record<string, unknown>, computedAt: now.toISOString() } },
    })
  }
  return view
}

// ---------------------------------------------------------------- Triggers (T3)

/** Lesson XP needs a server-confirmed completion: watched ≥ threshold, or its required quiz/assignment done. */
function lessonConfirmed(state: CourseState, lesson: Lesson, watch: Record<string, WatchState & { duration?: number }>, thresholdPct: number): boolean {
  const w = watch[String(lesson.id)]
  if (w && watchedEnough(w.seconds, lessonDurationSeconds(lesson.durationMinutes, w.duration ?? null), thresholdPct)) return true
  const reqs = state.requirements.filter((r) => r.lessonId === String(lesson.id))
  return reqs.length > 0 && reqs.every((r) => r.state === 'done')
}

const watchMap = (e: Enrollment): Record<string, WatchState & { duration?: number }> =>
  e.lessonWatch && typeof e.lessonWatch === 'object' && !Array.isArray(e.lessonWatch) ? (e.lessonWatch as Record<string, WatchState & { duration?: number }>) : {}

async function awardLesson(ctx: Ctx, enrollment: Enrollment, lesson: Lesson, now?: Date): Promise<RecordResult> {
  return recordLearningEvent(ctx, { ...enrollmentRefs(enrollment), type: 'lesson.completed', xp: XP.lessonCompleted, idempotencyKey: xpKey.lesson(enrollment.id, lesson.id), sourceId: String(lesson.id), occurredAt: now })
}

export type WatchResult = { watchedPct: number; completed: boolean; xp: number; capped: boolean }

/**
 * Player beacon (T3). The caller checked tenant, student and enrollment and that the lesson is open (drip).
 * Accumulates server-capped played time; at ≥ threshold the lesson is completed (if no required quiz/assignment
 * blocks it) and its XP is paid once.
 */
export async function onLessonWatched(
  ctx: Ctx,
  input: { tenant: Tenant; enrollment: Enrollment; lesson: Lesson; state: CourseState; playedSeconds: number; durationSeconds: number | null; now?: Date },
): Promise<WatchResult> {
  const now = input.now ?? new Date()
  const { payload } = ctx
  const settings = gamificationFor(input.tenant).settings
  const map = watchMap(input.enrollment)
  const key = String(input.lesson.id)
  const prev = map[key]
  const next = { ...accumulateWatch(prev, { playedSeconds: input.playedSeconds, at: now }), ...(input.durationSeconds ? { duration: input.durationSeconds } : prev?.duration ? { duration: prev.duration } : {}) }
  const duration = lessonDurationSeconds(input.lesson.durationMinutes, next.duration ?? null)
  const watchedPct = duration ? Math.min(100, Math.round((next.seconds / duration) * 100)) : 0
  const enough = watchedEnough(next.seconds, duration, settings.completionThresholdPct)

  const data: Partial<Enrollment> = { lessonWatch: { ...map, [key]: next } }
  if (enough && !input.state.completed.has(input.lesson.id) && blockersFor(input.state, input.lesson.id).length === 0) {
    data.completedLessons = [...input.state.completed, input.lesson.id]
  }
  await payload.update({ collection: 'enrollments', id: input.enrollment.id, overrideAccess: true, context: { [GAMIFICATION_CONTEXT]: true }, data })
  if (!enough) return { watchedPct, completed: input.state.completed.has(input.lesson.id), xp: 0, capped: false }
  const r = await awardLesson(ctx, input.enrollment, input.lesson, now)
  await safely('refresh after watch', () => refreshEnrollmentGamification(ctx, input.enrollment.id, { now }))
  return { watchedPct, completed: Boolean(data.completedLessons) || input.state.completed.has(input.lesson.id), xp: r.created ? r.xp : 0, capped: r.created && r.capped }
}

/** Manual «mark complete»: progress only (0-XP row for history); XP only if the completion is confirmed. */
export async function onLessonMarked(ctx: Ctx, input: { tenant: Tenant; enrollment: Enrollment; lesson: Lesson; state: CourseState; now?: Date }): Promise<void> {
  const refs = enrollmentRefs(input.enrollment)
  const now = input.now ?? new Date()
  await recordLearningEvent(ctx, { ...refs, type: 'lesson.marked', xp: 0, idempotencyKey: xpKey.lessonMarked(input.enrollment.id, input.lesson.id), sourceId: String(input.lesson.id), occurredAt: now })
  const settings = gamificationFor(input.tenant).settings
  if (lessonConfirmed(input.state, input.lesson, watchMap(input.enrollment), settings.completionThresholdPct)) await awardLesson(ctx, input.enrollment, input.lesson, now)
  await refreshEnrollmentGamification(ctx, input.enrollment.id, { now })
}

/** E-026 quiz outcome: a pass pays once per quiz (first try 20 + score bonus; a fail→pass retake 10). Fail pays 0. */
export async function onQuizFinalized(ctx: Ctx, attempt: QuizAttempt, quiz: Quiz): Promise<void> {
  if (!attempt.passed) return
  const enrollmentId = idOf(attempt.enrollment)
  if (!enrollmentId) return
  const enrollment = await ctx.payload.findByID({ collection: 'enrollments', id: enrollmentId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!enrollment || idOf(enrollment.tenant) !== idOf(attempt.tenant) || idOf(enrollment.user) !== idOf(attempt.user)) return
  const max = attempt.maxScore ?? 0
  await recordLearningEvent(ctx, {
    ...enrollmentRefs(enrollment),
    type: 'quiz.passed',
    xp: quizPassXp({ attemptNo: attempt.attemptNo, score: attempt.score, maxScore: attempt.maxScore }),
    idempotencyKey: xpKey.quiz(enrollment.id, quiz.id),
    sourceId: String(quiz.id),
    occurredAt: attempt.submittedAt ? new Date(attempt.submittedAt) : undefined,
    meta: { attemptNo: attempt.attemptNo, scorePct: max > 0 ? Math.round(((attempt.score ?? 0) / max) * 100) : null },
  })
  // A lesson whose required quiz is now passed, and that the student already completed, earns its XP.
  if (quiz.lesson && (enrollment.completedLessons ?? []).some((l) => idOf(l) === idOf(quiz.lesson))) {
    const lesson = await ctx.payload.findByID({ collection: 'lessons', id: idOf(quiz.lesson)!, depth: 0, overrideAccess: true, disableErrors: true })
    if (lesson) await awardLesson(ctx, enrollment, lesson, attempt.submittedAt ? new Date(attempt.submittedAt) : undefined)
  }
  await refreshEnrollmentGamification(ctx, enrollment.id)
}

async function enrollmentForSubmission(payload: Payload, s: Submission): Promise<Enrollment | null> {
  const id = idOf(s.enrollment)
  if (id) return payload.findByID({ collection: 'enrollments', id, depth: 0, overrideAccess: true, disableErrors: true })
  const res = await payload.find({
    collection: 'enrollments',
    where: { and: [{ tenant: { equals: idOf(s.tenant) } }, { user: { equals: idOf(s.user) } }, { course: { equals: idOf(s.course) } }, { status: { not_equals: 'cancelled' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return res.docs[0] ?? null
}

/**
 * E-026 assignment outcome (Submissions afterChange): on-time submit 30 / late 10 (once); graded at/above the pass
 * mark +20 (once). A grade overturned below the pass mark writes a reversal (G2.6); passing again re-awards.
 */
export async function onSubmissionChanged(ctx: Ctx, doc: Submission, actorId: number | null): Promise<void> {
  const { payload } = ctx
  const enrollment = await enrollmentForSubmission(payload, doc)
  if (!enrollment || idOf(enrollment.tenant) !== idOf(doc.tenant) || idOf(enrollment.user) !== idOf(doc.user)) return
  const refs = enrollmentRefs(enrollment)
  const assignmentId = idOf(doc.assignment)!
  if (doc.submittedAt) {
    await recordLearningEvent(ctx, {
      ...refs,
      type: 'assignment.submitted',
      xp: assignmentSubmitXp(Boolean(doc.late)),
      idempotencyKey: xpKey.assignmentSubmitted(enrollment.id, assignmentId),
      sourceId: String(assignmentId),
      occurredAt: new Date(doc.submittedAt),
      meta: { late: Boolean(doc.late) },
    })
  }
  const assignment = (await payload.findByID({ collection: 'assignments', id: assignmentId, depth: 0, overrideAccess: true })) as Assignment
  const passed = doc.score != null && doc.submittedAt != null && (assignment.passScore == null || doc.score >= assignment.passScore)
  const rows = (await ledgerFor(ctx, refs.tenantId, enrollment.id)).filter((r) => r.sourceId === String(assignmentId))
  const standing = standingEvents(rows.map(toLedger)).find((e) => e.type === 'assignment.passed')
  if (passed && !standing) {
    const round = rows.filter((r) => r.type === 'reversal' && r.meta && (r.meta as { reversedType?: string }).reversedType === 'assignment.passed').length
    await recordLearningEvent(ctx, { ...refs, type: 'assignment.passed', xp: XP.assignmentPassed, idempotencyKey: xpKey.assignmentPassed(enrollment.id, assignmentId, round), sourceId: String(assignmentId), actorId, meta: { score: doc.score } })
  } else if (!passed && standing) {
    const original = rows.find((r) => r.idempotencyKey === standing.idempotencyKey)
    if (original) await reverseLearningEvent(ctx, original, { actorId, note: 'Grade changed below the pass mark' })
  }
  await refreshEnrollmentGamification(ctx, enrollment.id)
}

// ---------------------------------------------------------------- Collection hooks

/** Enrollments afterChange: defense passed / progress changed by staff → milestones and cache (deferred). */
export const refreshAfterEnrollmentChange: CollectionAfterChangeHook = ({ doc, previousDoc, operation, req }) => {
  // Staff edits only (defense score, manual progress fixes). Server code refreshes on its own.
  if (req.context[GAMIFICATION_CONTEXT] === true || operation !== 'update' || !req.user) return doc
  const changed = (k: 'defensePassed' | 'completedLessons' | 'status') => JSON.stringify((doc as Enrollment)[k] ?? null) !== JSON.stringify((previousDoc as Enrollment | undefined)?.[k] ?? null)
  if (changed('defensePassed') || changed('completedLessons') || changed('status')) {
    const id = (doc as Enrollment).id
    deferGamification('enrollment change', () => refreshEnrollmentGamification({ payload: req.payload }, id))
  }
  return doc
}

/** Submissions afterChange (student submit, staff grade) → assignment XP / reversal (deferred). */
export const awardAfterSubmissionChange: CollectionAfterChangeHook = ({ doc, req }) => {
  if (req.context[GAMIFICATION_CONTEXT] === true) return doc
  const snapshot = { ...(doc as Submission) }
  const actorId = req.user?.id ?? null
  deferGamification('submission change', () => onSubmissionChanged({ payload: req.payload }, snapshot, actorId))
  return doc
}

/** Certificates afterChange: issuing one earns «فارغ‌التحصیل» and level پیشگام (deferred). */
export const refreshAfterCertificateChange: CollectionAfterChangeHook = ({ doc, req }) => {
  const userId = idOf((doc as { user?: unknown }).user)
  const courseId = idOf((doc as { course?: unknown }).course)
  const tenantId = idOf((doc as { tenant?: unknown }).tenant)
  if (!userId || !courseId || !tenantId) return doc
  const payload = req.payload
  deferGamification('certificate change', async () => {
    const res = await payload.find({
      collection: 'enrollments',
      where: { and: [{ tenant: { equals: tenantId } }, { user: { equals: userId } }, { course: { equals: courseId } }] },
      depth: 0,
      limit: 10,
      overrideAccess: true,
    })
    for (const e of res.docs) await refreshEnrollmentGamification({ payload }, e.id)
  })
  return doc
}
