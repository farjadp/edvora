import { describe, expect, it } from 'vitest'
import { canChangeOrderStatusManually, lockedOrderChanges, priceOrder } from './orders'
import { rial } from './money'

const day0 = new Date('2026-11-08T00:00:00Z')

describe('priceOrder (ACC-02)', () => {
  it('prices from the course, never from the caller', () => {
    const p = priceOrder({ price: 10_000_000, firstDueDate: day0 })
    expect(p).toMatchObject({ subtotal: 10_000_000, discount: 0, total: 10_000_000 })
    expect(p.instalments).toEqual([{ index: 0, amount: 10_000_000, dueDate: day0 }])
  })

  it('applies a coupon within its own limits', () => {
    const p = priceOrder({ price: 10_000_000, coupon: { kind: 'percent', value: 50, maxDiscount: rial(2_000_000) }, firstDueDate: day0 })
    expect(p).toMatchObject({ subtotal: 10_000_000, discount: 2_000_000, total: 8_000_000 })
  })

  it('a fixed coupon never takes the total below zero', () => {
    expect(priceOrder({ price: 1_000_000, coupon: { kind: 'fixed', value: rial(5_000_000) }, firstDueDate: day0 })).toMatchObject({ discount: 1_000_000, total: 0 })
  })

  it('clamps instalments to the course maximum and keeps the 40% down payment', () => {
    const p = priceOrder({ price: 10_000_000, instalmentCount: 6, maxInstalments: 3, firstDueDate: day0 })
    expect(p.instalments.map((i) => i.amount)).toEqual([4_000_000, 3_000_000, 3_000_000])
    expect(p.instalments.reduce((a, i) => a + i.amount, 0)).toBe(p.total)
    expect(priceOrder({ price: 10_000_000, instalmentCount: 3, firstDueDate: day0 }).instalments).toHaveLength(1)
  })

  it('refuses floats and negative prices', () => {
    expect(() => priceOrder({ price: 10.5, firstDueDate: day0 })).toThrow(RangeError)
    expect(() => priceOrder({ price: -1, firstDueDate: day0 })).toThrow(RangeError)
  })
})

describe('canChangeOrderStatusManually (ACC-03)', () => {
  it('a person may only cancel an unpaid order', () => {
    expect(canChangeOrderStatusManually('pending', 'cancelled')).toBe(true)
    expect(canChangeOrderStatusManually('failed', 'cancelled')).toBe(true)
    expect(canChangeOrderStatusManually('pending', 'pending')).toBe(true)
  })

  it('paid, partially paid and refunded only come from the payment flow', () => {
    expect(canChangeOrderStatusManually('pending', 'paid')).toBe(false)
    expect(canChangeOrderStatusManually('pending', 'partially_paid')).toBe(false)
    expect(canChangeOrderStatusManually('paid', 'refunded')).toBe(false)
    expect(canChangeOrderStatusManually('paid', 'cancelled')).toBe(false)
    expect(canChangeOrderStatusManually('cancelled', 'pending')).toBe(false)
  })
})

describe('lockedOrderChanges (ACC-03)', () => {
  const before = {
    subtotal: 10_000_000,
    discount: 0,
    total: 10_000_000,
    couponCode: null,
    course: 7,
    cohort: null,
    source: 'site',
    instalments: [{ id: 'a1', index: 0, amount: 10_000_000, dueDate: '2026-11-08T00:00:00.000Z', status: 'pending', paidAt: null }],
    payments: [],
  }

  it('finds a changed total or a paid instalment', () => {
    expect(lockedOrderChanges(before, { total: 1 })).toEqual(['total'])
    expect(lockedOrderChanges(before, { instalments: [{ ...before.instalments[0], status: 'paid' }] })).toEqual(['instalments'])
    expect(lockedOrderChanges(before, { payments: [{ instalmentIndex: 0, provider: 'mock', authority: 'x', amount: 1 }] })).toEqual(['payments'])
    expect(lockedOrderChanges(before, { course: 8 })).toEqual(['course'])
  })

  it('ignores an admin form that resends the same values in another shape', () => {
    const resent = {
      subtotal: '10000000',
      total: 10_000_000,
      couponCode: '',
      course: { id: 7, title: 'x' },
      instalments: [{ index: 0, amount: 10_000_000, dueDate: '2026-11-08T03:30:00+03:30', status: 'pending' }],
      payments: [],
      status: 'cancelled',
      user: 3,
    }
    expect(lockedOrderChanges(before, resent)).toEqual([])
  })

  it('fields not sent are untouched', () => {
    expect(lockedOrderChanges(before, { status: 'cancelled' })).toEqual([])
  })
})
