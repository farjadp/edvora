import { checkFourEyes, type Id } from './access'
import { toLatinDigits } from './digits'
import { rial, type Rial } from './money'

/**
 * Payment rules (ADR 017). Pure functions shared by the checkout, the gateway callback and the finance desk.
 * Money is integer rials; USDT is an integer in the token's smallest unit (bigint).
 */

// ---------------------------------------------------------------- Methods

export type PaymentMethodKind = 'gateway' | 'usdt' | 'card' | 'manual'
export const PAYMENT_METHOD_KEYS = ['mellat', 'saman', 'zarinpal', 'zibal', 'idpay', 'payir', 'nextpay', 'usdt', 'card', 'manual'] as const
export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number]

export type PaymentMethodInfo = {
  kind: PaymentMethodKind
  /** Shaparak member bank (direct) or an intermediary (PSP) gateway. */
  family?: 'shaparak' | 'intermediary'
  label: { fa: string; en: string }
  /** Shown to students at checkout. Manual payments are recorded by staff only. */
  studentFacing: boolean
  /** A person must record it and a different person confirm it (four-eyes). */
  needsTwoPeople: boolean
}

export const PAYMENT_METHODS: Readonly<Record<PaymentMethodKey, PaymentMethodInfo>> = {
  mellat: { kind: 'gateway', family: 'shaparak', label: { fa: 'درگاه بانک ملت (به‌پرداخت)', en: 'Behpardakht Mellat' }, studentFacing: true, needsTwoPeople: false },
  saman: { kind: 'gateway', family: 'shaparak', label: { fa: 'درگاه بانک سامان (سپ)', en: 'Saman (SEP)' }, studentFacing: true, needsTwoPeople: false },
  zarinpal: { kind: 'gateway', family: 'intermediary', label: { fa: 'زرین‌پال', en: 'Zarinpal' }, studentFacing: true, needsTwoPeople: false },
  zibal: { kind: 'gateway', family: 'intermediary', label: { fa: 'زیبال', en: 'Zibal' }, studentFacing: true, needsTwoPeople: false },
  idpay: { kind: 'gateway', family: 'intermediary', label: { fa: 'آیدی‌پی', en: 'IDPay' }, studentFacing: true, needsTwoPeople: false },
  payir: { kind: 'gateway', family: 'intermediary', label: { fa: 'پی‌دات‌آی‌آر', en: 'Pay.ir' }, studentFacing: true, needsTwoPeople: false },
  nextpay: { kind: 'gateway', family: 'intermediary', label: { fa: 'نکست‌پی', en: 'NextPay' }, studentFacing: true, needsTwoPeople: false },
  usdt: { kind: 'usdt', label: { fa: 'تتر (USDT)', en: 'Tether (USDT)' }, studentFacing: true, needsTwoPeople: false },
  card: { kind: 'card', label: { fa: 'کارت‌به‌کارت', en: 'Card-to-card' }, studentFacing: true, needsTwoPeople: true },
  manual: { kind: 'manual', label: { fa: 'ثبت دستی (نقدی، کارت‌خوان، واریز)', en: 'Manual (cash, POS, transfer)' }, studentFacing: false, needsTwoPeople: true },
}

export const isPaymentMethodKey = (v: unknown): v is PaymentMethodKey => typeof v === 'string' && (PAYMENT_METHOD_KEYS as readonly string[]).includes(v)

export const MANUAL_CHANNELS = {
  cash: 'نقدی',
  pos: 'کارت‌خوان',
  transfer: 'واریز بانکی (پایا/ساتنا)',
  other: 'سایر',
} as const
export type ManualChannel = keyof typeof MANUAL_CHANNELS

// ---------------------------------------------------------------- Status

export type PaymentStatus = 'started' | 'submitted' | 'recorded' | 'confirmed' | 'rejected' | 'failed'

/** Waiting for a person. While one of these covers an instalment, that instalment cannot be paid again. */
export const AWAITING_REVIEW: readonly PaymentStatus[] = ['submitted', 'recorded']

