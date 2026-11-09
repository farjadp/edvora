import { describe, expect, it } from 'vitest'
import {
  bucketOf,
  checkRefundAction,
  checkRefundRequest,
  daysLate,
  financeKpis,
  jalaliMonthStart,
  lastContacts,
  overdueInstalments,
  paidAmount,
  refundActionsFor,
  refundEffects,
  refundableAmount,
  unpaidInstalments,
  upcomingInstalments,
  type FinanceOrder,
} from './finance'
import { formatJalali } from './jalali'

// 2026-11-09 12:00 Tehran (08:30 UTC) = 18 Aban 1405.
const NOW = new Date('2026-11-09T08:30:00Z')
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString()

const order = (over: Partial<FinanceOrder> = {}): FinanceOrder => ({
  id: 1,
  status: 'partially_paid',
  userId: 10,
  courseId: 100,
  cohortId: 1000,
  instalments: [
    { index: 0, amount: 40_000_000, dueDate: at(-60), status: 'paid', paidAt: at(-60) },
    { index: 1, amount: 30_000_000, dueDate: at(-5), status: 'pending' },
    { index: 2, amount: 30_000_000, dueDate: at(25), status: 'pending' },
  ],
  ...over,
})

describe('overdue days (Tehran calendar)', () => {
  it('due today is 0, yesterday 1, tomorrow -1', () => {
    expect(daysLate(NOW, NOW)).toBe(0)
    expect(daysLate(at(-1), NOW)).toBe(1)
    expect(daysLate(at(1), NOW)).toBe(-1)
  })
  it('counts Tehran days, not 24-hour spans: 23:50 Tehran yesterday is 1 day late at 00:10 today', () => {
    expect(daysLate(new Date('2026-11-08T20:20:00Z'), new Date('2026-11-08T20:40:00Z'))).toBe(1)
  })
  it('buckets', () => {
    expect(bucketOf(0)).toBeNull()
    expect(bucketOf(1)).toBe('1-7')
    expect(bucketOf(7)).toBe('1-7')
    expect(bucketOf(8)).toBe('8-30')
    expect(bucketOf(31)).toBe('31-60')
    expect(bucketOf(61)).toBe('60+')
    expect(bucketOf(400)).toBe('60+')
  })
})

describe('unpaid, overdue and upcoming instalments', () => {
  it('lists only unpaid instalments of open, non-imported orders', () => {
    const rows = unpaidInstalments(
      [order(), order({ id: 2, status: 'paid' }), order({ id: 3, status: 'refunded' }), order({ id: 4, status: 'cancelled' }), order({ id: 5, source: 'import' })],
      NOW,
    )
    expect(rows.map((r) => `${r.orderId}:${r.index}`)).toEqual(['1:1', '1:2'])
    expect(rows[0]!.daysLate).toBe(5)
  })
  it('flags instalments covered by a payment waiting for review', () => {
    const rows = unpaidInstalments([order()], NOW, new Map([[1, new Set([1])]]))
    expect(rows.find((r) => r.index === 1)!.awaitingReview).toBe(true)
    expect(rows.find((r) => r.index === 2)!.awaitingReview).toBe(false)
  })
  it('overdue: most overdue first, filters by course, cohort and bucket', () => {
    const rows = unpaidInstalments(
      [
        order(),
        order({ id: 2, courseId: 200, cohortId: 2000, instalments: [{ index: 0, amount: 10, dueDate: at(-40), status: 'pending' }] }),
        order({ id: 3, instalments: [{ index: 0, amount: 10, dueDate: NOW, status: 'pending' }] }),
      ],
      NOW,
    )
    expect(overdueInstalments(rows).map((r) => r.orderId)).toEqual([2, 1])
    expect(overdueInstalments(rows, { courseId: 100 }).map((r) => r.orderId)).toEqual([1])
    expect(overdueInstalments(rows, { cohortId: 2000 }).map((r) => r.orderId)).toEqual([2])
    expect(overdueInstalments(rows, { bucket: '1-7' }).map((r) => r.orderId)).toEqual([1])
    expect(overdueInstalments(rows, { bucket: '60+' })).toEqual([])
  })
  it('upcoming: today included, window end excluded, soonest first', () => {
    const rows = unpaidInstalments(
      [
        order({
          instalments: [
            { index: 0, amount: 1, dueDate: at(29), status: 'pending' },
            { index: 1, amount: 1, dueDate: at(6), status: 'pending' },
            { index: 2, amount: 1, dueDate: NOW, status: 'pending' },
            { index: 3, amount: 1, dueDate: at(7), status: 'pending' },
            { index: 4, amount: 1, dueDate: at(30), status: 'pending' },
            { index: 5, amount: 1, dueDate: at(-1), status: 'pending' },
          ],
        }),
      ],
      NOW,
    )
    expect(upcomingInstalments(rows, 7).map((r) => r.index)).toEqual([2, 1])
    expect(upcomingInstalments(rows, 30).map((r) => r.index)).toEqual([2, 1, 3, 0])
  })
})

