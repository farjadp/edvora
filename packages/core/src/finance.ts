import { checkFourEyes, type Id } from './access'
import { dayStartsAt, jalaliMonthKey, tehranDayNumber } from './gamification/calendar'
import { rial, type Rial } from './money'
import type { OrderStatus } from './orders'

/**
 * Finance desk rules (E-023, ADR 021): overdue and upcoming instalments, the desk KPIs, and refunds with four-eyes.
 * Pure functions; the web app loads tenant-filtered rows and passes them in. Money is integer rials, days are
 * Tehran calendar days.
 */

// ---------------------------------------------------------------- Instalments

/** Orders that still expect money. Paid, refunded, cancelled and failed orders never show as overdue. */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ['pending', 'partially_paid']

export type FinanceOrder = {
  id: number
  status: string
  source?: string | null
  userId: number
  courseId: number | null
  cohortId: number | null
  instalments: readonly { index: number; amount: number; dueDate: string | Date; status?: string | null; paidAt?: string | Date | null }[]
}

export type DueInstalment = {
  orderId: number
  userId: number
  courseId: number | null
  cohortId: number | null
  index: number
  amount: Rial
  dueDate: Date
  /** > 0 overdue by that many days; 0 due today; < 0 due in that many days. */
  daysLate: number
  /** A payment for it is waiting for a person (E-045 queue); chasing the student would be wrong. */
  awaitingReview: boolean
}

/** Whole Tehran days between the due day and today. Due today = 0 (not overdue yet), yesterday = 1. */
export function daysLate(dueDate: Date | string, now: Date): number {
  return tehranDayNumber(now) - tehranDayNumber(dueDate)
}

/**
 * Every unpaid instalment of the open orders. Imported orders (WordPress history, ADR 011) are left out: they are
 * not collected through Edvora. `awaiting` = order id → instalment indexes covered by a payment waiting for review.
 */
export function unpaidInstalments(orders: readonly FinanceOrder[], now: Date, awaiting: ReadonlyMap<number, ReadonlySet<number>> = new Map()): DueInstalment[] {
  const out: DueInstalment[] = []
  for (const o of orders) {
    if (!OPEN_ORDER_STATUSES.includes(o.status as OrderStatus) || o.source === 'import') continue
    for (const i of o.instalments) {
      if (i.status === 'paid') continue
      const dueDate = new Date(i.dueDate)
      if (Number.isNaN(dueDate.getTime())) continue
      out.push({
        orderId: o.id,
        userId: o.userId,
        courseId: o.courseId,
        cohortId: o.cohortId,
        index: i.index,
        amount: rial(i.amount),
        dueDate,
        daysLate: daysLate(dueDate, now),
        awaitingReview: awaiting.get(o.id)?.has(i.index) ?? false,
      })
    }
  }
  return out
}

export const OVERDUE_BUCKETS = {
  '1-7': { label: '۱ تا ۷ روز', min: 1, max: 7 },
  '8-30': { label: '۸ تا ۳۰ روز', min: 8, max: 30 },
  '31-60': { label: '۳۱ تا ۶۰ روز', min: 31, max: 60 },
  '60+': { label: 'بیش از ۶۰ روز', min: 61, max: Number.POSITIVE_INFINITY },
} as const
export type OverdueBucket = keyof typeof OVERDUE_BUCKETS
export const isOverdueBucket = (v: unknown): v is OverdueBucket => typeof v === 'string' && v in OVERDUE_BUCKETS

export function bucketOf(days: number): OverdueBucket | null {
  for (const [k, b] of Object.entries(OVERDUE_BUCKETS) as [OverdueBucket, (typeof OVERDUE_BUCKETS)[OverdueBucket]][]) {
    if (days >= b.min && days <= b.max) return k
  }
  return null
}

export type OverdueFilter = { courseId?: number | null; cohortId?: number | null; bucket?: OverdueBucket | null }

/** Overdue instalments, most overdue first, with the desk filters applied. */
export function overdueInstalments(rows: readonly DueInstalment[], filter: OverdueFilter = {}): DueInstalment[] {
  return rows
    .filter((r) => r.daysLate >= 1)
    .filter((r) => filter.courseId == null || r.courseId === filter.courseId)
    .filter((r) => filter.cohortId == null || r.cohortId === filter.cohortId)
    .filter((r) => !filter.bucket || bucketOf(r.daysLate) === filter.bucket)
    .sort((a, b) => b.daysLate - a.daysLate || a.orderId - b.orderId || a.index - b.index)
}