export const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatus, { student: string; staff: string; tone: 'neutral' | 'warn' | 'info' | 'ok' | 'danger' }>> = {
  started: { student: 'در جریان', staff: 'آغاز شده', tone: 'neutral' },
  submitted: { student: 'در انتظار بررسی', staff: 'در انتظار بررسی اول', tone: 'warn' },
  recorded: { student: 'در انتظار تأیید', staff: 'در انتظار تأیید نفر دوم', tone: 'info' },
  confirmed: { student: 'تأیید شد', staff: 'تأیید شده', tone: 'ok' },
  rejected: { student: 'تأیید نشد', staff: 'رد شده', tone: 'danger' },
  failed: { student: 'ناموفق', staff: 'ناموفق', tone: 'danger' },
}

// ---------------------------------------------------------------- Instalments → amount

export type InstalmentRow = { index: number; amount: number; status?: string | null; paidAt?: string | Date | null }

export type InstalmentPick = 'next' | 'all' | readonly number[]

export type SelectInstalmentsResult =
  | { ok: true; indexes: number[]; amount: Rial }
  | { ok: false; reason: 'nothing_due' | 'unknown_instalment' | 'already_paid' | 'awaiting_review' }

/**
 * Which instalments a payment covers and how much it is. The server computes the amount from the order; nobody types it.
 * `awaiting` = instalment indexes already covered by a payment waiting for review (no double payment).
 */
export function selectInstalments(instalments: readonly InstalmentRow[], pick: InstalmentPick, awaiting: ReadonlySet<number> = new Set()): SelectInstalmentsResult {
  const unpaid = [...instalments].filter((i) => i.status !== 'paid').sort((a, b) => a.index - b.index)
  let chosen: InstalmentRow[]
  if (pick === 'next') {
    const next = unpaid[0]
    if (!next) return { ok: false, reason: 'nothing_due' }
    chosen = [next]
  } else if (pick === 'all') {
    if (unpaid.length === 0) return { ok: false, reason: 'nothing_due' }
    chosen = unpaid
  } else {
    if (pick.length === 0) return { ok: false, reason: 'nothing_due' }
    chosen = []
    for (const idx of new Set(pick)) {
      const row = instalments.find((i) => i.index === idx)
      if (!row) return { ok: false, reason: 'unknown_instalment' }
      if (row.status === 'paid') return { ok: false, reason: 'already_paid' }
      chosen.push(row)
    }
    chosen.sort((a, b) => a.index - b.index)
  }
  if (chosen.some((i) => awaiting.has(i.index))) return { ok: false, reason: 'awaiting_review' }
  const amount = chosen.reduce((sum, i) => sum + rial(i.amount), 0)
  return { ok: true, indexes: chosen.map((i) => i.index), amount: rial(amount) }
}

/** Sum of the given instalments right now (the callback re-checks the attempt against it). */
export function amountOfInstalments(instalments: readonly InstalmentRow[], indexes: readonly number[]): Rial | null {
  let sum = 0
  for (const idx of indexes) {
    const row = instalments.find((i) => i.index === idx)
    if (!row) return null
    sum += rial(row.amount)
  }
  return rial(sum)
}

export type ApplyResult =
  | { ok: true; instalments: InstalmentRow[]; status: 'paid' | 'partially_paid'; firstPayment: boolean }
  | { ok: false; reason: 'unknown_instalment' | 'already_paid' }

/** Marks instalments paid for a confirmed payment. Refuses if any of them is already paid (never pay twice). */
export function applyConfirmedPayment(instalments: readonly InstalmentRow[], indexes: readonly number[], paidAt: Date): ApplyResult {
  if (indexes.length === 0) return { ok: false, reason: 'unknown_instalment' }
  for (const idx of indexes) {
    const row = instalments.find((i) => i.index === idx)
    if (!row) return { ok: false, reason: 'unknown_instalment' }
    if (row.status === 'paid') return { ok: false, reason: 'already_paid' }
  }
  const firstPayment = !instalments.some((i) => i.status === 'paid')
  const set = new Set(indexes)
  const next = instalments.map((i) => (set.has(i.index) ? { ...i, status: 'paid', paidAt: paidAt.toISOString() } : i))
  return { ok: true, instalments: next, status: next.every((i) => i.status === 'paid') ? 'paid' : 'partially_paid', firstPayment }
}

