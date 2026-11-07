/**
 * Pure helpers for importing a WordPress site (ADR 011). No I/O, no node:crypto, safe for client bundles
 * (`@edvora/core/wpimport`).
 */
import { toLatinDigits } from './digits'
import { normalizeIranMobile } from './phone'

// ---------------------------------------------------------------- Phones

export type PhoneSource =
  | 'digits_phone'
  | 'digits_phone_no'
  | 'mobile'
  | 'phone_number'
  | 'billing_phone'
  | 'order_billing_phone'

export type PhoneCandidate = { source: PhoneSource; value: string }

export type PickedPhone = {
  /** Normalised `09XXXXXXXXX`, or null when no candidate is a valid Iranian mobile. */
  phone: string | null
  source: PhoneSource | null
  /** Non-empty candidates checked before the hit (or all of them when nothing matched). */
  invalidCandidates: PhoneCandidate[]
}

export type MetaBag = Readonly<Record<string, string | readonly string[] | null | undefined>>
export type OrderPhone = { billingPhone?: string | null; dateGmt?: string | Date | null }

/** First non-empty value of a meta key (repeated keys arrive as arrays). */
export function metaValue(meta: MetaBag | undefined, key: string): string | null {
  const v = meta?.[key]
  const list = Array.isArray(v) ? v : [v]
  for (const item of list) {
    if (typeof item === 'string' && item.trim() !== '') return item.trim()
  }
  return null
}

/**
 * Picks a user's login phone in the ADR 011 priority order: `digits_phone` → `digt_countrycode`+`digits_phone_no`
 * → `mobile` → `phone_number` → `billing_phone` → billing phone of the latest order. Each candidate goes through
 * `normalizeIranMobile`; non-Iranian numbers count as invalid (the user is held, not guessed).
 */
export function pickPhone(meta: MetaBag | undefined, orders: readonly OrderPhone[] = []): PickedPhone {
  const candidates: PhoneCandidate[] = []
  const push = (source: PhoneSource, value: string | null) => {
    if (value) candidates.push({ source, value })
  }
  push('digits_phone', metaValue(meta, 'digits_phone'))
  const number = metaValue(meta, 'digits_phone_no')
  if (number) {
    const cc = toLatinDigits(metaValue(meta, 'digt_countrycode') ?? '').replace(/[^\d+]/g, '')
    push('digits_phone_no', cc ? `${cc.startsWith('+') ? cc : `+${cc}`}${number.replace(/^0+/, '')}` : number)
  }
  push('mobile', metaValue(meta, 'mobile'))
  push('phone_number', metaValue(meta, 'phone_number'))
  push('billing_phone', metaValue(meta, 'billing_phone'))
  const latest = [...orders]
    .filter((o) => typeof o.billingPhone === 'string' && o.billingPhone.trim() !== '')
    .sort((a, b) => dateValue(b.dateGmt) - dateValue(a.dateGmt))[0]
  if (latest?.billingPhone) push('order_billing_phone', latest.billingPhone.trim())

  const invalid: PhoneCandidate[] = []
  for (const c of candidates) {
    const phone = normalizeIranMobile(c.value)
    if (phone) return { phone, source: c.source, invalidCandidates: invalid }
    invalid.push(c)
  }
  return { phone: null, source: null, invalidCandidates: invalid }
}

function dateValue(d: string | Date | null | undefined): number {
  if (!d) return 0
  const t = d instanceof Date ? d.getTime() : (parseWpDateGmt(d, null, 0)?.getTime() ?? Date.parse(d))
  return Number.isFinite(t) ? t : 0
}

// ---------------------------------------------------------------- Persian text

/**
 * Arabic ي/ى → Persian ی, ك → ک, Unicode NFC. ZWNJ (نیم‌فاصله) is kept. Use on every imported title/name.
 */
export function normalisePersianText(input: string): string {
  return input.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').normalize('NFC')
}