export const UPCOMING_WINDOWS = [7, 30] as const
export type UpcomingWindow = (typeof UPCOMING_WINDOWS)[number]
export const isUpcomingWindow = (v: unknown): v is UpcomingWindow => UPCOMING_WINDOWS.includes(Number(v) as UpcomingWindow)

/** Instalments due from today to `days` days ahead (today included, so «۷ روز» = today + the next 6), soonest first. */
export function upcomingInstalments(rows: readonly DueInstalment[], days: UpcomingWindow): DueInstalment[] {
  return rows.filter((r) => r.daysLate <= 0 && -r.daysLate < days).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.orderId - b.orderId)
}

// ---------------------------------------------------------------- KPIs

/** UTC instant where the Jalali month containing `now` starts (00:00 Tehran on its first day). */
export function jalaliMonthStart(now: Date): Date {
  const today = tehranDayNumber(now)
  const key = jalaliMonthKey(today)
  let day = today
  while (jalaliMonthKey(day - 1) === key) day--
  return dayStartsAt(day)
}

export type FinanceKpis = {
  collectedThisMonth: Rial
  dueThisWeek: { amount: Rial; count: number }
  overdue: { amount: Rial; count: number }
}

/**
 * Desk numbers. Collected = instalments marked paid since the start of this Jalali month (the payment flow sets
 * `paidAt` when a payment is confirmed); refunds are reported beside it, not netted.
 */
export function financeKpis(input: { orders: readonly FinanceOrder[]; rows: readonly DueInstalment[]; now: Date }): FinanceKpis {
  const from = jalaliMonthStart(input.now).getTime()
  const to = input.now.getTime()
  let collected = 0
  for (const o of input.orders) {
    if (o.source === 'import') continue
    for (const i of o.instalments) {
      if (i.status !== 'paid' || !i.paidAt) continue
      const t = new Date(i.paidAt).getTime()
      if (t >= from && t <= to) collected += rial(i.amount)
    }
  }
  const sum = (list: readonly DueInstalment[]) => ({ amount: rial(list.reduce((n, r) => n + r.amount, 0)), count: list.length })
  return { collectedThisMonth: rial(collected), dueThisWeek: sum(upcomingInstalments(input.rows, 7)), overdue: sum(overdueInstalments(input.rows)) }
}

// ---------------------------------------------------------------- Contact notes

export const CONTACT_OUTCOMES = {
  reached: 'صحبت شد',
  promised: 'قول پرداخت داد',
  no_answer: 'پاسخ نداد',
  wrong_number: 'شماره اشتباه است',
  message_left: 'پیام گذاشته شد',
} as const
export type ContactOutcome = keyof typeof CONTACT_OUTCOMES
export const CONTACT_NOTE_MAX = 500

/** Latest contact per `order:instalment` key. */
export function lastContacts<T extends { orderId: number; instalmentIndex: number; at: string | Date }>(notes: readonly T[]): Map<string, T> {
  const out = new Map<string, T>()
  for (const n of notes) {
    const k = instalmentKey(n.orderId, n.instalmentIndex)
    const cur = out.get(k)
    if (!cur || new Date(n.at).getTime() > new Date(cur.at).getTime()) out.set(k, n)
  }
  return out
}

export const instalmentKey = (orderId: number, index: number) => `${orderId}:${index}`

// ---------------------------------------------------------------- Refunds

export type RefundStatus = 'requested' | 'approved' | 'refunded' | 'rejected' | 'cancelled'

export const REFUND_STATUS_LABELS: Readonly<Record<RefundStatus, { label: string; tone: 'neutral' | 'warn' | 'info' | 'ok' | 'danger' }>> = {
  requested: { label: 'در انتظار تأیید نفر دوم', tone: 'warn' },
  approved: { label: 'تأییدشده، در انتظار واریز', tone: 'info' },
  refunded: { label: 'بازپرداخت شد', tone: 'ok' },
  rejected: { label: 'رد شد', tone: 'danger' },
  cancelled: { label: 'لغو شد', tone: 'neutral' },
}

/** Refunds that hold money: they count against what is still refundable. */
export const REFUND_OPEN: readonly RefundStatus[] = ['requested', 'approved']
export const REFUND_COMMITTED: readonly RefundStatus[] = ['requested', 'approved', 'refunded']

