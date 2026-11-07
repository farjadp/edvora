/**
 * Content drip (phase-2 §R). Unlock moments are computed on every read from the rule and the student's
 * enrollment/cohort; nothing is stored. Day boundaries are 00:00 in Asia/Tehran via the tz database (Intl),
 * never a hand-coded offset.
 */

export type DripMode = 'none' | 'fixedDate' | 'afterEnrollment' | 'afterCohortStart' | 'afterPrevious'
export const DRIP_MODES: readonly DripMode[] = ['none', 'fixedDate', 'afterEnrollment', 'afterCohortStart', 'afterPrevious']

export type DripRule = { mode?: DripMode | null; days?: number | null; releaseAt?: string | Date | null }

export const DRIP_TIME_ZONE = 'Asia/Tehran'

type Ymd = { y: number; m: number; d: number }

const partsFormatter = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatter.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatter.set(tz, f)
  }
  return f
}

function wallClock(date: Date, tz: string): Ymd & { h: number; mi: number; s: number } {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]))
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), h: Number(parts.hour) % 24, mi: Number(parts.minute), s: Number(parts.second) }
}

/** Offset of `tz` from UTC at `date`, in ms (Tehran = +3:30 today; it had DST until 2022). */
function offsetMs(date: Date, tz: string): number {
  const w = wallClock(date, tz)
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** The UTC instant of 00:00 on calendar day `ymd` (+ `addDays`) in `tz`. */
function zonedMidnight({ y, m, d }: Ymd, addDays: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d + addDays)
  let t = guess - offsetMs(new Date(guess), tz)
  const second = guess - offsetMs(new Date(t), tz)
  if (second !== t) t = second
  return new Date(t)
}

/** Start of the Tehran calendar day that contains `date`, plus `days` days. */
export function startOfTehranDay(date: Date | string, days = 0, tz = DRIP_TIME_ZONE): Date {
  const w = wallClock(new Date(date), tz)
  return zonedMidnight(w, days, tz)
}

/** Validation for the lesson rule (R1). Persian messages keyed by field path. */
export function validateDripRule(rule: DripRule, ctx: { isFirstLesson: boolean }): { path: string; message: string }[] {
  const mode = rule.mode ?? 'none'
  const errors: { path: string; message: string }[] = []
  if (mode === 'fixedDate') {
    const t = rule.releaseAt ? new Date(rule.releaseAt).getTime() : NaN
    if (!Number.isFinite(t)) errors.push({ path: 'drip.releaseAt', message: 'تاریخ و ساعت انتشار را وارد کنید.' })
  }
  if (mode === 'afterEnrollment' || mode === 'afterCohortStart') {
    const n = rule.days
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) errors.push({ path: 'drip.days', message: 'تعداد روز باید عددی صحیح و صفر یا بیشتر باشد.' })
  }
  if (mode === 'afterPrevious' && ctx.isFirstLesson) {
    errors.push({ path: 'drip.mode', message: 'جلسهٔ اول دوره جلسهٔ قبلی ندارد؛ قانون دیگری انتخاب کنید.' })
  }
  return errors
}

export type DripLesson = { id: string | number; order: number; isFreePreview?: boolean | null; drip?: DripRule | null }

export type LessonLock =
  | { state: 'open'; unlockAt: Date | null }
  | { state: 'locked'; reason: 'date'; unlockAt: Date }
  | { state: 'locked'; reason: 'previous'; previousLessonId: string; unlockAt: null }

export type DripContext = {
  /** When the enrollment became active (backfilled from createdAt). */
  enrolledAt: Date | string | null
  /** Cohort start, or null for cohort-less (video-only) enrollments. */
  cohortStart?: Date | string | null
  /** Completed lessons (completion already includes a passed required quiz, Q8). */
  completed: Iterable<string | number>
  /** Lessons the student has already opened: never re-locked when dates move (R5). */
  opened?: Iterable<string | number>
  now: Date
}

/** The unlock moment of a date-based rule, or null when the rule is not date-based (none / afterPrevious). */
export function lessonUnlockAt(rule: DripRule | null | undefined, ctx: Pick<DripContext, 'enrolledAt' | 'cohortStart'>): Date | null {
  const mode = rule?.mode ?? 'none'
  const days = Math.max(0, Math.floor(rule?.days ?? 0))
  if (mode === 'fixedDate') return rule?.releaseAt ? new Date(rule.releaseAt) : null
  if (mode === 'afterCohortStart' && ctx.cohortStart) return startOfTehranDay(ctx.cohortStart, days)
  // No cohort → "N days after cohort start" falls back to "N days after enrollment" (R4).
  if (mode === 'afterCohortStart' || mode === 'afterEnrollment') {
    return ctx.enrolledAt ? startOfTehranDay(ctx.enrolledAt, days) : null
  }
  return null
}

/**
 * Lock state of every lesson of a course for one student. `lessons` may come in any order; "after previous"
 * uses the course order. Free-preview lessons ignore drip. A lesson already opened or completed stays open.
 */
export function lessonLocks(lessons: readonly DripLesson[], ctx: DripContext): Map<string, LessonLock> {
  const sorted = [...lessons].sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id)))
  const completed = new Set([...ctx.completed].map(String))
  const opened = new Set([...(ctx.opened ?? [])].map(String))
  const out = new Map<string, LessonLock>()
  sorted.forEach((lesson, i) => {
    const id = String(lesson.id)
    const mode = lesson.drip?.mode ?? 'none'
    if (lesson.isFreePreview || mode === 'none' || completed.has(id) || opened.has(id)) {
      out.set(id, { state: 'open', unlockAt: null })
      return
    }
    if (mode === 'afterPrevious') {
      const prev = sorted[i - 1]
      if (!prev || completed.has(String(prev.id))) out.set(id, { state: 'open', unlockAt: null })
      else out.set(id, { state: 'locked', reason: 'previous', previousLessonId: String(prev.id), unlockAt: null })
      return
    }
    const at = lessonUnlockAt(lesson.drip, ctx)
    // No date to count from (validation prevents this; legacy rows only): treat as no rule.
    if (!at) {
      out.set(id, { state: 'open', unlockAt: null })
      return
    }
    out.set(id, at.getTime() <= ctx.now.getTime() ? { state: 'open', unlockAt: at } : { state: 'locked', reason: 'date', unlockAt: at })
  })
  return out
}