describe('KPIs', () => {
  it('Jalali month starts on the 1st, 00:00 Tehran', () => {
    const start = jalaliMonthStart(NOW)
    expect(formatJalali(start, 'yyyy/MM/dd HH:mm')).toBe('۱۴۰۵/۰۸/۰۱ ۰۰:۰۰')
  })
  it('collected this month, due this week, overdue', () => {
    const o = order({
      instalments: [
        { index: 0, amount: 40_000_000, dueDate: at(-60), status: 'paid', paidAt: at(-60) }, // last month
        { index: 1, amount: 20_000_000, dueDate: at(-3), status: 'paid', paidAt: at(-2) }, // this month
        { index: 2, amount: 15_000_000, dueDate: at(-5), status: 'pending' },
        { index: 3, amount: 12_000_000, dueDate: at(3), status: 'pending' },
        { index: 4, amount: 13_000_000, dueDate: at(20), status: 'pending' },
      ],
    })
    const orders = [o, order({ id: 9, source: 'import', status: 'paid', instalments: [{ index: 0, amount: 999, dueDate: at(-1), status: 'paid', paidAt: at(-1) }] })]
    const k = financeKpis({ orders, rows: unpaidInstalments(orders, NOW), now: NOW })
    expect(k.collectedThisMonth).toBe(20_000_000)
    expect(k.dueThisWeek).toEqual({ amount: 12_000_000, count: 1 })
    expect(k.overdue).toEqual({ amount: 15_000_000, count: 1 })
  })
})

describe('contact notes', () => {
  it('keeps the latest note per instalment', () => {
    const m = lastContacts([
      { orderId: 1, instalmentIndex: 1, at: at(-3), note: 'a' },
      { orderId: 1, instalmentIndex: 1, at: at(-1), note: 'b' },
      { orderId: 1, instalmentIndex: 2, at: at(-2), note: 'c' },
    ])
    expect(m.get('1:1')!.note).toBe('b')
    expect(m.get('1:2')!.note).toBe('c')
  })
})

describe('refund limits', () => {
  const ord = { status: 'partially_paid', studentId: 10, paid: 40_000_000 }
  const actor = { id: 7, canRequest: true }
  const base = { order: ord, refunds: [], amount: 10_000_000, reason: 'انصراف دانشجو', actor }

  it('paid amount is the sum of paid instalments', () => {
    expect(paidAmount(order().instalments)).toBe(40_000_000)
  })
  it('refundable = paid minus requested, approved and done refunds; rejected and cancelled do not count', () => {
    expect(
      refundableAmount(40_000_000, [
        { amount: 5_000_000, status: 'refunded' },
        { amount: 3_000_000, status: 'approved' },
        { amount: 9_000_000, status: 'rejected' },
        { amount: 9_000_000, status: 'cancelled' },
      ]),
    ).toBe(32_000_000)
    expect(refundableAmount(10, [{ amount: 20, status: 'refunded' }])).toBe(0)
  })
  it('accepts a partial refund in integer rials', () => {
    expect(checkRefundRequest(base)).toEqual({ ok: true, amount: 10_000_000, full: false })
  })
  it('a refund of everything paid is full', () => {
    expect(checkRefundRequest({ ...base, amount: 40_000_000 })).toEqual({ ok: true, amount: 40_000_000, full: true })
    expect(checkRefundRequest({ ...base, amount: 30_000_000, refunds: [{ amount: 10_000_000, status: 'refunded' }] })).toMatchObject({ ok: true, full: true })
  })
  it('never above what was paid (minus earlier refunds)', () => {
    expect(checkRefundRequest({ ...base, amount: 40_000_010 })).toEqual({ ok: false, reason: 'over_limit', max: 40_000_000 })
    expect(checkRefundRequest({ ...base, amount: 35_000_000, refunds: [{ amount: 10_000_000, status: 'refunded' }] })).toMatchObject({ ok: false, reason: 'over_limit', max: 30_000_000 })
  })
  it('refuses floats, zero and negatives', () => {
    expect(checkRefundRequest({ ...base, amount: 10.5 })).toMatchObject({ ok: false, reason: 'bad_amount' })
    expect(checkRefundRequest({ ...base, amount: 0 })).toMatchObject({ ok: false, reason: 'bad_amount' })
    expect(checkRefundRequest({ ...base, amount: -5 })).toMatchObject({ ok: false, reason: 'bad_amount' })
  })
  it('one open request per order', () => {
    expect(checkRefundRequest({ ...base, refunds: [{ amount: 1, status: 'requested' }] })).toMatchObject({ ok: false, reason: 'open_request' })
    expect(checkRefundRequest({ ...base, refunds: [{ amount: 1, status: 'approved' }] })).toMatchObject({ ok: false, reason: 'open_request' })
  })
  it('refuses closed, unpaid, imported and own orders, a missing permission and a missing reason', () => {
    expect(checkRefundRequest({ ...base, order: { ...ord, status: 'refunded' } })).toMatchObject({ reason: 'order_closed' })
    expect(checkRefundRequest({ ...base, order: { ...ord, status: 'pending', paid: 0 } })).toMatchObject({ reason: 'nothing_paid' })
    expect(checkRefundRequest({ ...base, order: { ...ord, source: 'import' } })).toMatchObject({ reason: 'imported' })
    expect(checkRefundRequest({ ...base, actor: { id: 10, canRequest: true } })).toMatchObject({ reason: 'own_order' })
    expect(checkRefundRequest({ ...base, actor: { id: 7, canRequest: false } })).toMatchObject({ reason: 'not_permitted' })
    expect(checkRefundRequest({ ...base, reason: ' کم ' })).toMatchObject({ reason: 'reason_required' })
  })
})