// ---------------------------------------------------------------- Four-eyes

export type PaymentAction = 'record' | 'confirm' | 'reject'

export type PaymentForCheck = {
  status: PaymentStatus
  method: PaymentMethodKey
  /** The student who owns the order. */
  studentId: Id
  recordedBy?: Id | null
}

export type PaymentActor = { id: Id; canRecord: boolean; canApprove: boolean }

export type PaymentActionReason = 'wrong_status' | 'own_order' | 'same_person' | 'not_permitted' | 'reason_required' | 'missing_recorder'
export type PaymentActionDecision = { ok: true } | { ok: false; reason: PaymentActionReason }

export const REJECTION_REASON_MIN = 5
export const REJECTION_REASON_MAX = 500

const sameId = (a: Id | null | undefined, b: Id | null | undefined) => a != null && b != null && String(a) === String(b)

/**
 * May this person record, confirm or reject this payment? (ADR 006 four-eyes, ADR 017 §3.)
 * - record: `submitted` → `recorded`, needs `payments.manual.record`.
 * - confirm: `recorded` → `confirmed`, needs `payments.manual.approve`, never the recorder.
 * - reject: `submitted | recorded` → `rejected`, needs record or approve and a reason.
 * Nobody acts on a payment for their own order.
 */
export function checkPaymentAction(action: PaymentAction, p: PaymentForCheck, actor: PaymentActor, reason?: string | null): PaymentActionDecision {
  if (sameId(p.studentId, actor.id)) return { ok: false, reason: 'own_order' }
  switch (action) {
    case 'record':
      if (p.status !== 'submitted') return { ok: false, reason: 'wrong_status' }
      return actor.canRecord ? { ok: true } : { ok: false, reason: 'not_permitted' }
    case 'confirm': {
      if (p.status !== 'recorded') return { ok: false, reason: 'wrong_status' }
      const fe = checkFourEyes({ makerId: p.recordedBy, checkerId: actor.id, checkerAllowed: actor.canApprove })
      if (!fe.ok) return { ok: false, reason: fe.reason === 'missing-maker' ? 'missing_recorder' : fe.reason === 'same-person' ? 'same_person' : 'not_permitted' }
      return { ok: true }
    }
    case 'reject': {
      if (!AWAITING_REVIEW.includes(p.status)) return { ok: false, reason: 'wrong_status' }
      if (!actor.canRecord && !actor.canApprove) return { ok: false, reason: 'not_permitted' }
      const text = (reason ?? '').trim()
      if (text.length < REJECTION_REASON_MIN || text.length > REJECTION_REASON_MAX) return { ok: false, reason: 'reason_required' }
      return { ok: true }
    }
  }
}

/** Actions to offer this person (the server checks again on submit). Reject is offered without a reason yet. */
export function paymentActionsFor(p: PaymentForCheck, actor: PaymentActor): PaymentAction[] {
  return (['record', 'confirm', 'reject'] as const).filter((a) => checkPaymentAction(a, p, actor, a === 'reject' ? 'x'.repeat(REJECTION_REASON_MIN) : null).ok)
}

/** Staff can record a manual payment (it starts as `recorded`; a second person confirms). */
export function checkManualRecord(input: { studentId: Id; actor: PaymentActor }): PaymentActionDecision {
  if (sameId(input.studentId, input.actor.id)) return { ok: false, reason: 'own_order' }
  return input.actor.canRecord ? { ok: true } : { ok: false, reason: 'not_permitted' }
}

