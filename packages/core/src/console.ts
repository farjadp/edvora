/**
 * Operator console numbers (E-035): period math for KPI deltas, sparklines and the week-on-week bars. Pure and
 * client-safe. The web app loads the rows (tenant-filtered, as the signed-in user) and passes them in.
 *
 * Days are **Tehran calendar days** (`tehranDayNumber`), not rolling 24-hour windows and not UTC days: the academy
 * works on Tehran time, «امروز» in the bar chart must be the operator's today, and the E-028 finance inbox and
 * staff goals already count overdue/streak days the same way. Storage stays UTC; only the bucketing is Tehran.
 *
 *  - current period  = the last `PERIOD_DAYS` Tehran days, today included
 *  - previous period = the `PERIOD_DAYS` days before that
 *  - spark           = the last `SPARK_DAYS` days, oldest first
 *  - week / weekBefore = the last 7 days / the 7 before, oldest first
 */
import { tehranDayNumber } from './gamification/calendar'

export const PERIOD_DAYS = 30
export const SPARK_DAYS = 14
export const WEEK_DAYS = 7

/** One dated fact: a created record (weight 1) or money received (weight = rials). */
export type DatedValue = { at: Date | string; weight?: number }

export type Trend = {
  current: number
  previous: number
  spark: number[]
  week: number[]
  weekBefore: number[]
}

/** Bucket dated values into Tehran days and sum the windows. Values in the future or older than two periods are ignored. */
export function trendOf(values: readonly DatedValue[], now: Date): Trend {
  const today = tehranDayNumber(now)
  const days = new Array<number>(2 * PERIOD_DAYS).fill(0)
  for (const v of values) {
    const ago = today - tehranDayNumber(v.at)
    if (ago >= 0 && ago < days.length) days[ago]! += v.weight ?? 1
  }
  const sum = (a: number[]) => a.reduce((n, x) => n + x, 0)
  const oldestFirst = (from: number, to: number) => days.slice(from, to).reverse()
  return {
    current: sum(days.slice(0, PERIOD_DAYS)),
    previous: sum(days.slice(PERIOD_DAYS)),
    spark: oldestFirst(0, SPARK_DAYS),
    week: oldestFirst(0, WEEK_DAYS),
    weekBefore: oldestFirst(WEEK_DAYS, 2 * WEEK_DAYS),
  }
}

/** The first instant of the oldest Tehran day a trend looks at (query lower bound, a few hours early is harmless). */
export function trendSince(now: Date): Date {
  // 2 periods + 1 day of slack so the Tehran/UTC offset never cuts off the oldest bucket.
  return new Date(now.getTime() - (2 * PERIOD_DAYS + 1) * 86_400_000)
}

export type PeriodDelta =
  /** Nothing in either period. */
  | { kind: 'empty' }
  /** Something now, nothing before: no baseline, so no percentage (never divide by zero or invent one). */
  | { kind: 'no-baseline' }
  | { kind: 'same' }
  | { kind: 'change'; pct: number; trend: 'up' | 'down'; good: boolean }

/** This period against the previous one, rounded to whole percent. `goodWhen` decides the colour, not the arrow. */
export function periodDelta(current: number, previous: number, goodWhen: 'up' | 'down' = 'up'): PeriodDelta {
  if (previous === 0) return current === 0 ? { kind: 'empty' } : { kind: 'no-baseline' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { kind: 'same' }
  const trend = pct > 0 ? 'up' : 'down'
  return { kind: 'change', pct: Math.abs(pct), trend, good: trend === goodWhen }
}

/** Instalment row as stored on an order (amount in integer rials). */
export type ConsoleInstalment = { amount: number; status?: string | null; paidAt?: Date | string | null }

/**
 * Money actually received: every PAID instalment, dated by its `paidAt`, weighted by its amount (integer rials).
 * Fully paid and partly paid orders both count; an order's `total` or `createdAt` never does (an order placed two
 * months ago and settled yesterday is yesterday's money). Instalments marked paid without a date are skipped.
 */
export function settledPayments(orders: readonly { instalments?: readonly ConsoleInstalment[] | null }[]): DatedValue[] {
  const out: DatedValue[] = []
  for (const o of orders) {
    for (const i of o.instalments ?? []) {
      if (i.status !== 'paid' || !i.paidAt || !Number.isSafeInteger(i.amount) || i.amount < 0) continue
      out.push({ at: i.paidAt, weight: i.amount })
    }
  }
  return out
}

/** Integer share in percent (0–100); 0 when there is no whole. */
export function sharePct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)))
}
