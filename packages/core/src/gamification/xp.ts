/**
 * XP rules (PRD §3.1, anti-abuse §5). The ledger (`learning-events`) is the source of truth; everything here is a
 * pure function of ledger rows. XP is paid only for server-confirmed outcomes; values are starting proposals
 * `[tune with IBA after 1 cohort]`.
 */
import { tehranDayNumber } from './calendar'

export const LEARNING_EVENT_TYPES = [
  // The student's own actions (count as a learning day; subject to the daily cap)
  'lesson.completed',
  'quiz.passed',
  'assignment.submitted',
  'live.attended',
  // Instructor's grade at/above the pass mark: not the student's day, not capped
  'assignment.passed',
  // Progress only, 0 XP: the manual «mark complete» button
  'lesson.marked',
  // Milestones (cap-exempt)
  'course.completed',
  'defense.passed',
  'weekly.goal',
  // Awards and corrections
  'badge.earned',
  'reversal',
] as const
export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number]

/** The student's own actions that make a "learning day" (PRD §3.3). A grade arriving later is not one. */
export const LEARNING_DAY_TYPES: ReadonlySet<LearningEventType> = new Set(['lesson.completed', 'quiz.passed', 'assignment.submitted', 'live.attended'])
/**
 * XP subject to the daily cap (anti binge-farming). Milestones, the weekly bonus and the instructor's grade bonus
 * are exempt so a finale or a grade is never "capped".
 */
export const CAPPED_TYPES: ReadonlySet<LearningEventType> = LEARNING_DAY_TYPES

export const XP = {
  lessonCompleted: 10,
  quizFirstPassBase: 20,
  quizFirstPassMaxBonus: 10,
  /** A retake that turns fail into pass, once. */
  quizRetakePass: 10,
  assignmentOnTime: 30,
  assignmentLate: 10,
  assignmentPassed: 20,
  liveAttended: 15,
  courseCompleted: 100,
  defensePassed: 150,
  weeklyGoal: 25,
} as const

export function quizPassXp(input: { attemptNo: number; score: number | null | undefined; maxScore: number | null | undefined }): number {
  if (input.attemptNo > 1) return XP.quizRetakePass
  const max = input.maxScore ?? 0
  const pct = max > 0 ? Math.max(0, Math.min(1, (input.score ?? 0) / max)) : 0
  return XP.quizFirstPassBase + Math.round(XP.quizFirstPassMaxBonus * pct)
}

export const assignmentSubmitXp = (late: boolean) => (late ? XP.assignmentLate : XP.assignmentOnTime)

/**
 * One award per source (anti-abuse §5). The key is unique per tenant in the database, so double taps, offline
 * retries and racing requests produce exactly one row. Re-awards after a reversal get a `#n` suffix.
 */
export const xpKey = {
  lesson: (enrollmentId: number | string, lessonId: number | string) => `lesson:${enrollmentId}:${lessonId}`,
  lessonMarked: (enrollmentId: number | string, lessonId: number | string) => `lesson-marked:${enrollmentId}:${lessonId}`,
  quiz: (enrollmentId: number | string, quizId: number | string) => `quiz:${enrollmentId}:${quizId}`,
  assignmentSubmitted: (enrollmentId: number | string, assignmentId: number | string) => `assignment:${enrollmentId}:${assignmentId}`,
  assignmentPassed: (enrollmentId: number | string, assignmentId: number | string, round = 0) =>
    `assignment-pass:${enrollmentId}:${assignmentId}${round > 0 ? `#${round}` : ''}`,
  course: (enrollmentId: number | string) => `course:${enrollmentId}`,
  defense: (enrollmentId: number | string) => `defense:${enrollmentId}`,
  week: (enrollmentId: number | string, weekKey: string) => `week:${enrollmentId}:${weekKey}`,
  badge: (enrollmentId: number | string, badge: string) => `badge:${enrollmentId}:${badge}`,
  reversal: (eventKey: string) => `reverse:${eventKey}`,
}

/** A ledger row as the rules see it. */
export type LedgerEvent = {
  id?: number | string
  type: LearningEventType
  xp: number
  occurredAt: Date | string
  sourceId?: string | null
  idempotencyKey?: string
  /** For `reversal`: the key of the event it cancels. */
  reverses?: string | null
  meta?: Record<string, unknown> | null
}

/** Keys of events cancelled by a reversal. */
export function reversedKeys(events: readonly LedgerEvent[]): Set<string> {
  return new Set(events.filter((e) => e.type === 'reversal' && e.reverses).map((e) => e.reverses!))
}

/** Events that still stand (not reversed, not reversals themselves). */
export function standingEvents(events: readonly LedgerEvent[]): LedgerEvent[] {
  const gone = reversedKeys(events)
  return events.filter((e) => e.type !== 'reversal' && !(e.idempotencyKey && gone.has(e.idempotencyKey)))
}

/**
 * Daily cap: activity XP earned today (Tehran day) never exceeds `cap`; the excess is dropped, not carried over.
 * Returns what to write on the ledger row (the requested amount is stored beside it).
 */
export function applyDailyCap(input: { type: LearningEventType; requested: number; earnedToday: number; cap: number }): { xp: number; capped: boolean } {
  const requested = Math.max(0, Math.floor(input.requested))
  if (!CAPPED_TYPES.has(input.type)) return { xp: requested, capped: false }
  const room = Math.max(0, input.cap - Math.max(0, input.earnedToday))
  const xp = Math.min(requested, room)
  return { xp, capped: xp < requested }
}