export const PAYMENT_ACTION_ERRORS: Readonly<Record<PaymentActionReason, string>> = {
  wrong_status: 'وضعیت این پرداخت تغییر کرده است. صفحه را تازه کنید.',
  own_order: 'پرداخت سفارش خودتان را نمی‌توانید ثبت یا تأیید کنید.',
  same_person: 'کسی که پرداخت را ثبت کرده نمی‌تواند خودش آن را تأیید کند. نفر دوم باید تأیید کند.',
  not_permitted: 'نقش شما اجازهٔ این کار را ندارد.',
  reason_required: `دلیل رد را بنویسید (دست‌کم ${REJECTION_REASON_MIN} نویسه).`,
  missing_recorder: 'این پرداخت هنوز توسط نفر اول ثبت نشده است.',
}

// ---------------------------------------------------------------- Gateway result

/**
 * A verified gateway payment counts only if the attempt still matches the order and the gateway reports the same
 * amount (when it reports one). A mismatch is a failure even if the gateway says "paid".
 */
export function checkGatewayResult(input: { attemptAmount: number; dueAmount: number | null; reportedAmount?: number | null }): { ok: true } | { ok: false; reason: 'amount_mismatch' | 'order_changed' } {
  if (input.dueAmount === null || input.dueAmount !== input.attemptAmount) return { ok: false, reason: 'order_changed' }
  if (input.reportedAmount != null && input.reportedAmount !== input.attemptAmount) return { ok: false, reason: 'amount_mismatch' }
  return { ok: true }
}

// ---------------------------------------------------------------- Reuse keys (unique in the database)

export const reuseKey = {
  gatewayAttempt: (provider: string, authority: string) => `gw:${provider}:${authority}`,
  gatewayRef: (provider: string, refId: string) => `ref:${provider}:${refId}`,
  tx: (network: UsdtNetwork, hash: string) => `tx:${network}:${hash.toLowerCase()}`,
  card: (tenantId: Id, tracking: string) => `card:${tenantId}:${tracking}`,
}

// ---------------------------------------------------------------- Tether (USDT)

export type UsdtNetwork = 'trc20' | 'bep20'
export const USDT_NETWORK_KEYS: readonly UsdtNetwork[] = ['trc20', 'bep20']

/** Mainnet USDT contracts. Sandbox mode reads testnet contracts from env (the app passes them in). */
export const USDT_TOKENS: Readonly<Record<UsdtNetwork, { contract: string; decimals: number; minConfirmations: number; label: string; chain: string }>> = {
  trc20: { contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, minConfirmations: 19, label: 'TRC20', chain: 'ترون (TRON)' },
  bep20: { contract: '0x55d398326f99059ff775485246999027b3197955', decimals: 18, minConfirmations: 15, label: 'BEP20', chain: 'بایننس اسمارت چین (BSC)' },
}

export type UsdtQuote = {
  /** Whole cents of USDT (1 USDT = 100). */
  cents: number
  /** Smallest token unit (TRC20: 1e-6, BEP20: 1e-18). */
  units: bigint
  /** "12.34" */
  display: string
}

/**
 * Converts rials to USDT at the academy's hand-set rate (rials per 1 USDT, integer). Rounds UP to the cent so the
 * academy never receives less than the price.
 */
