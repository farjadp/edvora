import { describe, expect, it } from 'vitest'
import {
  BADGES,
  GAMIFICATION_DEFAULTS,
  accumulateWatch,
  applyDailyCap,
  badgeCandidates,
  cappedXpOnDay,
  certificatePath,
  cohortLeaderboard,
  earnedBadges,
  gamificationFlags,
  initialsOf,
  lessonDurationSeconds,
  levelFor,
  normalizeGamification,
  quizPassXp,
  standingEvents,
  summarizeXp,
  tehranDayNumber,
  watchedEnough,
  weekOf,
  weeklyRhythm,
  xpKey,
  type LedgerEvent,
  type LeaderboardEntry,
} from './gamification'
import { certificateEligibility } from './progress'

// Tehran is UTC+3:30. Saturday 2026-11-07 00:00 Tehran = 2026-11-06T20:30Z.
const tehran = (date: string, time = '10:00') => {
  const [h, m] = time.split(':').map(Number)
  return new Date(Date.parse(`${date}T00:00:00Z`) + ((h! * 60 + m!) - 210) * 60_000)
}
const ev = (type: LedgerEvent['type'], at: Date, xp = 10, extra: Partial<LedgerEvent> = {}): LedgerEvent => ({ type, xp, occurredAt: at, ...extra })

describe('settings (G1)', () => {
  it('defaults: master on, leaderboard off, PRD numbers', () => {
    const s = normalizeGamification(null)
    expect(s).toEqual(GAMIFICATION_DEFAULTS)
    expect(s.enabled).toBe(true)
    expect(s.mechanics.leaderboard).toBe(false)
    expect(s.weeklyGoalDays).toBe(2)
    expect(s.dailyXpCap).toBe(150)
    expect(s.weekStart).toBe('saturday')
  })
  it('keeps valid values and falls back per field on invalid ones', () => {
    const s = normalizeGamification({ enabled: false, streak: false, weeklyGoalDays: 9, leaderboardSize: '7', weekStart: 'noday', breaks: [{ startsAt: 'x', endsAt: 'y' }, { label: 'نوروز', startsAt: '2026-03-20T20:30:00Z', endsAt: '2026-04-02T20:29:00Z' }] })
    expect(s.enabled).toBe(false)
    expect(s.mechanics.streak).toBe(false)
    expect(s.weeklyGoalDays).toBe(2)
    expect(s.leaderboardSize).toBe(7)
    expect(s.weekStart).toBe('saturday')
    expect(s.breaks).toHaveLength(1)
  })
  it('flags: master off hides every mechanic; audience splits students/staff; leaderboard needs xp', () => {
    expect(gamificationFlags({ enabled: false })).toMatchObject({ students: false, xp: false, streak: false, staffGoals: false })
    expect(gamificationFlags({ audience: 'staff' })).toMatchObject({ students: false, xp: false, staffGoals: true })
    expect(gamificationFlags({ audience: 'students' })).toMatchObject({ students: true, staffGoals: false, financeInbox: false })
    expect(gamificationFlags({ streak: false })).toMatchObject({ xp: true, streak: false, badges: true })
    expect(gamificationFlags({ leaderboard: true, xp: false }).leaderboard).toBe(false)
    expect(gamificationFlags({ leaderboard: true }).leaderboard).toBe(true)
  })
})