export const REFUND_REASON_MIN = 5
export const REFUND_REASON_MAX = 500
export const REFUND_REFERENCE_MAX = 60

/** Money the academy actually received on an order: the sum of its paid instalments. */
export function paidAmount(instalments: FinanceOrder['instalments']): Rial {
  return rial(instalments.filter((i) => i.status === 'paid').reduce((n, i) => n + rial(i.amount), 0))
}

/** Paid minus every refund still standing (requested, approved or done). Never negative. */
export function refundableAmount(paid: number, refunds: readonly { amount: number; status: RefundStatus }[]): Rial {
  const committed = refunds.filter((r) => REFUND_COMMITTED.includes(r.status)).reduce((n, r) => n + rial(r.amount), 0)
  return rial(Math.max(0, rial(paid) - committed))
}

export type RefundOrder = { status: string; source?: string | null; studentId: Id; paid: number }

export type RefundRequestReason = 'own_order' | 'not_permitted' | 'order_closed' | 'imported' | 'nothing_paid' | 'bad_amount' | 'over_limit' | 'reason_required' | 'open_request'

/**
 * May this person request a refund of `amount` rials on this order? Integer rials, > 0, never above what is still
 * refundable. One open request per order at a time, so two people cannot each ask for the full amount.
 */
export function checkRefundRequest(input: {
  order: RefundOrder
  refunds: readonly { amount: number; status: RefundStatus }[]
  amount: number
  reason: string
  actor: { id: Id; canRequest: boolean }
}): { ok: true; amount: Rial; full: boolean } | { ok: false; reason: RefundRequestReason; max?: Rial } {
  const { order, actor } = input
  if (!actor.canRequest) return { ok: false, reason: 'not_permitted' }
  if (String(order.studentId) === String(actor.id)) return { ok: false, reason: 'own_order' }
  if (order.source === 'import') return { ok: false, reason: 'imported' }
  if (order.status !== 'paid' && order.status !== 'partially_paid') return { ok: false, reason: order.status === 'refunded' || order.status === 'cancelled' ? 'order_closed' : 'nothing_paid' }
  if (input.refunds.some((r) => REFUND_OPEN.includes(r.status))) return { ok: false, reason: 'open_request' }
  const max = refundableAmount(order.paid, input.refunds)
  if (max <= 0) return { ok: false, reason: 'nothing_paid' }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return { ok: false, reason: 'bad_amount' }
  if (input.amount > max) return { ok: false, reason: 'over_limit', max }
  const text = input.reason.trim()
  if (text.length < REFUND_REASON_MIN || text.length > REFUND_REASON_MAX) return { ok: false, reason: 'reason_required' }
  const alreadyRefunded = input.refunds.filter((r) => r.status === 'refunded').reduce((n, r) => n + r.amount, 0)
  return { ok: true, amount: rial(input.amount), full: alreadyRefunded + input.amount >= order.paid }
}

export type RefundAction = 'approve' | 'reject' | 'cancel' | 'complete'

export type RefundForCheck = { status: RefundStatus; requestedBy: Id | null | undefined; studentId: Id }
export type RefundActor = { id: Id; canRequest: boolean; canApprove: boolean }
export type RefundActionReason = 'wrong_status' | 'own_order' | 'same_person' | 'not_permitted' | 'missing_requester' | 'reason_required' | 'reference_required'

/**
 * Refund state machine (ADR 006 four-eyes, same rule as manual payments in ADR 017):
 * - approve: requested → approved. `refunds.approve`, never the requester.
 * - reject: requested | approved → rejected. `refunds.approve`, with a reason.
 * - cancel: requested → cancelled. Only the requester (changed their mind before anyone checked it).
 * - complete: approved → refunded, with the bank/transfer reference. `refunds.approve`, never the requester.
 * Nobody acts on a refund of their own order.
 */
