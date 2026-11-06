import { toPersianDigits } from './digits'

/**
 * Money is stored as an integer number of rials. It is shown to users as toman (1 toman = 10 rials).
 * Never store floats. Never store toman.
 */
export type Rial = number & { readonly __brand: 'Rial' }

export function rial(value: number): Rial {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Invalid rial amount: ${value}`)
  }
  return value as Rial
}

export function tomanToRial(toman: number): Rial {
  return rial(Math.round(toman * 10))
}

export function rialToToman(amount: Rial): number {
  return Math.floor(amount / 10)
}

/** 84_700_000 rial → "۸٬۴۷۰٬۰۰۰ تومان" */
export function formatToman(amount: Rial, opts: { persianDigits?: boolean; unit?: boolean } = {}): string {
  const { persianDigits = true, unit = true } = opts
  const grouped = rialToToman(amount).toLocaleString('en-US').replace(/,/g, '٬')
  const digits = persianDigits ? toPersianDigits(grouped) : grouped
  return unit ? `${digits} تومان` : digits
}

export type Coupon =
  | { kind: 'percent'; value: number; maxDiscount?: Rial }
  | { kind: 'fixed'; value: Rial }

/** Applies a coupon and returns the new price. Never goes below zero. */
export function applyCoupon(price: Rial, coupon: Coupon | null | undefined): { price: Rial; discount: Rial } {
  if (!coupon) return { price, discount: rial(0) }
  let discount: number
  if (coupon.kind === 'percent') {
    if (coupon.value < 0 || coupon.value > 100) throw new RangeError('Percent must be 0–100')
    discount = Math.floor((price * coupon.value) / 100)
    if (coupon.maxDiscount !== undefined) discount = Math.min(discount, coupon.maxDiscount)
  } else {
    discount = coupon.value
  }
  discount = Math.min(discount, price)
  return { price: rial(price - discount), discount: rial(discount) }
}