describe('XP (G2, anti-abuse)', () => {
  it('quiz: first pass 20 + score bonus; a retake that turns fail into pass is a flat 10', () => {
    expect(quizPassXp({ attemptNo: 1, score: 10, maxScore: 10 })).toBe(30)
    expect(quizPassXp({ attemptNo: 1, score: 7, maxScore: 10 })).toBe(27)
    expect(quizPassXp({ attemptNo: 2, score: 10, maxScore: 10 })).toBe(10)
  })
  it('one key per source', () => {
    expect(xpKey.lesson(5, 9)).toBe('lesson:5:9')
    expect(xpKey.quiz(5, 3)).toBe(xpKey.quiz(5, 3))
    expect(xpKey.assignmentPassed(5, 2, 1)).toBe('assignment-pass:5:2#1')
  })
  it('daily cap 150: excess dropped, milestones exempt', () => {
    expect(applyDailyCap({ type: 'lesson.completed', requested: 10, earnedToday: 145, cap: 150 })).toEqual({ xp: 5, capped: true })
    expect(applyDailyCap({ type: 'lesson.completed', requested: 10, earnedToday: 150, cap: 150 })).toEqual({ xp: 0, capped: true })
    expect(applyDailyCap({ type: 'course.completed', requested: 100, earnedToday: 150, cap: 150 })).toEqual({ xp: 100, capped: false })
    expect(applyDailyCap({ type: 'quiz.passed', requested: 30, earnedToday: 0, cap: 150 })).toEqual({ xp: 30, capped: false })
  })
  it('counts the cap per Tehran day (23:59 vs 00:01)', () => {
    const events = [ev('lesson.completed', tehran('2026-11-06', '23:59'), 140), ev('weekly.goal', tehran('2026-11-07', '00:30'), 25)]
    expect(cappedXpOnDay(events, tehran('2026-11-06', '12:00'))).toBe(140)
    expect(cappedXpOnDay(events, tehran('2026-11-07', '00:01'))).toBe(0)
  })
  it('reversals cancel an event; levels use the peak and never drop', () => {
    const events: LedgerEvent[] = [
      ev('assignment.passed', tehran('2026-11-01'), 200, { idempotencyKey: 'assignment-pass:1:1' }),
      ev('reversal', tehran('2026-11-02'), -200, { reverses: 'assignment-pass:1:1' }),
      ev('lesson.completed', tehran('2026-11-03'), 10, { idempotencyKey: 'lesson:1:1' }),
    ]
    expect(standingEvents(events).map((e) => e.type)).toEqual(['lesson.completed'])
    const s = summarizeXp(events, tehran('2026-11-03'))
    expect(s.total).toBe(10)
    expect(s.peak).toBe(200)
    expect(levelFor(s.peak, { graduated: false }).level).toBe(3)
  })
  it('levels: XP never reaches level 6; graduation does', () => {
    expect(levelFor(0, { graduated: false })).toMatchObject({ level: 1, name: 'آغازگر', next: { level: 2, xpToGo: 60 } })
    expect(levelFor(99_999, { graduated: false })).toMatchObject({ level: 5, next: { level: 6, needsGraduation: true, xpToGo: null } })
    expect(levelFor(0, { graduated: true })).toMatchObject({ level: 6, name: 'پیشگام', next: null })
  })
})

describe('player beacon', () => {
  const t0 = new Date('2026-11-06T10:00:00Z')
  it('counts real played time only; a beat cannot claim more than wall-clock time', () => {
    let s = accumulateWatch(null, { playedSeconds: 30, at: t0 })
    expect(s.seconds).toBe(30)
    s = accumulateWatch(s, { playedSeconds: 30, at: new Date(t0.getTime() + 30_000) })
    expect(s.seconds).toBe(60)
    // Scrub/fake: claims 60 s two seconds later → only ~7 s counts.
    s = accumulateWatch(s, { playedSeconds: 60, at: new Date(t0.getTime() + 32_000) })
    expect(s.seconds).toBe(67)
    expect(accumulateWatch(null, { playedSeconds: 10_000, at: t0 }).seconds).toBe(60)
  })
  it('≥ 90 % of a known duration; staff duration wins over the player', () => {
    expect(watchedEnough(540, 600, 90)).toBe(true)
    expect(watchedEnough(539, 600, 90)).toBe(false)
    expect(watchedEnough(999, null, 90)).toBe(false)
    expect(lessonDurationSeconds(20, 30)).toBe(1200)
    expect(lessonDurationSeconds(null, 5)).toBe(60)
    expect(lessonDurationSeconds(null, null)).toBeNull()
  })
})

