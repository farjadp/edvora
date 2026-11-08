import { describe, expect, it } from 'vitest'
import { ROLE_TEMPLATES } from './permissions'
import {
  PAYMENT_METHODS,
  applyConfirmedPayment,
  checkCardEvidence,
  checkGatewayResult,
  checkManualRecord,
  checkPaymentAction,
  checkUsdtTransfer,
  formatCardNumber,
  formatTokenUnits,
  isValidCardNumber,
  normaliseTxHash,
  paymentActionsFor,
  reuseKey,
  selectInstalments,
  usdtQuote,
  USDT_TOKENS,
  type PaymentForCheck,
  type UsdtExpectation,
} from './payments'
import { rial } from './money'

const plan = [
  { index: 0, amount: 38_400_000, status: 'paid' },
  { index: 1, amount: 19_200_000, status: 'pending' },
  { index: 2, amount: 19_200_000, status: 'pending' },
  { index: 3, amount: 19_200_000, status: 'pending' },
]

describe('selectInstalments (server-computed amount)', () => {
  it('next = the first unpaid instalment', () => {
    expect(selectInstalments(plan, 'next')).toEqual({ ok: true, indexes: [1], amount: 19_200_000 })
  })
  it('all = every unpaid instalment, summed in integer rials', () => {
    expect(selectInstalments(plan, 'all')).toEqual({ ok: true, indexes: [1, 2, 3], amount: 57_600_000 })
  })
  it('explicit indexes: refuses paid and unknown ones, ignores duplicates', () => {
    expect(selectInstalments(plan, [0])).toEqual({ ok: false, reason: 'already_paid' })
    expect(selectInstalments(plan, [9])).toEqual({ ok: false, reason: 'unknown_instalment' })
    expect(selectInstalments(plan, [3, 2, 3])).toEqual({ ok: true, indexes: [2, 3], amount: 38_400_000 })
  })
  it('refuses an instalment already waiting for review (no double payment)', () => {
    expect(selectInstalments(plan, 'next', new Set([1]))).toEqual({ ok: false, reason: 'awaiting_review' })
    expect(selectInstalments(plan, 'all', new Set([3]))).toEqual({ ok: false, reason: 'awaiting_review' })
  })
  it('nothing due on a paid order', () => {
    expect(selectInstalments([{ index: 0, amount: 10, status: 'paid' }], 'next')).toEqual({ ok: false, reason: 'nothing_due' })
  })
})

describe('applyConfirmedPayment', () => {
  const at = new Date('2026-11-08T10:00:00Z')
  it('marks instalments paid and derives the order status', () => {
    const r = applyConfirmedPayment(plan, [1], at)
    expect(r.ok && r.status).toBe('partially_paid')
    expect(r.ok && r.firstPayment).toBe(false)
    const all = applyConfirmedPayment(plan, [1, 2, 3], at)
    expect(all.ok && all.status).toBe('paid')
  })
  it('first payment on a fresh order', () => {
    const r = applyConfirmedPayment([{ index: 0, amount: 5, status: 'pending' }], [0], at)
    expect(r).toMatchObject({ ok: true, status: 'paid', firstPayment: true })
  })
  it('never pays an instalment twice', () => {
    expect(applyConfirmedPayment(plan, [0], at)).toEqual({ ok: false, reason: 'already_paid' })
    expect(applyConfirmedPayment(plan, [], at)).toEqual({ ok: false, reason: 'unknown_instalment' })
  })
})

