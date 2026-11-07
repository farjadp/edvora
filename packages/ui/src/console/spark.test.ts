import { describe, expect, it } from 'vitest'
import { sparkShape, sparkX } from './spark'

describe('sparkShape', () => {
  it('draws a line only with two or more busy days', () => {
    expect(sparkShape([0, 1, 0, 2])).toEqual({ kind: 'line' })
    expect(sparkShape([0, 0, 5, 0])).toEqual({ kind: 'flat', dotAt: 2 })
    expect(sparkShape([0, 0, 0])).toEqual({ kind: 'flat', dotAt: null })
    expect(sparkShape([])).toEqual({ kind: 'flat', dotAt: null })
    expect(sparkShape([7])).toEqual({ kind: 'flat', dotAt: 0 })
  })
})

describe('sparkX', () => {
  it('runs right to left in RTL', () => {
    expect(sparkX(0, 14, true)).toBe(100)
    expect(sparkX(13, 14, true)).toBe(0)
    expect(sparkX(0, 14, false)).toBe(0)
    expect(sparkX(0, 1, true)).toBe(100)
  })
})
