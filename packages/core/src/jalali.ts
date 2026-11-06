import { format } from 'date-fns-jalali'
import { toPersianDigits } from './digits'

/** Dates are stored in UTC and shown in the Jalali (Shamsi) calendar, Tehran time. */
export function formatJalali(date: Date | string, pattern = 'd MMMM yyyy'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  // Shift to Asia/Tehran (UTC+3:30, no DST since 1402) for display.
  const tehran = new Date(d.getTime() + (3.5 * 60 + d.getTimezoneOffset()) * 60 * 1000)
  return toPersianDigits(format(tehran, pattern))
}