/** Capped XP already earned on the Tehran day of `at`. */
export function cappedXpOnDay(events: readonly LedgerEvent[], at: Date | string): number {
  const day = tehranDayNumber(at)
  return events.filter((e) => CAPPED_TYPES.has(e.type) && e.xp > 0 && tehranDayNumber(e.occurredAt) === day).reduce((s, e) => s + e.xp, 0)
}

export type XpSummary = {
  total: number
  /** Highest running total ever: levels never go down (PRD §3.2). */
  peak: number
  today: number
  todayCapped: boolean
}

export function summarizeXp(events: readonly LedgerEvent[], now: Date): XpSummary {
  const sorted = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
  let total = 0
  let peak = 0
  for (const e of sorted) {
    total += e.xp
    peak = Math.max(peak, total)
  }
  const day = tehranDayNumber(now)
  const todayEvents = sorted.filter((e) => tehranDayNumber(e.occurredAt) === day)
  return {
    total: Math.max(0, total),
    peak,
    today: todayEvents.filter((e) => e.xp > 0).reduce((s, e) => s + e.xp, 0),
    todayCapped: todayEvents.some((e) => e.meta?.capped === true),
  }
}

// ---------------------------------------------------------------- Levels

export type LevelDef = { level: number; name: string; minXp: number }

/**
 * Default levels (PRD §3.2). Thresholds `[derive from the real course size once E-026 content exists]`.
 * Level 6 «پیشگام» is tied to graduation (certificate), not XP: XP never unlocks it.
 */
export const LEVELS: readonly LevelDef[] = [
  { level: 1, name: 'آغازگر', minXp: 0 },
  { level: 2, name: 'پویا', minXp: 60 },
  { level: 3, name: 'کوشا', minXp: 180 },
  { level: 4, name: 'حرفه‌ای', minXp: 360 },
  { level: 5, name: 'برجسته', minXp: 600 },
  { level: 6, name: 'پیشگام', minXp: Number.POSITIVE_INFINITY },
]

export type LevelState = {
  level: number
  name: string
  /** Next level, or null at the top (or when only graduation is left). */
  next: { level: number; name: string; xpToGo: number | null; needsGraduation: boolean } | null
  /** 0–100 progress towards the next level. */
  pct: number
}

export function levelFor(peakXp: number, opts: { graduated: boolean }): LevelState {
  const xpLevels = LEVELS.filter((l) => Number.isFinite(l.minXp))
  const reached = [...xpLevels].reverse().find((l) => peakXp >= l.minXp) ?? xpLevels[0]!
  const top = LEVELS[LEVELS.length - 1]!
  if (opts.graduated) return { level: top.level, name: top.name, next: null, pct: 100 }
  const nextDef = LEVELS.find((l) => l.level === reached.level + 1)!
  if (!Number.isFinite(nextDef.minXp)) return { level: reached.level, name: reached.name, next: { level: nextDef.level, name: nextDef.name, xpToGo: null, needsGraduation: true }, pct: 100 }
  const span = nextDef.minXp - reached.minXp
  return {
    level: reached.level,
    name: reached.name,
    next: { level: nextDef.level, name: nextDef.name, xpToGo: Math.max(0, nextDef.minXp - peakXp), needsGraduation: false },
    pct: Math.max(0, Math.min(100, Math.round(((peakXp - reached.minXp) / span) * 100))),
  }
}

// ---------------------------------------------------------------- Video completion (player beacon)

export type WatchState = { seconds: number; lastAt: string | null }

/** Longest a single beat may claim; the client beats every ~15–30 s while playing. */
export const MAX_BEAT_SECONDS = 60

/**
 * Accumulates genuinely played time from player beacons. The server clock is the authority: a beat can claim at
 * most the wall-clock time since the previous beat (+5 s slack), so scrubbing to the end, a paused background tab
 * (no beats) or two tabs at once never add more than real elapsed time.
 */
export function accumulateWatch(prev: WatchState | null | undefined, beat: { playedSeconds: number; at: Date }): WatchState {
  const played = Math.max(0, Math.min(MAX_BEAT_SECONDS, Number.isFinite(beat.playedSeconds) ? beat.playedSeconds : 0))
  const last = prev?.lastAt ? new Date(prev.lastAt).getTime() : NaN
  const elapsed = Number.isFinite(last) ? Math.max(0, (beat.at.getTime() - last) / 1000 + 5) : MAX_BEAT_SECONDS
  return { seconds: Math.round(((prev?.seconds ?? 0) + Math.min(played, elapsed)) * 10) / 10, lastAt: beat.at.toISOString() }
}

/** Watched ≥ threshold of the lesson's duration. Unknown / zero duration never counts. */
export function watchedEnough(watchedSeconds: number, durationSeconds: number | null | undefined, thresholdPct: number): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  return watchedSeconds >= (durationSeconds * thresholdPct) / 100
}

/**
 * Duration to measure against: the staff-entered lesson length when set (trusted), else the player's reported
 * length clamped to 1 min – 6 h.
 */
export function lessonDurationSeconds(durationMinutes: number | null | undefined, reportedSeconds: number | null | undefined): number | null {
  if (durationMinutes && durationMinutes > 0) return durationMinutes * 60
  if (!reportedSeconds || !Number.isFinite(reportedSeconds)) return null
  return Math.max(60, Math.min(6 * 60 * 60, reportedSeconds))
}
