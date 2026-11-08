/**
 * Per-user rate limit and per-academy monthly budget (ADR 018 §Limits). Pure: the web app counts from the database.
 * Money is integer rials.
 */
import { rial, type Rial } from '../money'

export type RateLimits = { perMinute: number; perDay: number }
export const DEFAULT_RATE_LIMITS: RateLimits = { perMinute: 20, perDay: 300 }

export type RateDecision = { ok: true } | { ok: false; reason: 'per-minute' | 'per-day'; retryAfterSec: number }

/** `sentLastMinute` / `sentToday` = the user's own messages in the window (before this one). */
export function rateDecision(counts: { sentLastMinute: number; sentToday: number }, limits: RateLimits = DEFAULT_RATE_LIMITS): RateDecision {
  if (limits.perDay > 0 && counts.sentToday >= limits.perDay) return { ok: false, reason: 'per-day', retryAfterSec: 3600 }
  if (limits.perMinute > 0 && counts.sentLastMinute >= limits.perMinute) return { ok: false, reason: 'per-minute', retryAfterSec: 60 }
  return { ok: true }
}

export type BudgetSettings = {
  /** 0 / null = no limit. */
  monthlyTokenLimit?: number | null
  /** Integer rials. 0 / null = no limit. */
  monthlyCostLimitRial?: number | null
  /** Integer rials per one million tokens, the academy's own prices. */
  inputPricePerMillionRial?: number | null
  outputPricePerMillionRial?: number | null
}

export type Usage = { inputTokens: number; outputTokens: number }

/** Cost of `usage` in integer rials (rounded up: never under-count spending). */
export function usageCost(usage: Usage, s: BudgetSettings): Rial {
  const inP = Math.max(0, s.inputPricePerMillionRial ?? 0)
  const outP = Math.max(0, s.outputPricePerMillionRial ?? 0)
  return rial(Math.ceil((usage.inputTokens * inP + usage.outputTokens * outP) / 1_000_000))
}

export type BudgetDecision = { ok: true; tokens: number; cost: Rial } | { ok: false; reason: 'tokens' | 'cost'; tokens: number; cost: Rial }

/** This month's usage against the academy's limits. */
export function budgetDecision(month: Usage, s: BudgetSettings): BudgetDecision {
  const tokens = month.inputTokens + month.outputTokens
  const cost = usageCost(month, s)
  if (s.monthlyTokenLimit && s.monthlyTokenLimit > 0 && tokens >= s.monthlyTokenLimit) return { ok: false, reason: 'tokens', tokens, cost }
  if (s.monthlyCostLimitRial && s.monthlyCostLimitRial > 0 && cost >= s.monthlyCostLimitRial) return { ok: false, reason: 'cost', tokens, cost }
  return { ok: true, tokens, cost }
}

/** Start of the calendar month (UTC) — the budget window. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** Rough token count for budgeting before the provider reports real usage (~4 chars per token, Persian ~2.5). */
export function estimateTokens(text: string): number {
  const persian = (text.match(/[؀-ۿ]/g) ?? []).length
  return Math.ceil(persian / 2.5 + (text.length - persian) / 4)
}

export const LIMIT_MESSAGES = {
  'per-minute': 'پیام‌های این دقیقه به سقف رسیده است؛ یک دقیقهٔ دیگر دوباره بفرستید.',
  'per-day': 'سقف پیام‌های امروز شما پر شده است؛ فردا دوباره امتحان کنید.',
  tokens: 'سقف مصرف ماهانهٔ دستیار در این آکادمی پر شده است. مدیر آکادمی می‌تواند سقف را در تنظیمات دستیار تغییر دهد.',
  cost: 'سقف هزینهٔ ماهانهٔ دستیار در این آکادمی پر شده است. مدیر آکادمی می‌تواند سقف را در تنظیمات دستیار تغییر دهد.',
} as const