describe('four-eyes (checkPaymentAction)', () => {
  const recorder = { id: 10, canRecord: true, canApprove: true }
  const approver = { id: 11, canRecord: false, canApprove: true }
  const clerk = { id: 12, canRecord: true, canApprove: false }
  const submitted: PaymentForCheck = { status: 'submitted', method: 'card', studentId: 1 }
  const recorded: PaymentForCheck = { status: 'recorded', method: 'card', studentId: 1, recordedBy: 10 }

  it('record needs payments.manual.record and a submitted payment', () => {
    expect(checkPaymentAction('record', submitted, clerk)).toEqual({ ok: true })
    expect(checkPaymentAction('record', submitted, approver)).toEqual({ ok: false, reason: 'not_permitted' })
    expect(checkPaymentAction('record', recorded, clerk)).toEqual({ ok: false, reason: 'wrong_status' })
  })
  it('the recorder can never confirm, even holding both permissions', () => {
    expect(checkPaymentAction('confirm', recorded, recorder)).toEqual({ ok: false, reason: 'same_person' })
    expect(checkPaymentAction('confirm', { ...recorded, recordedBy: '10' }, recorder)).toEqual({ ok: false, reason: 'same_person' })
  })
  it('a different person with approve confirms', () => {
    expect(checkPaymentAction('confirm', recorded, approver)).toEqual({ ok: true })
    expect(checkPaymentAction('confirm', recorded, clerk)).toEqual({ ok: false, reason: 'not_permitted' })
  })
  it('a submitted payment cannot be confirmed in one step', () => {
    expect(checkPaymentAction('confirm', submitted, approver)).toEqual({ ok: false, reason: 'wrong_status' })
    expect(checkPaymentAction('confirm', { ...recorded, recordedBy: null }, approver)).toEqual({ ok: false, reason: 'missing_recorder' })
  })
  it('nobody acts on their own order', () => {
    const own = { ...recorded, studentId: 11 }
    expect(checkPaymentAction('confirm', own, approver)).toEqual({ ok: false, reason: 'own_order' })
    expect(checkManualRecord({ studentId: 12, actor: clerk })).toEqual({ ok: false, reason: 'own_order' })
    expect(checkManualRecord({ studentId: 1, actor: clerk })).toEqual({ ok: true })
    expect(checkManualRecord({ studentId: 1, actor: approver })).toEqual({ ok: false, reason: 'not_permitted' })
  })
  it('reject needs a reason and an open payment', () => {
    expect(checkPaymentAction('reject', recorded, approver, '')).toEqual({ ok: false, reason: 'reason_required' })
    expect(checkPaymentAction('reject', recorded, approver, 'رسید پیدا نشد')).toEqual({ ok: true })
    expect(checkPaymentAction('reject', { ...recorded, status: 'confirmed' }, approver, 'رسید پیدا نشد')).toEqual({ ok: false, reason: 'wrong_status' })
    expect(checkPaymentAction('reject', submitted, { id: 13, canRecord: false, canApprove: false }, 'رسید پیدا نشد')).toEqual({ ok: false, reason: 'not_permitted' })
  })
  it('offers only allowed actions', () => {
    expect(paymentActionsFor(recorded, recorder)).toEqual(['reject'])
    expect(paymentActionsFor(recorded, approver)).toEqual(['confirm', 'reject'])
    expect(paymentActionsFor(submitted, clerk)).toEqual(['record', 'reject'])
  })
  it('card-to-card and manual need two people; gateways and Tether do not', () => {
    expect(PAYMENT_METHODS.card.needsTwoPeople && PAYMENT_METHODS.manual.needsTwoPeople).toBe(true)
    expect(PAYMENT_METHODS.zarinpal.needsTwoPeople || PAYMENT_METHODS.usdt.needsTwoPeople).toBe(false)
    expect(PAYMENT_METHODS.manual.studentFacing).toBe(false)
  })
  it('templates: finance can record and approve; settings stay with the academy admin', () => {
    const t = (k: string) => ROLE_TEMPLATES.find((r) => r.key === k)!.permissions as readonly string[]
    expect(t('finance')).toEqual(expect.arrayContaining(['payments.manual.record', 'payments.manual.approve']))
    expect(t('finance')).not.toContain('payments.settings')
    expect(t('advisor')).not.toContain('payments.manual.approve')
    expect(t('academy-admin')).toContain('payments.settings')
  })
})

