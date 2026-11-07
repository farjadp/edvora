/**
 * Weekly rhythm (PRD §3.3, G3). A learning day = at least one learning action on a Tehran day. A streak week = the
 * learning-day goal met in a (Jalali) week. Missed weeks spend a banked freeze automatically; a week is neutral
 * (neither grows nor breaks) when nothing released was left to do, or a break (Nowruz, cohort break) touches it.
 * Pure: the caller passes ledger rows and a release calendar.
 */
import { breakDays, overlapsBreak, tehranDayNumber, weekSpan, weekStartDay, type WeekSpan } from './calendar'
import type { GamificationBreak, WeekDay } from './settings'
import { LEARNING_DAY_TYPES, standingEvents, type LedgerEvent } from './xp'

export type WeekState = 'met' | 'missed' | 'frozen' | 'neutral' | 'in_progress'

export type RhythmWeek = WeekSpan & {
  /** Distinct learning days (Tehran) in the week. */
  learningDays: number
  /** Goal after drip scaling (0 when neutral). */
  goal: number
  state: WeekState
  /** Why a week is neutral. */
  neutralReason?: 'nothing_released' | 'break'
}

export type WeeklyRhythm = {
  /** Consecutive streak weeks, including this week once its goal is met. */
  current: number
  longest: number
  freezes: number
  /** A freeze was spent on the last finished week (tell the student calmly, PRD G3.2). */
  freezeJustUsed: boolean
  /** The streak was reset at the last finished week (calm copy, no red). */
  justReset: boolean
  thisWeek: RhythmWeek
  /** Oldest first, ending with this week. */
  weeks: RhythmWeek[]
}

export type RhythmInput = {
  events: readonly LedgerEvent[]
  /** First week counted (enrollment start). */
  startsAt: Date | string
  now: Date
  weekStart: WeekDay
  goalDays: number
  freezeEveryWeeks: number
  freezeMax: number
  breaks?: readonly GamificationBreak[]
  /**
   * Released-and-unfinished items the student had during the week (drip, E-026). 0 → neutral week; fewer than the
   * goal → the goal scales down to that number (min 1). Omit when there is no release calendar (always available).
   */
  availableInWeek?: (week: WeekSpan) => number
}

/** Distinct learning days per week start day. */
function learningDaysByWeek(events: readonly LedgerEvent[], weekStart: WeekDay): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>()
  for (const e of standingEvents(events)) {
    if (!LEARNING_DAY_TYPES.has(e.type)) continue
    const day = tehranDayNumber(e.occurredAt)
    const ws = weekStartDay(day, weekStart)
    let set = out.get(ws)
    if (!set) out.set(ws, (set = new Set()))
    set.add(day)
  }
  return out
}

export function weeklyRhythm(input: RhythmInput): WeeklyRhythm {
  const goalDays = Math.max(1, Math.floor(input.goalDays))
  const freezeEvery = Math.max(1, Math.floor(input.freezeEveryWeeks))
  const freezeMax = Math.max(0, Math.floor(input.freezeMax))
  const breaks = breakDays(input.breaks ?? [])
  const byWeek = learningDaysByWeek(input.events, input.weekStart)
  const nowWeek = weekStartDay(tehranDayNumber(input.now), input.weekStart)
  const firstWeek = Math.min(weekStartDay(tehranDayNumber(input.startsAt), input.weekStart), nowWeek)

  let current = 0
  let longest = 0
  let freezes = 0
  let towardsFreeze = 0
  let freezeJustUsed = false
  let justReset = false
  const weeks: RhythmWeek[] = []

  for (let ws = firstWeek; ws <= nowWeek; ws += 7) {
    const span = weekSpan(ws)
    const learningDays = byWeek.get(ws)?.size ?? 0
    const isNow = ws === nowWeek
    const available = input.availableInWeek ? Math.max(0, Math.floor(input.availableInWeek(span))) : goalDays
    const onBreak = overlapsBreak(span.startDay, span.endDay, breaks)
    const goal = onBreak || available === 0 ? 0 : Math.max(1, Math.min(goalDays, available))
    const met = goal > 0 && learningDays >= goal

    let state: WeekState
    let neutralReason: RhythmWeek['neutralReason']
    if (met) {
      state = 'met'
    } else if (isNow) {
      // The running week never breaks anything; it only counts once met.
      state = goal === 0 ? 'neutral' : 'in_progress'
      if (goal === 0) neutralReason = onBreak ? 'break' : 'nothing_released'
    } else if (goal === 0) {
      state = 'neutral'
      neutralReason = onBreak ? 'break' : 'nothing_released'
    } else if (freezes > 0) {
      state = 'frozen'
    } else {
      state = 'missed'
    }

    if (!isNow) {
      freezeJustUsed = state === 'frozen'
      justReset = state === 'missed' && current > 0
    }
    if (state === 'met') {
      current += 1
      towardsFreeze += 1
      if (towardsFreeze >= freezeEvery) {
        towardsFreeze = 0
        freezes = Math.min(freezeMax, freezes + 1)
      }
    } else if (state === 'frozen') {
      freezes -= 1
    } else if (state === 'missed') {
      current = 0
      towardsFreeze = 0
    }
    longest = Math.max(longest, current)
    weeks.push({ ...span, learningDays, goal, state, ...(neutralReason ? { neutralReason } : {}) })
  }

  return { current, longest, freezes, freezeJustUsed, justReset, thisWeek: weeks[weeks.length - 1]!, weeks }
}

/** Weeks whose goal was met, for the weekly-goal bonus (one ledger row per met week). */
export const metWeeks = (r: WeeklyRhythm): RhythmWeek[] => r.weeks.filter((w) => w.state === 'met')
