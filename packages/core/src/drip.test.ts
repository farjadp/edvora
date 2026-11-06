import { describe, expect, it } from 'vitest'
import { lessonLocks, lessonUnlockAt, startOfTehranDay, validateDripRule, type DripLesson } from './drip'
import { formatJalali } from './jalali'

describe('Tehran day boundary (R7)', () => {
  it('starts the day at 00:00 Asia/Tehran, not UTC or server time', () => {
    // 2026-11-06 21:00Z = 00:30 on 7 Nov in Tehran → that day starts 2026-11-06 20:30Z.
    expect(startOfTehranDay('2026-11-06T21:00:00Z').toISOString()).toBe('2026-11-06T20:30:00.000Z')
    // 2026-11-06 20:00Z = 23:30 on 6 Nov in Tehran → 2026-11-05 20:30Z.
    expect(startOfTehranDay('2026-11-06T20:00:00Z').toISOString()).toBe('2026-11-05T20:30:00.000Z')
    expect(startOfTehranDay('2026-11-06T20:00:00Z', 3).toISOString()).toBe('2026-11-08T20:30:00.000Z')
  })
  it('crosses the Jalali year end (Esfand → Farvardin) and shows the matching Jalali date', () => {
    const at = startOfTehranDay('2027-03-19T12:00:00Z', 2)
    expect(at.toISOString()).toBe('2027-03-20T20:30:00.000Z')
    expect(formatJalali(at)).toBe('۱ فروردین ۱۴۰۶')
  })
  it('uses the tz database for historic DST (Tehran was +4:30 in summer 2021)', () => {
    expect(startOfTehranDay('2021-07-01T12:00:00Z').toISOString()).toBe('2021-06-30T19:30:00.000Z')
  })
})

describe('lessonUnlockAt', () => {
  const ctx = { enrolledAt: '2026-11-06T08:00:00Z', cohortStart: '2026-11-20T13:30:00Z' }
  it('handles each rule', () => {
    expect(lessonUnlockAt({ mode: 'none' }, ctx)).toBeNull()
    expect(lessonUnlockAt({ mode: 'fixedDate', releaseAt: '2026-12-01T06:30:00Z' }, ctx)?.toISOString()).toBe('2026-12-01T06:30:00.000Z')
    expect(lessonUnlockAt({ mode: 'afterEnrollment', days: 0 }, ctx)?.toISOString()).toBe('2026-11-05T20:30:00.000Z')
    expect(lessonUnlockAt({ mode: 'afterEnrollment', days: 7 }, ctx)?.toISOString()).toBe('2026-11-12T20:30:00.000Z')
    expect(lessonUnlockAt({ mode: 'afterCohortStart', days: 0 }, ctx)?.toISOString()).toBe('2026-11-19T20:30:00.000Z')
    expect(lessonUnlockAt({ mode: 'afterPrevious' }, ctx)).toBeNull()
  })
  it('falls back to the enrollment date without a cohort (R4)', () => {
    expect(lessonUnlockAt({ mode: 'afterCohortStart', days: 2 }, { enrolledAt: ctx.enrolledAt, cohortStart: null })?.toISOString()).toBe('2026-11-07T20:30:00.000Z')
  })
})

describe('lessonLocks', () => {
  const lessons: DripLesson[] = [
    { id: 1, order: 1, isFreePreview: true, drip: { mode: 'fixedDate', releaseAt: '2030-01-01T00:00:00Z' } },
    { id: 2, order: 2 },
    { id: 3, order: 3, drip: { mode: 'afterPrevious' } },
    { id: 4, order: 4, drip: { mode: 'afterEnrollment', days: 14 } },
    { id: 5, order: 5, drip: { mode: 'afterEnrollment', days: 0 } },
    { id: 6, order: 6, drip: { mode: 'afterCohortStart', days: 1 } },
  ]
  const base = { enrolledAt: '2026-11-06T08:00:00Z', cohortStart: '2026-11-20T13:30:00Z', completed: [], now: new Date('2026-11-06T09:00:00Z') }

  it('computes open and locked lessons on read', () => {
    const m = lessonLocks(lessons, base)
    expect(m.get('1')?.state).toBe('open') // free preview ignores drip
    expect(m.get('2')?.state).toBe('open')
    expect(m.get('3')).toEqual({ state: 'locked', reason: 'previous', previousLessonId: '2', unlockAt: null })
    expect(m.get('4')).toMatchObject({ state: 'locked', reason: 'date' })
    expect(m.get('4')?.unlockAt?.toISOString()).toBe('2026-11-19T20:30:00.000Z')
    expect(m.get('5')?.state).toBe('open')
    expect(m.get('6')).toMatchObject({ state: 'locked', reason: 'date' })
  })
  it('opens "after previous" once the previous lesson is completed', () => {
    expect(lessonLocks(lessons, { ...base, completed: [2] }).get('3')?.state).toBe('open')
  })
  it('opens date rules when the time passes, without a new login', () => {
    const later = lessonLocks(lessons, { ...base, now: new Date('2026-11-19T20:30:00Z') })
    expect(later.get('4')?.state).toBe('open')
    expect(lessonLocks(lessons, { ...base, now: new Date('2026-11-19T20:29:59Z') }).get('4')?.state).toBe('locked')
  })
  it('never re-locks a lesson already opened or completed (R5)', () => {
    const moved = { ...base, cohortStart: '2027-01-01T00:00:00Z', now: new Date('2026-11-25T00:00:00Z') }
    expect(lessonLocks(lessons, moved).get('6')?.state).toBe('locked')
    expect(lessonLocks(lessons, { ...moved, opened: [6] }).get('6')?.state).toBe('open')
    expect(lessonLocks(lessons, { ...moved, completed: ['6'] }).get('6')?.state).toBe('open')
  })
  it('sorts by order regardless of input order', () => {
    const m = lessonLocks([...lessons].reverse(), { ...base, completed: [2] })
    expect(m.get('3')?.state).toBe('open')
  })
})

describe('validateDripRule (R1)', () => {
  it('validates mode values', () => {
    expect(validateDripRule({ mode: 'afterEnrollment', days: 3 }, { isFirstLesson: false })).toEqual([])
    expect(validateDripRule({ mode: 'afterEnrollment', days: -1 }, { isFirstLesson: false })[0]?.path).toBe('drip.days')
    expect(validateDripRule({ mode: 'afterCohortStart', days: 1.5 }, { isFirstLesson: false })[0]?.path).toBe('drip.days')
    expect(validateDripRule({ mode: 'fixedDate' }, { isFirstLesson: false })[0]?.path).toBe('drip.releaseAt')
    expect(validateDripRule({ mode: 'afterPrevious' }, { isFirstLesson: true })[0]?.path).toBe('drip.mode')
    expect(validateDripRule({ mode: 'none' }, { isFirstLesson: true })).toEqual([])
  })
})