export function checkRefundAction(action: RefundAction, r: RefundForCheck, actor: RefundActor, input: { reason?: string | null; reference?: string | null } = {}): { ok: true } | { ok: false; reason: RefundActionReason } {
  if (String(r.studentId) === String(actor.id)) return { ok: false, reason: 'own_order' }
  const fourEyes = (): { ok: true } | { ok: false; reason: RefundActionReason } => {
    const fe = checkFourEyes({ makerId: r.requestedBy, checkerId: actor.id, checkerAllowed: actor.canApprove })
    if (fe.ok) return { ok: true }
    return { ok: false, reason: fe.reason === 'missing-maker' ? 'missing_requester' : fe.reason === 'same-person' ? 'same_person' : 'not_permitted' }
  }
  switch (action) {
    case 'approve':
      if (r.status !== 'requested') return { ok: false, reason: 'wrong_status' }
      return fourEyes()
    case 'complete': {
      if (r.status !== 'approved') return { ok: false, reason: 'wrong_status' }
      const fe = fourEyes()
      if (!fe.ok) return fe
      const ref = (input.reference ?? '').trim()
      if (ref.length < 3 || ref.length > REFUND_REFERENCE_MAX) return { ok: false, reason: 'reference_required' }
      return { ok: true }
    }
    case 'reject': {
      if (r.status !== 'requested' && r.status !== 'approved') return { ok: false, reason: 'wrong_status' }
      if (!actor.canApprove) return { ok: false, reason: 'not_permitted' }
      const text = (input.reason ?? '').trim()
      if (text.length < REFUND_REASON_MIN || text.length > REFUND_REASON_MAX) return { ok: false, reason: 'reason_required' }
      return { ok: true }
    }
    case 'cancel':
      if (r.status !== 'requested') return { ok: false, reason: 'wrong_status' }
      return r.requestedBy != null && String(r.requestedBy) === String(actor.id) ? { ok: true } : { ok: false, reason: 'not_permitted' }
  }
}

/** Buttons to offer (the server checks again). Reject/complete are offered before the text is typed. */
export function refundActionsFor(r: RefundForCheck, actor: RefundActor): RefundAction[] {
  const sample = { reason: 'x'.repeat(REFUND_REASON_MIN), reference: 'xxx' }
  return (['approve', 'complete', 'reject', 'cancel'] as const).filter((a) => checkRefundAction(a, r, actor, sample).ok)
}

/**
 * What a completed refund does to the order and enrolment. Full (everything paid is now refunded) → the order is
 * `refunded` and the enrolment `cancelled`; unpaid instalments stop being chased because the order is closed.
 * Partial → the order and enrolment stay as they are (goodwill or a price correction), only the money is recorded.
 */
export function refundEffects(input: { paid: number; refundedBefore: number; amount: number }): { orderStatus: 'refunded' | null; cancelEnrollment: boolean; full: boolean } {
  const full = input.refundedBefore + input.amount >= input.paid
  return { orderStatus: full ? 'refunded' : null, cancelEnrollment: full, full }
}

export const REFUND_REQUEST_ERRORS: Readonly<Record<RefundRequestReason, string>> = {
  own_order: 'برای سفارش خودتان نمی‌توانید درخواست بازپرداخت ثبت کنید.',
  not_permitted: 'نقش شما اجازهٔ درخواست بازپرداخت ندارد.',
  order_closed: 'این سفارش بسته شده است.',
  imported: 'این سفارش از سایت قبلی منتقل شده است. بازپرداخت آن را بیرون از ادورا انجام دهید.',
  nothing_paid: 'برای این سفارش مبلغی پرداخت نشده که بازگردانده شود.',
  bad_amount: 'مبلغ بازپرداخت را به تومان و بیشتر از صفر وارد کنید.',
  over_limit: 'مبلغ بازپرداخت از مبلغ پرداخت‌شدهٔ باقی‌مانده بیشتر است.',
  reason_required: `دلیل بازپرداخت را بنویسید (دست‌کم ${REFUND_REASON_MIN} نویسه).`,
  open_request: 'برای این سفارش یک درخواست بازپرداخت باز هست. اول تکلیف آن را روشن کنید.',
}

export const REFUND_ACTION_ERRORS: Readonly<Record<RefundActionReason, string>> = {
  wrong_status: 'وضعیت این بازپرداخت تغییر کرده است. صفحه را تازه کنید.',
  own_order: 'بازپرداخت سفارش خودتان را نمی‌توانید تأیید کنید.',
  same_person: 'کسی که بازپرداخت را درخواست کرده نمی‌تواند خودش آن را تأیید کند. نفر دوم باید تأیید کند.',
  not_permitted: 'نقش شما اجازهٔ این کار را ندارد.',
  missing_requester: 'درخواست‌کنندهٔ این بازپرداخت مشخص نیست.',
  reason_required: `دلیل رد را بنویسید (دست‌کم ${REFUND_REASON_MIN} نویسه).`,
  reference_required: 'شمارهٔ پیگیری یا مرجع واریز بازپرداخت را وارد کنید.',
}
