import { describe, expect, it } from 'vitest'
import { PERIOD_DAYS, periodDelta, settledPayments, sharePct, trendOf, trendSince } from './console'

// 2026-11-06 12:00 Tehran (UTC+3:30) = 08:30 UTC.
const NOW = new Date('2026-11-06T08:30:00Z')
const DAY = 86_400_000
const daysAgo = (n: number, h = 0) => new Date(NOW.getTime() - n * DAY + h * 3_600_000)

describe('trendOf: Tehran-day buckets', () => {
  it('splits the last 30 Tehran days from the 30 before', () => {
    const t = trendOf([{ at: daysAgo(0) }, { at: daysAgo(29) }, { at: daysAgo(30) }, { at: daysAgo(59) }, { at: daysAgo(60) }], NOW)
    expect(t.current).toBe(2)
    expect(t.previous).toBe(2)
  })

  it('buckets by the Tehran calendar day, not UTC and not a rolling 24h', () => {
    // 2026-11-05 21:00 UTC = 2026-11-06 00:30 Tehran → today, although it is "yesterday" in UTC.
    const t = trendOf([{ at: '2026-11-05T21:00:00Z' }, { at: '2026-11-05T20:00:00Z' }], NOW)
    expect(t.spark.at(-1)).toBe(1) // today
    expect(t.spark.at(-2)).toBe(1) // 23:30 Tehran on the 5th = yesterday
  })

  it('spark is 14 days oldest first; week/weekBefore are 7 + 7', () => {
    const t = trendOf([{ at: daysAgo(0) }, { at: daysAgo(13) }, { at: daysAgo(7) }, { at: daysAgo(6) }], NOW)
    expect(t.spark).toHaveLength(14)
    expect(t.spark[0]).toBe(1)
    expect(t.spark[13]).toBe(1)
    expect(t.week).toHaveLength(7)
    expect(t.week[0]).toBe(1) // 6 days ago
    expect(t.week[6]).toBe(1) // today
    expect(t.weekBefore[6]).toBe(1) // 7 days ago
    expect(t.weekBefore[0]).toBe(1) // 13 days ago
  })

  it('sums weights (integer rials) and ignores the future', () => {
    const t = trendOf([{ at: daysAgo(1), weight: 40_000_000 }, { at: daysAgo(2), weight: 20_000_000 }, { at: daysAgo(-2), weight: 5 }], NOW)
    expect(t.current).toBe(60_000_000)
    expect(Number.isInteger(t.current)).toBe(true)
  })

  it('empty input is all zeros', () => {
    const t = trendOf([], NOW)
    expect([t.current, t.previous, ...t.spark, ...t.week, ...t.weekBefore].every((v) => v === 0)).toBe(true)
  })

  it('trendSince reaches past the oldest bucket', () => {
    expect(NOW.getTime() - trendSince(NOW).getTime()).toBeGreaterThan(2 * PERIOD_DAYS * DAY)
  })
})

describe('periodDelta', () => {
  it('no baseline means no percentage', () => {
    expect(periodDelta(0, 0)).toEqual({ kind: 'empty' })
    expect(periodDelta(5, 0)).toEqual({ kind: 'no-baseline' })
  })
  it('rounds to whole percent and keeps direction separate from tone', () => {
    expect(periodDelta(15, 10)).toEqual({ kind: 'change', pct: 50, trend: 'up', good: true })
    expect(periodDelta(5, 10)).toEqual({ kind: 'change', pct: 50, trend: 'down', good: false })
    expect(periodDelta(5, 10, 'down')).toEqual({ kind: 'change', pct: 50, trend: 'down', good: true })
    expect(periodDelta(1001, 1000)).toEqual({ kind: 'same' })
  })
})

describe('settledPayments', () => {
  it('counts paid instalments by paidAt and amount, on full and partial orders', () => {
    const v = settledPayments([
      { instalments: [{ amount: 100, status: 'paid', paidAt: '2026-11-01T10:00:00Z' }, { amount: 100, status: 'pending' }] },
      { instalments: [{ amount: 300, status: 'paid', paidAt: '2026-10-01T10:00:00Z' }] },
      { instalments: [{ amount: 50, status: 'paid', paidAt: null }] },
      { instalments: null },
    ])
    expect(v).toEqual([
      { at: '2026-11-01T10:00:00Z', weight: 100 },
      { at: '2026-10-01T10:00:00Z', weight: 300 },
    ])
  })
  it('never accepts a float amount', () => {
    expect(settledPayments([{ instalments: [{ amount: 10.5, status: 'paid', paidAt: '2026-11-01T00:00:00Z' }] }])).toEqual([])
  })
})

describe('sharePct', () => {
  it('is an integer 0–100', () => {
    expect(sharePct(1, 3)).toBe(33)
    expect(sharePct(0, 0)).toBe(0)
    expect(sharePct(5, 4)).toBe(100)
  })
})
