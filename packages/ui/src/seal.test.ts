import { describe, expect, it } from 'vitest'
import { allowCelebration, dayKey, MAX_PER_DAY, parseLedger, recordCelebration } from './celebrationBudget'
import { clampPct, ringDash, rosettePoints, starPoints } from './geometry'

describe('ring geometry', () => {
  it('clamps and rounds the value', () => {
    expect(clampPct(40.4)).toBe(40)
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(180)).toBe(100)
    expect(clampPct(Number.NaN)).toBe(0)
  })
  it('draws against a 100-long path', () => {
    expect(ringDash(62.5)).toBe('63 100')
    expect(ringDash(0)).toBe('0 100')
  })
  it('builds an eight-pointed star (16 vertices) and a scalloped rosette', () => {
    expect(starPoints(48, 48, 46).split(' ')).toHaveLength(16)
    expect(rosettePoints(32, 32, 31, 28).split(' ')).toHaveLength(56)
    // the first vertex is the top tip
    expect(starPoints(48, 48, 46).split(' ')[0]).toBe('48,2')
  })
})

describe('celebration budget (1 per view, 3 per day)', () => {
  const day = dayKey(new Date(2026, 10, 6))
  it('formats the local day', () => expect(day).toBe('2026-11-06'))
  it('allows one per view', () => {
    const l = parseLedger(null, day)
    expect(allowCelebration(l, 'lesson:1', 0)).toBe(true)
    expect(allowCelebration(l, 'lesson:2', 1)).toBe(false)
  })
  it('allows three distinct moments a day, then goes quiet', () => {
    let l = parseLedger(null, day)
    for (const id of ['a', 'b', 'c']) {
      expect(allowCelebration(l, id, 0)).toBe(true)
      l = recordCelebration(l, id)
    }
    expect(l.ids).toHaveLength(MAX_PER_DAY)
    expect(allowCelebration(l, 'd', 0)).toBe(false)
  })
  it('does not count the same moment twice', () => {
    const l = recordCelebration(recordCelebration(parseLedger(null, day), 'a'), 'a')
    expect(l.ids).toEqual(['a'])
  })
  it('resets on a new day and survives malformed storage', () => {
    const old = JSON.stringify({ day: '2026-11-05', ids: ['a', 'b', 'c'] })
    expect(parseLedger(old, day).ids).toEqual([])
    expect(parseLedger('{not json', day).ids).toEqual([])
    expect(parseLedger(JSON.stringify({ day, ids: [1, 'x'] }), day).ids).toEqual(['x'])
  })
})