describe('weekly rhythm (G3)', () => {
  const base = { weekStart: 'saturday' as const, goalDays: 2, freezeEveryWeeks: 4, freezeMax: 2 }
  const learn = (date: string, time?: string) => ev('lesson.completed', tehran(date, time))

  it('Saturday-start Jalali weeks; 23:59 Friday and 00:01 Saturday fall in different weeks (G3.7)', () => {
    expect(weekOf(tehran('2026-11-06', '23:59'), 'saturday').key).toBe('2026-10-31')
    expect(weekOf(tehran('2026-11-07', '00:01'), 'saturday').key).toBe('2026-11-07')
    expect(weekOf(tehran('2026-11-07', '00:01'), 'saturday').startsAt.toISOString()).toBe('2026-11-06T20:30:00.000Z')
    expect(weekOf(tehran('2026-11-07'), 'saturday').label).toBe('۱۶ آبان ۱۴۰۵')
  })

  it('a streak across a week boundary: two days each week → 2 weeks, then the running week', () => {
    const r = weeklyRhythm({
      ...base,
      startsAt: tehran('2026-10-24'),
      now: tehran('2026-11-09'),
      events: [learn('2026-10-25'), learn('2026-10-27'), learn('2026-11-01'), learn('2026-11-06', '23:59'), learn('2026-11-07', '00:01')],
    })
    expect(r.weeks.map((w) => [w.key, w.state, w.learningDays])).toEqual([
      ['2026-10-24', 'met', 2],
      ['2026-10-31', 'met', 2],
      ['2026-11-07', 'in_progress', 1],
    ])
    expect(r.current).toBe(2)
    expect(r.thisWeek.goal).toBe(2)
  })

  it('table: met / frozen / missed / neutral', () => {
    type Row = { name: string; days: string[][]; available?: number[]; expectStates: string[]; current: number; longest: number; freezes: number }
    const weeks = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26', '2026-10-03', '2026-10-10', '2026-10-17']
    const twoDays = (w: string) => [w, new Date(Date.parse(`${w}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10)]
    const rows: Row[] = [
      { name: 'goal met every week', days: weeks.map(twoDays), expectStates: ['met', 'met', 'met', 'met', 'met', 'met', 'met'], current: 7, longest: 7, freezes: 1 },
      {
        name: 'freeze earned after 4 weeks is spent on the 5th; then a miss resets (G3.2, G3.3)',
        days: [twoDays(weeks[0]!), twoDays(weeks[1]!), twoDays(weeks[2]!), twoDays(weeks[3]!), [], [], []],
        expectStates: ['met', 'met', 'met', 'met', 'frozen', 'missed', 'in_progress'],
        current: 0,
        longest: 4,
        freezes: 0,
      },
      {
        name: 'nothing released → neutral, streak kept (G3.4)',
        days: [twoDays(weeks[0]!), [], twoDays(weeks[2]!), [], [], [], []],
        available: [3, 0, 3, 0, 0, 0, 0],
        expectStates: ['met', 'neutral', 'met', 'neutral', 'neutral', 'neutral', 'neutral'],
        current: 2,
        longest: 2,
        freezes: 0,
      },
      {
        name: 'one item released → goal scales to 1 (G3.5)',
        days: [[weeks[0]!], [weeks[1]!], [], [], [], [], []],
        available: [1, 1, 2, 0, 0, 0, 0],
        expectStates: ['met', 'met', 'missed', 'neutral', 'neutral', 'neutral', 'neutral'],
        current: 0,
        longest: 2,
        freezes: 0,
      },
    ]
    for (const row of rows) {
      const r = weeklyRhythm({
        ...base,
        startsAt: tehran(weeks[0]!),
        now: tehran(weeks[6]!, '12:00'),
        events: row.days.flat().map((d) => learn(d)),
        availableInWeek: row.available ? (w) => row.available![weeks.indexOf(w.key)] ?? 0 : undefined,
      })
      expect(r.weeks.map((w) => w.state), row.name).toEqual(row.expectStates)
      expect([r.current, r.longest, r.freezes], row.name).toEqual([row.current, row.longest, row.freezes])
    }
  })

  it('Nowruz break (1–13 Farvardin 1405) is neutral: the streak survives two idle weeks (G3.6)', () => {
    const nowruz = [{ label: 'نوروز', startsAt: '2026-03-20T20:30:00Z', endsAt: '2026-04-02T20:29:00Z' }]
    const input = {
      ...base,
      startsAt: tehran('2026-03-07'),
      now: tehran('2026-04-12'),
      events: [learn('2026-03-07'), learn('2026-03-09'), learn('2026-03-14'), learn('2026-03-16'), learn('2026-04-04'), learn('2026-04-06')],
    }
    const withBreak = weeklyRhythm({ ...input, breaks: nowruz })
    expect(withBreak.weeks.map((w) => [w.key, w.state])).toEqual([
      ['2026-03-07', 'met'],
      ['2026-03-14', 'met'],
      ['2026-03-21', 'neutral'],
      ['2026-03-28', 'neutral'],
      ['2026-04-04', 'met'],
      ['2026-04-11', 'in_progress'],
    ])
    expect(withBreak.weeks[2]!.neutralReason).toBe('break')
    expect(withBreak.current).toBe(3)
    // Without the break the same idle weeks break the streak.
    const without = weeklyRhythm(input)
    expect(without.weeks.slice(2, 4).map((w) => w.state)).toEqual(['missed', 'missed'])
    expect(without.current).toBe(1)
  })

  it('freezes are capped at 2 (G3.8) and manual marks are not learning days', () => {
    const many = Array.from({ length: 14 }, (_, i) => new Date(Date.parse('2026-01-03T00:00:00Z') + i * 7 * 86_400_000).toISOString().slice(0, 10))
    const r = weeklyRhythm({ ...base, startsAt: tehran(many[0]!), now: tehran(many[13]!, '12:00'), events: many.slice(0, 13).flatMap((w) => [learn(w), ev('lesson.completed', new Date(tehran(w).getTime() + 86_400_000))]) })
    expect(r.freezes).toBe(2)
    const marked = weeklyRhythm({ ...base, startsAt: tehran('2026-11-07'), now: tehran('2026-11-12'), events: [ev('lesson.marked', tehran('2026-11-07'), 0), ev('lesson.marked', tehran('2026-11-08'), 0)] })
    expect(marked.thisWeek.learningDays).toBe(0)
  })
})

describe('badges and certificate path (G4, G5)', () => {
  const eligible = certificateEligibility({ progress: 100, defensePassed: true, requiresDefense: true, requirements: [] })
  const onlyDefense = certificateEligibility({ progress: 100, defensePassed: false, requiresDefense: true, requirements: [] })
  const half = certificateEligibility({ progress: 60, defensePassed: false, requiresDefense: true, requirements: [{ kind: 'assignment', id: '1', title: 't', state: 'pending' }] })

  it('awards on conditions; one per key; graduate needs a certificate, not XP', () => {
    const events = [ev('lesson.completed', tehran('2026-11-07')), ev('lesson.completed', tehran('2026-11-08')), ev('lesson.completed', tehran('2026-11-09'))]
    const b = badgeCandidates({ events, enrolledAt: tehran('2026-11-07'), longestStreak: 3, progress: 60, eligibility: half, requiresDefense: true, certificateIssued: false })
    expect(b).toEqual(['first-step', 'strong-start', 'weekly-rhythm', 'halfway'])
    const end = badgeCandidates({ events: [], enrolledAt: tehran('2026-11-07'), longestStreak: 0, progress: 100, eligibility: onlyDefense, requiresDefense: true, certificateIssued: false })
    expect(end).toEqual(['halfway', 'finish-line', 'ready-for-defense'])
    const grad = badgeCandidates({ events: [], enrolledAt: tehran('2026-11-07'), longestStreak: 0, progress: 100, eligibility: eligible, requiresDefense: true, certificateIssued: true })
    expect(grad).toContain('graduate')
  })
  it('«خط پایان» waits for the ungraded required assignment (G4.4)', () => {
    const pending = certificateEligibility({ progress: 100, defensePassed: false, requiresDefense: false, requirements: [{ kind: 'assignment', id: '1', title: 't', state: 'pending' }] })
    expect(badgeCandidates({ events: [], enrolledAt: tehran('2026-11-07'), longestStreak: 0, progress: 100, eligibility: pending, requiresDefense: false, certificateIssued: false })).not.toContain('finish-line')
  })
  it('earned badges come from the ledger once, dated', () => {
    const e = earnedBadges([
      ev('badge.earned', tehran('2026-11-08'), 0, { sourceId: 'first-step' }),
      ev('badge.earned', tehran('2026-11-09'), 0, { sourceId: 'first-step' }),
      ev('badge.earned', tehran('2026-11-09'), 0, { sourceId: 'unknown' }),
    ])
    expect(e.map((x) => x.key)).toEqual(['first-step'])
    expect(e[0]!.earnedAt).toBe(tehran('2026-11-08').toISOString())
  })
  it('catalogue never mentions the Ministry of Science', () => {
    expect(JSON.stringify(BADGES)).not.toMatch(/وزارت|Ministry/)
  })
  it('path: defense left (G5.1), no defense step for workshops (G5.6), sealed until issued', () => {
    const p = certificatePath({ lessonsDone: 5, lessonsTotal: 5, requirements: [], requiresDefense: true, defensePassed: false, eligibility: onlyDefense, certificateIssued: false })
    expect(p.steps.map((s) => [s.key, s.complete])).toEqual([
      ['lessons', true],
      ['defense', false],
      ['certificate', false],
    ])
    expect(p.sealed).toBe(true)
    expect(p.missing).toEqual(['defense'])
    expect(p.remainingText).toBe('دفاع نهایی باقی مانده است.')
    const e2 = certificateEligibility({ progress: 60, defensePassed: false, requiresDefense: true, requirements: [{ kind: 'assignment', id: '1', title: 't', state: 'pending' }] })
    const p2 = certificatePath({ lessonsDone: 3, lessonsTotal: 5, requirements: [{ kind: 'assignment', id: '1', title: 't', state: 'pending' }], requiresDefense: true, defensePassed: false, eligibility: e2, certificateIssued: false })
    expect(p2.remainingText).toBe('۲ جلسه، یک تکلیف و دفاع نهایی باقی مانده است.')
    const ws = certificatePath({ lessonsDone: 1, lessonsTotal: 2, requirements: [], requiresDefense: false, defensePassed: false, eligibility: certificateEligibility({ progress: 50, defensePassed: false, requiresDefense: false }), certificateIssued: false })
    expect(ws.steps.map((s) => s.key)).toEqual(['lessons', 'certificate'])
  })
})

describe('leaderboard (G7, core only)', () => {
  const entries: LeaderboardEntry[] = Array.from({ length: 12 }, (_, i) => ({ userId: i + 1, optedIn: i < 10, label: `ن${i + 1}`, weekXp: 100 - i * 5, totalXp: 500 - i }))
  entries[1]!.weekXp = 100 // tie with #1

  it('hidden when off, when the viewer has not opted in, or below the minimum', () => {
    expect(cohortLeaderboard({ enabled: false, entries, viewerId: 1, size: 5, minimum: 8 })).toMatchObject({ visible: false, reason: 'disabled' })
    expect(cohortLeaderboard({ enabled: true, entries, viewerId: 12, size: 5, minimum: 8 })).toMatchObject({ visible: false, reason: 'not_opted_in' })
    expect(cohortLeaderboard({ enabled: true, entries, viewerId: 1, size: 5, minimum: 11 })).toMatchObject({ visible: false, reason: 'not_enough', optedIn: 10 })
  })
  it('top N with shared ranks, own rank, no ids, no bottom list', () => {
    const lb = cohortLeaderboard({ enabled: true, entries, viewerId: 9, size: 5, minimum: 8 })
    if (!lb.visible) throw new Error('should be visible')
    expect(lb.top.map((r) => r.rank)).toEqual([1, 1, 3, 4, 5])
    expect(lb.viewer).toEqual({ rank: 9, of: 10 })
    expect(JSON.stringify(lb)).not.toMatch(/userId/)
  })
  it('initials only', () => {
    expect(initialsOf('علی رضایی')).toBe('ع. ر.')
    expect(initialsOf('')).toBe('—')
  })
})

describe('calendar', () => {
  it('Tehran day numbers follow Tehran midnight', () => {
    expect(tehranDayNumber('2026-11-06T20:29:00Z')).toBe(tehranDayNumber('2026-11-06T00:00:00Z'))
    expect(tehranDayNumber('2026-11-06T20:31:00Z')).toBe(tehranDayNumber('2026-11-06T00:00:00Z') + 1)
  })
})
