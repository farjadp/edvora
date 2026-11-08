import { buildInstalmentPlan, type Instalment } from './instalments'
import { applyCoupon, rial, type Coupon, type Rial } from './money'

/**
 * Order money rules (ACC-02, ACC-03). The server prices every order; callers never send amounts or a status.
 * All amounts are integer rials.
 */

export type OrderStatus = 'pending' | 'partially_paid' | 'paid' | 'failed' | 'refunded' | 'cancelled'

/** Down payment used when a buyer pays in instalments (checkout rule since E-010). */
export const INSTALMENT_DOWN_PAYMENT_PERCENT = 40

export type OrderPriceInput = {
  /** Course price, or the cohort's price override. */
  price: number
  coupon?: Coupon | null
  /** Instalments the buyer asked for; clamped to 1..maxInstalments. */
  instalmentCount?: number
  maxInstalments?: number | null
  firstDueDate: Date
}

export type OrderPrice = {
  subtotal: Rial
  discount: Rial
  total: Rial
  instalments: Instalment[]
}

/** Subtotal, discount, total and the instalment plan of a new order. The plan always sums to the total. */
export function priceOrder(input: OrderPriceInput): OrderPrice {
  const subtotal = rial(input.price)
  const { price: total, discount } = applyCoupon(subtotal, input.coupon ?? null)
  const max = Math.max(1, Math.floor(input.maxInstalments ?? 1))
  const count = Math.max(1, Math.min(Math.floor(input.instalmentCount ?? 1), max))
  const instalments = buildInstalmentPlan({
    total,
    count,
    downPaymentPercent: count > 1 ? INSTALMENT_DOWN_PAYMENT_PERCENT : 0,
    firstDueDate: input.firstDueDate,
  })
  return { subtotal, discount, total, instalments }
}

/**
 * Fields that only the payment flow (gateway callback, or a manual payment approved by a second person) may change.
 * `course`/`cohort` set the price, so they are fixed once the order exists.
 */
export const ORDER_LOCKED_FIELDS = ['subtotal', 'discount', 'total', 'couponCode', 'instalments', 'payments', 'course', 'cohort', 'source'] as const
export type OrderLockedField = (typeof ORDER_LOCKED_FIELDS)[number]

/**
 * Status changes a person may make by editing an order. Paid, partially paid and refunded come only from the
 * payment flow (ADR 006 four-eyes); a person may only cancel an order nobody has paid anything on.
 */
const MANUAL_STATUS_CHANGES: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending: ['cancelled'],
  failed: ['cancelled'],
  partially_paid: [],
  paid: [],
  refunded: [],
  cancelled: [],
}

export function canChangeOrderStatusManually(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || (MANUAL_STATUS_CHANGES[from] ?? []).includes(to)
}

const idOrValue = (v: unknown): unknown => (v && typeof v === 'object' && 'id' in v ? (v as { id: unknown }).id : v)
const time = (v: unknown): unknown => {
  if (v === null || v === undefined || v === '') return null
  const t = new Date(v as string).getTime()
  return Number.isNaN(t) ? v : t
}
const num = (v: unknown): unknown => (v === null || v === undefined || v === '' ? null : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v)
const str = (v: unknown): unknown => (v === null || v === undefined || v === '' ? null : v)

type Row = Record<string, unknown>
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])

/** Comparable form of a locked field: ignores row ids, date formats, populated relations and empty-vs-missing. */
function normalise(field: OrderLockedField, v: unknown): unknown {
  switch (field) {
    case 'subtotal':
    case 'discount':
    case 'total':
      return num(v) ?? (field === 'discount' ? 0 : null)
    case 'couponCode':
    case 'source':
      return str(v)
    case 'course':
    case 'cohort':
      return num(idOrValue(v)) ?? null
    case 'instalments':
      return rows(v).map((r) => [num(r.index), num(r.amount), time(r.dueDate), str(r.status) ?? 'pending', time(r.paidAt)])
    case 'payments':
      return rows(v).map((r) => [
        num(r.instalmentIndex),
        str(r.provider),
        str(r.authority),
        num(r.amount),
        str(r.status) ?? 'started',
        str(r.refId),
        str(r.cardPan),
        str(r.error),
        str(r.gateway),
        str(r.gatewayTitle),
      ])
  }
}

/** Locked fields that `change` would alter on `before`. Fields missing from `change` are untouched. */
export function lockedOrderChanges(before: Row, change: Row): OrderLockedField[] {
  return ORDER_LOCKED_FIELDS.filter((f) => f in change && JSON.stringify(normalise(f, before[f])) !== JSON.stringify(normalise(f, change[f])))
}
