import { toLatinDigits, toPersianDigits } from './digits'

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

// ---------------------------------------------------------------- Import: site currency → rial (ADR 011)

/** Currency codes Iranian WordPress stores use (WooCommerce core + Persian WooCommerce). */
export const RIAL_FACTORS = { IRR: 1, IRT: 10, IRHR: 1_000, IRHT: 10_000 } as const
export type IranCurrency = keyof typeof RIAL_FACTORS

export type RialConversionErrorCode = 'unknown_currency' | 'invalid_amount' | 'negative' | 'fractional' | 'too_large'

/** Thrown by `toRial`; callers skip the record and report `code` instead of guessing. */
export class RialConversionError extends Error {
  constructor(
    public readonly code: RialConversionErrorCode,
    public readonly amount: string,
    public readonly currency: string,
  ) {
    super(`Cannot convert ${JSON.stringify(amount)} ${JSON.stringify(currency)} to rial: ${code}`)
    this.name = 'RialConversionError'
  }
}

/**
 * Converts an amount in a site's currency to integer rials without floating point.
 * Accepts "1,500,000", "۱٬۵۰۰٬۰۰۰", "1500000.00", "12.5" (IRT → 125). Separators `,` `٬` and spaces are stripped;
 * `٫` is read as the decimal point. Factors: IRR 1, IRT 10, IRHR 1000, IRHT 10000.
 * Throws `RialConversionError` for an unknown/empty currency, a non-numeric or negative amount, or a result
 * with a fractional rial — never rounds.
 */
export function toRial(amount: string | number, currency: string): Rial {
  const code = String(currency ?? '').trim().toUpperCase()
  const raw = typeof amount === 'number' ? numberToDecimalString(amount) : String(amount ?? '')
  if (!(code in RIAL_FACTORS)) throw new RialConversionError('unknown_currency', raw, String(currency ?? ''))
  const factor = RIAL_FACTORS[code as IranCurrency]
  const cleaned = toLatinDigits(raw).replace(/[,٬\s]/g, '').replace(/٫/g, '.')
  if (cleaned.startsWith('-')) throw new RialConversionError('negative', raw, code)
  const m = /^\+?(\d+)(?:\.(\d*))?$|^\+?\.(\d+)$/.exec(cleaned)
  if (!m) throw new RialConversionError('invalid_amount', raw, code)
  const intPart = m[1] ?? '0'
  const fracPart = (m[2] ?? m[3] ?? '').replace(/0+$/, '')
  const scale = String(factor).length - 1 // factor is a power of ten
  if (fracPart.length > scale) throw new RialConversionError('fractional', raw, code)
  const value = BigInt(intPart + fracPart.padEnd(scale, '0'))
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RialConversionError('too_large', raw, code)
  return rial(Number(value))
}

function numberToDecimalString(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  const s = String(n)
  if (!/e/i.test(s)) return s
  // 1e21 and friends: expand without float arithmetic via toLocaleString (exact for integers).
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 })
}
