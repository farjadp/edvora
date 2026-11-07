/**
 * Tehran calendar days and weeks for gamification. A "day number" is the count of days since 1970-01-01 of the
 * Asia/Tehran wall-clock date (tz database via Intl, never a hand-coded offset). Weekdays are the same in the
 * Gregorian and Jalali calendars, so a Saturday-start week IS the Jalali week. Keys use Latin digits (IDs).
 */
import { toLatinDigits } from '../digits'
import { startOfTehranDay } from '../drip'
import { formatJalali } from '../jalali'
import { WEEK_DAY_INDEX, type GamificationBreak, type WeekDay } from './settings'

const DAY_MS = 24 * 60 * 60 * 1000
const TZ = 'Asia/Tehran'

let ymdFormatter: Intl.DateTimeFormat | null = null
function tehranYmd(date: Date): { y: number; m: number; d: number } {
  ymdFormatter ??= new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  const parts = Object.fromEntries(ymdFormatter.formatToParts(date).map((p) => [p.type, p.value]))
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) }
}

/** Tehran calendar day of an instant, as days since 1970-01-01. */
export function tehranDayNumber(date: Date | string): number {
  const { y, m, d } = tehranYmd(new Date(date))
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (day: number): number => (((day + 4) % 7) + 7) % 7

/** `2026-11-07` (Gregorian date of the Tehran day; stable key, Latin digits). */
export function dayKey(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

export function dayFromKey(key: string): number {
  return Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS)
}

/** UTC instant of 00:00 Tehran on `day`. */
export function dayStartsAt(day: number): Date {
  // 12:00 UTC is always inside the same Tehran calendar day (Tehran is UTC+3:30 / +4:30).
  return startOfTehranDay(new Date(day * DAY_MS + 12 * 60 * 60 * 1000))
}

/** First day of the week containing `day`. */
export function weekStartDay(day: number, weekStart: WeekDay): number {
  return day - ((weekdayOf(day) - WEEK_DAY_INDEX[weekStart] + 7) % 7)
}

export type WeekSpan = {
  /** Gregorian date of the first day, e.g. `2026-11-07`. */
  key: string
  startDay: number
  endDay: number
  /** UTC instants: [startsAt, endsAt). */
  startsAt: Date
  endsAt: Date
  /** Display label of the first day in Jalali with Persian digits, e.g. «۱۶ آبان ۱۴۰۵». */
  label: string
}

export function weekSpan(startDay: number): WeekSpan {
  const startsAt = dayStartsAt(startDay)
  return {
    key: dayKey(startDay),
    startDay,
    endDay: startDay + 6,
    startsAt,
    endsAt: dayStartsAt(startDay + 7),
    label: jalaliLabel(startsAt),
  }
}

// +2h keeps the instant well inside the Tehran day whatever the historic offset was.
const jalaliLabel = (at: Date): string => formatJalali(new Date(at.getTime() + 2 * 60 * 60 * 1000))

export function weekOf(date: Date | string, weekStart: WeekDay): WeekSpan {
  return weekSpan(weekStartDay(tehranDayNumber(date), weekStart))
}

/** Jalali month key `1405-08` of a Tehran day (Latin digits). */
export function jalaliMonthKey(day: number): string {
  return toLatinDigits(formatJalali(new Date(dayStartsAt(day).getTime() + 2 * 60 * 60 * 1000), 'yyyy-MM'))
}

/** Inclusive Tehran-day ranges covered by breaks. */
export function breakDays(breaks: readonly GamificationBreak[]): { from: number; to: number }[] {
  return breaks.map((b) => ({ from: tehranDayNumber(b.startsAt), to: tehranDayNumber(b.endsAt) })).filter((r) => r.to >= r.from)
}

export const inBreak = (day: number, ranges: readonly { from: number; to: number }[]) => ranges.some((r) => day >= r.from && day <= r.to)
export const overlapsBreak = (from: number, to: number, ranges: readonly { from: number; to: number }[]) => ranges.some((r) => r.from <= to && r.to >= from)
