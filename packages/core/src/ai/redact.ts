/**
 * PII redaction for everything that leaves the server towards an AI provider (ADR 018 §Privacy).
 * Pure functions; the web app applies them to prompts, page context and tool results.
 */
import { toLatinDigits } from '../digits'

export type PrivacyPolicy = {
  /** Student names (structured name fields). Default: sent. */
  names: boolean
  /** National codes (کد ملی). Default: redacted. */
  nationalCodes: boolean
  /** Mobile and phone numbers. Default: redacted. */
  phones: boolean
  /** Email addresses. Default: redacted. */
  emails: boolean
}

export const DEFAULT_PRIVACY: PrivacyPolicy = { names: true, nationalCodes: false, phones: false, emails: false }

export const REDACTION_LABELS = {
  name: '[نام]',
  nationalCode: '[کد ملی]',
  phone: '[تلفن]',
  email: '[ایمیل]',
  card: '[کارت بانکی]',
  iban: '[شبا]',
} as const

/** Normalises a stored policy (missing keys fall back to the defaults). */
export function privacyPolicy(input: Partial<Record<keyof PrivacyPolicy, boolean | null | undefined>> | null | undefined): PrivacyPolicy {
  const pick = (k: keyof PrivacyPolicy) => (typeof input?.[k] === 'boolean' ? (input[k] as boolean) : DEFAULT_PRIVACY[k])
  return { names: pick('names'), nationalCodes: pick('nationalCodes'), phones: pick('phones'), emails: pick('emails') }
}

/** Iranian national code checksum (10 digits). */
export function isValidNationalCode(code: string): boolean {
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits[9]!
  const sum = digits.slice(0, 9).reduce((acc, d, i) => acc + d * (10 - i), 0) % 11
  return sum < 2 ? check === sum : check === 11 - sum
}

function luhn(num: string): boolean {
  let sum = 0
  let alt = false
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i])
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// +98 / 0098 / 0 followed by 9xx…; separators (space, dash, dot) allowed between groups.
const MOBILE = /(?<![\d])(?:\+98|0098|0)?[\s-]?9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?![\d])/g
// Landlines with an area code: 0 + 2 digits + 8 digits.
const LANDLINE = /(?<![\d])0\d{2}[\s-]?\d{8}(?![\d])/g
const CARD = /(?<![\d])\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?![\d])/g
const IBAN = /\bIR[\s-]?\d{2}(?:[\s-]?\d{4}){5}[\s-]?\d{2}\b/gi
const TEN_DIGITS = /(?<![\d])\d{3}[\s-]?\d{6}[\s-]?\d(?![\d])/g

/**
 * Redacts PII in free text. Persian/Arabic digits are matched too (the text is scanned in Latin digits, and the
 * replacement keeps the original text everywhere else). Cards and IBANs are always redacted.
 */
export function redactText(text: string, policy: PrivacyPolicy = DEFAULT_PRIVACY): string {
  if (!text) return text
  // Latin-digit mirror of the text: same length, so match offsets line up with the original.
  const latin = toLatinDigits(text)
  type Hit = { start: number; end: number; label: string }
  const hits: Hit[] = []
  const scan = (re: RegExp, label: string, accept: (m: string) => boolean = () => true) => {
    for (const m of latin.matchAll(re)) {
      const start = m.index ?? 0
      if (accept(m[0])) hits.push({ start, end: start + m[0].length, label })
    }
  }
  scan(IBAN, REDACTION_LABELS.iban)
  scan(CARD, REDACTION_LABELS.card, (m) => luhn(m.replace(/\D/g, '')))
  if (!policy.emails) scan(EMAIL, REDACTION_LABELS.email)
  if (!policy.phones) {
    scan(MOBILE, REDACTION_LABELS.phone)
    scan(LANDLINE, REDACTION_LABELS.phone)
  }
  if (!policy.nationalCodes) scan(TEN_DIGITS, REDACTION_LABELS.nationalCode, (m) => isValidNationalCode(m.replace(/\D/g, '')))
  if (hits.length === 0) return text
  // First match wins where they overlap (IBAN/card before phone before national code).
  hits.sort((a, b) => a.start - b.start)
  let out = ''
  let at = 0
  for (const h of hits) {
    if (h.start < at) continue
    out += text.slice(at, h.start) + h.label
    at = h.end
  }
  return out + text.slice(at)
}

const NAME_FIELDS = new Set(['name', 'firstName', 'lastName', 'fullName', 'studentName', 'advisorName', 'displayName'])
const NATIONAL_FIELDS = new Set(['nationalCode', 'nationalId', 'national_code'])
const PHONE_FIELDS = new Set(['mobile', 'phone', 'phoneNumber', 'tel', 'landline'])
const EMAIL_FIELDS = new Set(['email', 'actorEmail', 'contactEmail'])
/** Never sent, whatever the policy. */
const SECRET_FIELDS = new Set(['password', 'hash', 'salt', 'sessions', 'twoFactor', 'apiKey', 'apiKeySealed', 'resetPasswordToken', 'zarinpalMerchantId', 'cardNumber', 'iban'])

/**
 * Redacts a structured record (tool results, page context): known PII fields by name, every other string by text
 * rules. Secret fields are dropped. Depth-limited so a cyclic or huge object cannot blow up.
 */
export function redactRecord(value: unknown, policy: PrivacyPolicy = DEFAULT_PRIVACY, depth = 0): unknown {
  if (depth > 8) return '[…]'
  if (typeof value === 'string') return redactText(value, policy)
  if (Array.isArray(value)) return value.map((v) => redactRecord(v, policy, depth + 1))
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_FIELDS.has(k)) continue
    if (v == null || v === '') {
      out[k] = v
      continue
    }
    if (NAME_FIELDS.has(k) && !policy.names && typeof v === 'string') out[k] = REDACTION_LABELS.name
    else if (NATIONAL_FIELDS.has(k) && !policy.nationalCodes) out[k] = REDACTION_LABELS.nationalCode
    else if (PHONE_FIELDS.has(k) && !policy.phones) out[k] = REDACTION_LABELS.phone
    else if (EMAIL_FIELDS.has(k) && !policy.emails) out[k] = REDACTION_LABELS.email
    else out[k] = redactRecord(v, policy, depth + 1)
  }
  return out
}