describe('refund four-eyes', () => {
  const requester = { id: 7, canRequest: true, canApprove: true }
  const approver = { id: 8, canRequest: false, canApprove: true }
  const other = { id: 9, canRequest: true, canApprove: false }
  const requested = { status: 'requested' as const, requestedBy: 7, studentId: 10 }
  const approved = { ...requested, status: 'approved' as const }

  it('the requester can never approve or complete, even holding refunds.approve', () => {
    expect(checkRefundAction('approve', requested, requester)).toEqual({ ok: false, reason: 'same_person' })
    expect(checkRefundAction('complete', approved, requester, { reference: 'REF-1' })).toEqual({ ok: false, reason: 'same_person' })
  })
  it('a second person with refunds.approve approves, then completes with a reference', () => {
    expect(checkRefundAction('approve', requested, approver)).toEqual({ ok: true })
    expect(checkRefundAction('complete', approved, approver, { reference: '' })).toEqual({ ok: false, reason: 'reference_required' })
    expect(checkRefundAction('complete', approved, approver, { reference: 'PAYA-123' })).toEqual({ ok: true })
  })
  it('needs refunds.approve', () => {
    expect(checkRefundAction('approve', requested, other)).toEqual({ ok: false, reason: 'not_permitted' })
    expect(checkRefundAction('reject', requested, other, { reason: 'به‌دلیل قوانین' })).toEqual({ ok: false, reason: 'not_permitted' })
  })
  it('state transitions', () => {
    expect(checkRefundAction('approve', approved, approver)).toEqual({ ok: false, reason: 'wrong_status' })
    expect(checkRefundAction('complete', requested, approver, { reference: 'abc' })).toEqual({ ok: false, reason: 'wrong_status' })
    expect(checkRefundAction('reject', { ...requested, status: 'refunded' }, approver, { reason: 'دیر شده است' })).toEqual({ ok: false, reason: 'wrong_status' })
    expect(checkRefundAction('reject', approved, approver, { reason: 'دیر شده است' })).toEqual({ ok: true })
    expect(checkRefundAction('reject', approved, approver, { reason: 'نه' })).toEqual({ ok: false, reason: 'reason_required' })
  })
  it('only the requester cancels, and only before approval', () => {
    expect(checkRefundAction('cancel', requested, requester)).toEqual({ ok: true })
    expect(checkRefundAction('cancel', requested, approver)).toEqual({ ok: false, reason: 'not_permitted' })
    expect(checkRefundAction('cancel', approved, requester)).toEqual({ ok: false, reason: 'wrong_status' })
  })
  it('nobody acts on a refund of their own order', () => {
    expect(checkRefundAction('approve', { ...requested, studentId: 8 }, approver)).toEqual({ ok: false, reason: 'own_order' })
  })
  it('offers the right buttons', () => {
    // Refusing money is the safe direction (as in ADR 017), so the requester may also reject.
    expect(refundActionsFor(requested, requester)).toEqual(['reject', 'cancel'])
    expect(refundActionsFor(requested, approver)).toEqual(['approve', 'reject'])
    expect(refundActionsFor(approved, approver)).toEqual(['complete', 'reject'])
    expect(refundActionsFor(requested, other)).toEqual([])
  })
})

describe('refund effects (order and enrolment)', () => {
  it('full refund closes the order and cancels the enrolment', () => {
    expect(refundEffects({ paid: 100, refundedBefore: 0, amount: 100 })).toEqual({ orderStatus: 'refunded', cancelEnrollment: true, full: true })
    expect(refundEffects({ paid: 100, refundedBefore: 40, amount: 60 })).toEqual({ orderStatus: 'refunded', cancelEnrollment: true, full: true })
  })
  it('partial refund leaves the order and enrolment as they are', () => {
    expect(refundEffects({ paid: 100, refundedBefore: 0, amount: 30 })).toEqual({ orderStatus: null, cancelEnrollment: false, full: false })
  })
})