describe('checkGatewayResult (callback verifies amount + order)', () => {
  it('passes when attempt, order and gateway agree', () => {
    expect(checkGatewayResult({ attemptAmount: 100, dueAmount: 100, reportedAmount: 100 })).toEqual({ ok: true })
    expect(checkGatewayResult({ attemptAmount: 100, dueAmount: 100 })).toEqual({ ok: true })
  })
  it('fails when the gateway reports another amount', () => {
    expect(checkGatewayResult({ attemptAmount: 100, dueAmount: 100, reportedAmount: 99 })).toEqual({ ok: false, reason: 'amount_mismatch' })
  })
  it('fails when the order no longer owes that amount', () => {
    expect(checkGatewayResult({ attemptAmount: 100, dueAmount: 90 })).toEqual({ ok: false, reason: 'order_changed' })
    expect(checkGatewayResult({ attemptAmount: 100, dueAmount: null })).toEqual({ ok: false, reason: 'order_changed' })
  })
  it('reuse keys are stable and lowercase tx hashes', () => {
    expect(reuseKey.tx('bep20', '0xABC')).toBe('tx:bep20:0xabc')
    expect(reuseKey.gatewayRef('zibal', '123')).toBe('ref:zibal:123')
  })
})

describe('usdtQuote (manual rate, round up, integer smallest unit)', () => {
  it('rounds up to the cent so the academy never gets less', () => {
    // 19,200,000 rial at 1,000,000 rial (100,000 toman) per USDT = 19.20 USDT exactly.
    expect(usdtQuote(rial(19_200_000), 1_000_000, 6)).toEqual({ cents: 1920, units: 19_200_000n, display: '19.20' })
    // 1 rial more → 19.21
    expect(usdtQuote(rial(19_200_001), 1_000_000, 6).cents).toBe(1921)
  })
  it('BEP20 (18 decimals) stays exact as a bigint', () => {
    const q = usdtQuote(rial(84_700_000_0), 1_050_000, 18)
    expect(q.units).toBe(BigInt(q.cents) * 10n ** 16n)
    expect(q.units > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true)
    expect(formatTokenUnits(q.units, 18)).toBe(q.display.replace(/,/g, ''))
  })
  it('refuses a missing or fractional rate', () => {
    expect(() => usdtQuote(rial(1), 0, 6)).toThrow()
    expect(() => usdtQuote(rial(1), 1.5, 6)).toThrow()
  })
})