export function usdtQuote(amount: Rial, rialPerUsdt: number, decimals: number): UsdtQuote {
  if (!Number.isSafeInteger(rialPerUsdt) || rialPerUsdt <= 0) throw new RangeError('USDT rate must be a positive integer number of rials')
  if (!Number.isInteger(decimals) || decimals < 2 || decimals > 30) throw new RangeError('Token decimals must be 2–30')
  const num = BigInt(amount) * 100n
  const den = BigInt(rialPerUsdt)
  const centsBig = (num + den - 1n) / den
  if (centsBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Amount too large')
  const cents = Number(centsBig)
  return { cents, units: centsBig * 10n ** BigInt(decimals - 2), display: formatUsdtCents(cents) }
}

export function formatUsdtCents(cents: number): string {
  const whole = Math.floor(cents / 100)
  const frac = String(cents % 100).padStart(2, '0')
  return `${whole.toLocaleString('en-US')}.${frac}`
}

/** Smallest units → "12.345678" (trailing zeros trimmed, at least 2 decimals). */
export function formatTokenUnits(units: bigint, decimals: number): string {
  const neg = units < 0n
  const abs = neg ? -units : units
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  let frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  if (frac.length < 2) frac = frac.padEnd(2, '0')
  return `${neg ? '-' : ''}${whole.toString()}.${frac}`
}

/** Canonical tx hash per network, or null when it cannot be one. TRON: 64 hex, no 0x. BSC: 0x + 64 hex. */
export function normaliseTxHash(network: UsdtNetwork, raw: string): string | null {
  const s = toLatinDigits(raw).trim().toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{64}$/.test(s)) return null
  return network === 'trc20' ? s : `0x${s}`
}

const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/
const BSC_ADDRESS = /^0x[0-9a-fA-F]{40}$/

/** Format check (TRON checksum is verified in the integration layer). */
export function looksLikeWallet(network: UsdtNetwork, address: string): boolean {
  return network === 'trc20' ? TRON_ADDRESS.test(address.trim()) : BSC_ADDRESS.test(address.trim())
}

/** TRON base58 is case-sensitive; EVM hex is not. */
export function normaliseWallet(network: UsdtNetwork, address: string): string {
  const a = address.trim()
  return network === 'bep20' ? a.toLowerCase() : a
}

export type UsdtExpectation = {
  network: UsdtNetwork
  tokenContract: string
  recipient: string
  minUnits: bigint
  minConfirmations: number
  /** When the quote was made. A transfer mined before it cannot be this payment. */
  quotedAt: Date
}

/** What a chain verifier saw (same shape as the integrations `ChainLookup`). */
export type UsdtObservation =
  | { found: false }
  | {
      found: true
      success: boolean
      confirmations: number
      timestamp: Date
      transfers: readonly { tokenContract: string; from: string; to: string; amount: bigint }[]
    }

export type UsdtCheck =
  | { result: 'confirmed'; units: bigint; from: string }
  | { result: 'waiting'; reason: 'not_found' | 'confirmations'; confirmations?: number }
  | { result: 'failed'; reason: 'tx_failed' | 'wrong_token' | 'wrong_recipient' | 'amount_low' | 'too_old' }

/** Allowed clock difference between our server and the chain's block time. */
const CLOCK_SKEW_MS = 10 * 60 * 1000

/**
 * Decides an on-chain USDT payment: right network and token, to the academy wallet, at least the quoted amount,
 * enough confirmations, not older than the quote. (Hash reuse is refused by the unique `reuseKey`.)
 */
export function checkUsdtTransfer(expect: UsdtExpectation, seen: UsdtObservation): UsdtCheck {
  if (!seen.found) return { result: 'waiting', reason: 'not_found' }
  if (!seen.success) return { result: 'failed', reason: 'tx_failed' }
  const contract = normaliseWallet(expect.network, expect.tokenContract)
  const recipient = normaliseWallet(expect.network, expect.recipient)
  const token = seen.transfers.filter((t) => normaliseWallet(expect.network, t.tokenContract) === contract)
  if (token.length === 0) return { result: 'failed', reason: 'wrong_token' }
  const mine = token.filter((t) => normaliseWallet(expect.network, t.to) === recipient)
  if (mine.length === 0) return { result: 'failed', reason: 'wrong_recipient' }
  const units = mine.reduce((sum, t) => sum + t.amount, 0n)
  if (units < expect.minUnits) return { result: 'failed', reason: 'amount_low' }
  if (seen.timestamp.getTime() < expect.quotedAt.getTime() - CLOCK_SKEW_MS) return { result: 'failed', reason: 'too_old' }
  if (seen.confirmations < expect.minConfirmations) return { result: 'waiting', reason: 'confirmations', confirmations: seen.confirmations }
  return { result: 'confirmed', units, from: mine[0]!.from }
}

