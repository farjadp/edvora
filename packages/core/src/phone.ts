import { toLatinDigits } from './digits'

/**
 * Normalises an Iranian mobile number to the 09XXXXXXXXX form.
 * Accepts +98, 0098, 98, 9…, Persian/Arabic digits, spaces and dashes.
 * Returns null when the input is not a valid Iranian mobile number.
 */
export function normalizeIranMobile(input: string): string | null {
  let d = toLatinDigits(input).replace(/[\s\-()]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('0098')) d = d.slice(4)
  else if (d.startsWith('98') && d.length === 12) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  return /^9\d{9}$/.test(d) ? `0${d}` : null
}

/** 09121234567 → 0912***4567 for logs and admin lists. */
export function maskPhone(phone: string): string {
  return phone.length < 8 ? phone : `${phone.slice(0, 4)}***${phone.slice(-4)}`
}