/** Key for exact title matching: Persian-normalised, ZWNJ/whitespace collapsed to one space, Latin lower-cased. */
export function titleMatchKey(input: string): string {
  return normalisePersianText(toLatinDigits(input))
    .replace(/[‌ ]/g, ' ')
    .replace(/[​‍‎‏﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// ---------------------------------------------------------------- National code (کد ملی)

/** Iranian national code checksum. Accepts Persian digits, spaces and dashes; 8–9 digit codes are left-padded. */
export function isValidIranNationalCode(input: string): boolean {
  const digits = toLatinDigits(input).replace(/[\s-]/g, '')
  if (!/^\d{8,10}$/.test(digits)) return false
  const code = digits.padStart(10, '0')
  if (/^(\d)\1{9}$/.test(code)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(code[i]) * (10 - i)
  const r = sum % 11
  const check = Number(code[9])
  return r < 2 ? check === r : check === 11 - r
}

/** Normalised 10-digit national code, or null when invalid. */
export function normaliseIranNationalCode(input: string): string | null {
  if (!isValidIranNationalCode(input)) return null
  return toLatinDigits(input).replace(/[\s-]/g, '').padStart(10, '0')
}

// ---------------------------------------------------------------- Dates

const WP_DATE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/

function parseWpLocal(value: string | null | undefined): number | null {
  if (!value) return null
  const m = WP_DATE.exec(value.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0)) as [number, number, number, number, number, number]
  if (y === 0 || mo === 0 || d === 0) return null // 0000-00-00 00:00:00
  const t = Date.UTC(y, mo - 1, d, h, mi, s)
  return Number.isFinite(t) ? t : null
}

/**
 * WordPress date columns → UTC Date. Uses the `*_gmt` column; when it is zero (`0000-00-00 00:00:00`, drafts) or
 * missing, falls back to the local column minus `gmtOffset` hours (manifest `site.gmtOffset`, e.g. 3.5).
 * Returns null when neither is usable. ISO strings with `Z`/offset are honoured as-is.
 */
export function parseWpDateGmt(gmt: string | null | undefined, local?: string | null, gmtOffset: number | string = 0): Date | null {
  const iso = (v: string | null | undefined): number | null => {
    if (!v || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(v.trim()) || !/^\d{4}-/.test(v.trim())) return null
    const t = Date.parse(v.trim())
    return Number.isFinite(t) ? t : null
  }
  const g = iso(gmt) ?? parseWpLocal(gmt)
  if (g !== null) return new Date(g)
  const l = iso(local) ?? parseWpLocal(local)
  if (l === null) return null
  const offset = Number(gmtOffset)
  return new Date(l - (Number.isFinite(offset) ? offset : 0) * 3_600_000)
}

// ---------------------------------------------------------------- Durations

const UNIT_MINUTES: ReadonlyArray<[RegExp, number]> = [
  [/^(h|hr|hrs|hour|hours|ساعت)$/, 60],
  [/^(m|min|mins|minute|minutes|دقیقه)$/, 1],
  [/^(s|sec|secs|second|seconds|ثانیه)$/, 1 / 60],
]

/**
 * Lesson duration text → whole minutes (rounded, at least 1 for a non-zero duration), or null.
 * "۱۲:۳۰" = 12 min 30 s (mm:ss), "1:02:30" = h:mm:ss, "10 minute", "1 hour", "۲ ساعت و ۱۵ دقیقه", "45" (minutes).
 * Days/weeks (course lengths) are not lesson durations → null.
 */
export function parseDurationMinutes(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? Math.round(input) : null
  const text = normalisePersianText(toLatinDigits(input)).replace(/٫/g, '.').trim().toLowerCase()
  if (!text) return null
  const finish = (minutes: number) => (minutes <= 0 ? 0 : Math.max(1, Math.round(minutes)))

  const clock = /^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/.exec(text)
  if (clock) {
    const [a, b, c] = [Number(clock[1]), Number(clock[2]), clock[3] === undefined ? null : Number(clock[3])]
    if (b > 59 || (c !== null && c > 59)) return null
    return finish(c === null ? a + b / 60 : a * 60 + b + c / 60)
  }
  if (/^\d+(\.\d+)?$/.test(text)) return finish(Number(text))

  const spoken = text.replace(/\s+(و|and|,)\s+/g, ' ')
  if (!/^(\s*\d+(?:\.\d+)?\s*[a-z؀-ۿ]+)+\s*$/.test(spoken)) return null
  let total = 0
  for (const m of spoken.matchAll(/(\d+(?:\.\d+)?)\s*([a-z؀-ۿ]+)/g)) {
    const unit = UNIT_MINUTES.find(([re]) => re.test(m[2] ?? ''))
    if (!unit) return null
    total += Number(m[1]) * unit[1]
  }
  return finish(total)
}

// ---------------------------------------------------------------- Legacy URLs (redirects)

/** WP query URLs on `/` that identify one object; kept by `normaliseLegacyPath`. */
const WP_QUERY_KEYS = ['p', 'page_id', 'attachment_id', 'product', 'course', 'lesson', 'post_type'] as const

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Normalises an old WordPress URL or path for redirect lookup (ADR 011 §Redirects serving): drops scheme/host,
 * hash and query, `decodeURIComponent` per segment, NFC, Persian ی/ک, lower-case Latin, collapses `//`,
 * strips the trailing slash (root stays `/`). On the root path a WP object query is kept in a canonical form,
 * e.g. `https://x.ir/?utm_source=a&p=12` → `/?p=12` (`post_type` keeps its `name`/`p` partner).
 */
export function normaliseLegacyPath(urlOrPath: string): string {
  let input = urlOrPath.trim()
  let query = ''
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) || input.startsWith('//')
  if (absolute) {
    const withoutScheme = input.replace(/^[a-z][a-z0-9+.-]*:/i, '').replace(/^\/\/[^/?#]*/, '')
    input = withoutScheme || '/'
  }
  const hash = input.indexOf('#')
  if (hash >= 0) input = input.slice(0, hash)
  const q = input.indexOf('?')
  if (q >= 0) {
    query = input.slice(q + 1)
    input = input.slice(0, q)
  }
  const segments = input
    .split('/')
    .filter((s) => s !== '')
    .map((s) => normalisePersianText(safeDecode(s)).toLowerCase())
  const path = `/${segments.join('/')}`
  if (path !== '/' || !query) return path

  const params = new Map<string, string>()
  for (const pair of query.split('&')) {
    const [k, v = ''] = pair.split('=')
    if (k) params.set(safeDecode(k.replace(/\+/g, ' ')).toLowerCase(), normalisePersianText(safeDecode(v.replace(/\+/g, ' '))).toLowerCase())
  }
  for (const key of WP_QUERY_KEYS) {
    const value = params.get(key)
    if (!value) continue
    if (key === 'post_type') {
      const partner = params.get('name') ? `name=${params.get('name')}` : params.get('p') ? `p=${params.get('p')}` : null
      return partner ? `/?post_type=${value}&${partner}` : '/'
    }
    return `/?${key}=${value}`
  }
  return '/'
}