describe('checkUsdtTransfer (on-chain rules)', () => {
  const quotedAt = new Date('2026-11-08T10:00:00Z')
  const wallet = 'TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb'
  const expectTrc: UsdtExpectation = { network: 'trc20', tokenContract: USDT_TOKENS.trc20.contract, recipient: wallet, minUnits: 19_200_000n, minConfirmations: 19, quotedAt }
  const seen = (over: Partial<{ to: string; amount: bigint; token: string; success: boolean; confirmations: number; timestamp: Date }> = {}) => ({
    found: true as const,
    success: over.success ?? true,
    confirmations: over.confirmations ?? 40,
    timestamp: over.timestamp ?? new Date('2026-11-08T10:05:00Z'),
    transfers: [{ tokenContract: over.token ?? USDT_TOKENS.trc20.contract, from: 'TSender', to: over.to ?? wallet, amount: over.amount ?? 19_200_000n }],
  })

  it('confirms the right token, recipient, amount and confirmations', () => {
    expect(checkUsdtTransfer(expectTrc, seen())).toEqual({ result: 'confirmed', units: 19_200_000n, from: 'TSender' })
    expect(checkUsdtTransfer(expectTrc, seen({ amount: 25_000_000n }))).toMatchObject({ result: 'confirmed' })
  })
  it('fails on less than expected, another wallet, another token or a failed tx', () => {
    expect(checkUsdtTransfer(expectTrc, seen({ amount: 19_199_999n }))).toEqual({ result: 'failed', reason: 'amount_low' })
    expect(checkUsdtTransfer(expectTrc, seen({ to: 'TOther' }))).toEqual({ result: 'failed', reason: 'wrong_recipient' })
    expect(checkUsdtTransfer(expectTrc, seen({ token: 'TFakeToken' }))).toEqual({ result: 'failed', reason: 'wrong_token' })
    expect(checkUsdtTransfer(expectTrc, seen({ success: false }))).toEqual({ result: 'failed', reason: 'tx_failed' })
  })
  it('fails on a transfer mined before the quote', () => {
    expect(checkUsdtTransfer(expectTrc, seen({ timestamp: new Date('2026-11-07T10:00:00Z') }))).toEqual({ result: 'failed', reason: 'too_old' })
  })
  it('waits for confirmations or for the tx to appear', () => {
    expect(checkUsdtTransfer(expectTrc, seen({ confirmations: 3 }))).toEqual({ result: 'waiting', reason: 'confirmations', confirmations: 3 })
    expect(checkUsdtTransfer(expectTrc, { found: false })).toEqual({ result: 'waiting', reason: 'not_found' })
  })
  it('BEP20 compares addresses case-insensitively', () => {
    const w = '0xAbCdEf0000000000000000000000000000000001'
    const e: UsdtExpectation = { ...expectTrc, network: 'bep20', tokenContract: USDT_TOKENS.bep20.contract.toUpperCase().replace('0X', '0x'), recipient: w, minUnits: 1n }
    const s = { ...seen(), transfers: [{ tokenContract: USDT_TOKENS.bep20.contract, from: '0x1', to: w.toLowerCase(), amount: 1n }] }
    expect(checkUsdtTransfer(e, s)).toMatchObject({ result: 'confirmed' })
  })
  it('normalises tx hashes per network', () => {
    const h = 'A'.repeat(64)
    expect(normaliseTxHash('trc20', `0x${h}`)).toBe('a'.repeat(64))
    expect(normaliseTxHash('bep20', h)).toBe(`0x${'a'.repeat(64)}`)
    expect(normaliseTxHash('bep20', 'xyz')).toBeNull()
  })
})

describe('card-to-card evidence', () => {
  const now = new Date('2026-11-08T12:00:00Z')
  it('accepts Persian digits and normalises them', () => {
    expect(checkCardEvidence({ last4: '۱۲۳۴', tracking: '۹۸۷۶۵۴', paidAt: '2026-11-08T11:00:00Z', now })).toEqual({
      ok: true,
      value: { last4: '1234', tracking: '987654', paidAt: new Date('2026-11-08T11:00:00Z') },
    })
  })
  it('rejects bad last 4, tracking, future or very old times', () => {
    expect(checkCardEvidence({ last4: '123', tracking: '1234', paidAt: now, now })).toMatchObject({ ok: false, field: 'last4' })
    expect(checkCardEvidence({ last4: '1234', tracking: 'ab', paidAt: now, now })).toMatchObject({ ok: false, field: 'tracking' })
    expect(checkCardEvidence({ last4: '1234', tracking: '1234', paidAt: '2026-11-09T12:00:00Z', now })).toMatchObject({ ok: false, field: 'paidAt' })
    expect(checkCardEvidence({ last4: '1234', tracking: '1234', paidAt: '2026-09-01T12:00:00Z', now })).toMatchObject({ ok: false, field: 'paidAt' })
  })
  it('validates and formats card numbers (Luhn)', () => {
    expect(isValidCardNumber('6037 9900 0000 0006')).toBe(true)
    expect(isValidCardNumber('6037990000000007')).toBe(false)
    expect(formatCardNumber('6037990000000006')).toBe('6037-9900-0000-0006')
  })
})