export const USDT_CHECK_MESSAGES: Readonly<Record<'not_found' | 'confirmations' | 'tx_failed' | 'wrong_token' | 'wrong_recipient' | 'amount_low' | 'too_old' | 'reused' | 'unavailable', string>> = {
  not_found: 'تراکنش هنوز در شبکه پیدا نشد. چند دقیقهٔ دیگر دوباره بررسی کنید.',
  confirmations: 'تراکنش پیدا شد و منتظر تأییدهای شبکه است. چند دقیقهٔ دیگر دوباره بررسی کنید.',
  tx_failed: 'این تراکنش در شبکه ناموفق ثبت شده است.',
  wrong_token: 'این تراکنش انتقال تتر روی این شبکه نیست.',
  wrong_recipient: 'مقصد این تراکنش کیف پول آکادمی نیست.',
  amount_low: 'مبلغ این تراکنش از مبلغ اعلام‌شده کمتر است.',
  too_old: 'این تراکنش پیش از صدور این صورت‌حساب انجام شده است.',
  reused: 'این شناسهٔ تراکنش قبلاً برای پرداخت دیگری ثبت شده است.',
  unavailable: 'بررسی خودکار شبکه الان در دسترس نیست. پرداخت شما برای بررسی کارشناسان مالی ثبت شد.',
}

// ---------------------------------------------------------------- Card-to-card

/** Luhn check on a 16-digit Iranian card number. */
export function isValidCardNumber(raw: string): boolean {
  const d = toLatinDigits(raw).replace(/[\s-]/g, '')
  if (!/^\d{16}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 16; i++) {
    let n = Number(d[15 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

/** "6037991234567890" → "6037-9912-3456-7890" (shown LTR). */
export function formatCardNumber(raw: string): string {
  const d = toLatinDigits(raw).replace(/\D/g, '')
  return d.replace(/(\d{4})(?=\d)/g, '$1-')
}

export type CardEvidenceInput = { last4: string; tracking: string; paidAt: string | Date; now?: Date }
export type CardEvidence = { last4: string; tracking: string; paidAt: Date }

/** How far back a card-to-card transfer may be reported. */
export const CARD_TRANSFER_MAX_AGE_DAYS = 30

export function checkCardEvidence(input: CardEvidenceInput): { ok: true; value: CardEvidence } | { ok: false; field: 'last4' | 'tracking' | 'paidAt'; message: string } {
  const last4 = toLatinDigits(input.last4 ?? '').replace(/\s/g, '')
  if (!/^\d{4}$/.test(last4)) return { ok: false, field: 'last4', message: '۴ رقم آخر کارتی را که از آن پرداخت کرده‌اید وارد کنید.' }
  const tracking = toLatinDigits(input.tracking ?? '').replace(/[\s-]/g, '')
  if (!/^\d{4,20}$/.test(tracking)) return { ok: false, field: 'tracking', message: 'شمارهٔ پیگیری یا مرجع رسید را فقط با رقم وارد کنید.' }
  const paidAt = input.paidAt instanceof Date ? input.paidAt : new Date(input.paidAt)
  const now = input.now ?? new Date()
  if (Number.isNaN(paidAt.getTime())) return { ok: false, field: 'paidAt', message: 'زمان واریز را وارد کنید.' }
  if (paidAt.getTime() > now.getTime() + CLOCK_SKEW_MS) return { ok: false, field: 'paidAt', message: 'زمان واریز نمی‌تواند در آینده باشد.' }
  if (now.getTime() - paidAt.getTime() > CARD_TRANSFER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
    return { ok: false, field: 'paidAt', message: 'این واریز قدیمی‌تر از یک ماه است. با پشتیبانی تماس بگیرید.' }
  }
  return { ok: true, value: { last4, tracking, paidAt } }
}
