import 'server-only'
import {
  AWAITING_REVIEW,
  MANUAL_CHANNELS,
  PAYMENT_ACTION_ERRORS,
  PAYMENT_METHODS,
  USDT_CHECK_MESSAGES,
  USDT_TOKENS,
  amountOfInstalments,
  applyConfirmedPayment,
  checkCardEvidence,
  checkGatewayResult,
  checkManualRecord,
  checkPaymentAction,
  checkUsdtTransfer,
  formatCardNumber,
  formatToman,
  normaliseTxHash,
  normaliseWallet,
  reuseKey,
  rial,
  selectInstalments,
  usdtQuote,
  type InstalmentPick,
  type ManualChannel,
  type PaymentAction,
  type PaymentActor,
  type PaymentMethodKey,
  type UsdtNetwork,
} from '@edvora/core'
import {
  IntegrationError,
  createChainVerifier,
  createGateway,
  createPaymentProvider,
  isTronAddress,
  type GatewayRedirect,
  type PaymentGateway,
} from '@edvora/integrations'
import type { Payload, PayloadRequest } from 'payload'
import { canIn } from '../access/permissions'
import { writeAudit } from '../hooks/audit'
import { env } from '../env'
import type { Order, Payment, PaymentMethod, Tenant, User } from '../payload-types'
import { onFirstPayment } from './checkout'
import { idOf } from './ids'
import { openCredentials } from './paymentSecrets'
import { notify } from './providers'

/**
 * Payment flows (ADR 017). Every function checks tenant and ownership/permission itself before writing, writes with
 * overrideAccess (the `payments` collection refuses all API writes), and leaves an audit-log row.
 */

/** A message the student or staff member may see as-is (Persian). */
export class PaymentError extends Error {}

const ENV_METHOD = 'env' as const
export type MethodRef = number | typeof ENV_METHOD

// ---------------------------------------------------------------- Audit

type Actor = { req: PayloadRequest } | null

async function audit(payload: Payload, actor: Actor, entry: { tenant: number; action: string; docId: number; note?: string; changes?: Record<string, { from: unknown; to: unknown }> }) {
  try {
    if (actor) {
      await writeAudit(actor.req, { tenants: [entry.tenant], action: entry.action, collection: 'payments', docId: entry.docId, note: entry.note, changes: entry.changes })
      return
    }
    await payload.create({
      collection: 'audit-logs',
      overrideAccess: true,
      data: { tenant: entry.tenant, action: entry.action, targetCollection: 'payments', docId: String(entry.docId), changes: entry.changes ?? {}, note: entry.note ?? null },
    })
  } catch (err) {
    // A missing audit row must be visible in logs; it never hides the payment result from the person.
    console.error('[payments] audit failed', entry.action, entry.docId, err)
  }
}

// ---------------------------------------------------------------- Methods

/** All method rows of an academy, credentials included (server only). */
async function methodRows(payload: Payload, tenantId: number): Promise<PaymentMethod[]> {
  const res = await payload.find({
    collection: 'payment-methods',
    where: { tenant: { equals: tenantId } },
    sort: 'position',
    limit: 50,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  return res.docs
}

export type CheckoutMethod = {
  ref: MethodRef
  key: PaymentMethodKey
  kind: 'gateway' | 'usdt' | 'card'
  title: string
  instructions: string | null
  cards: { number: string; holder: string; bank: string | null }[]
  networks: { network: UsdtNetwork; label: string; chain: string }[]
}

const toCheckout = (m: PaymentMethod): CheckoutMethod | null => {
  const info = PAYMENT_METHODS[m.method]
  if (!info.studentFacing || info.kind === 'manual') return null
  return {
    ref: m.id,
    key: m.method,
    kind: info.kind,
    title: m.title || info.label.fa,
    instructions: m.instructions ?? null,
    cards: info.kind === 'card' ? (m.cards ?? []).map((c) => ({ number: formatCardNumber(c.number), holder: c.holder, bank: c.bank ?? null })) : [],
    networks: info.kind === 'usdt' ? (m.wallets ?? []).map((w) => ({ network: w.network, label: USDT_TOKENS[w.network].label, chain: USDT_TOKENS[w.network].chain })) : [],
  }
}

/**
 * Methods the student may choose, in the academy's order. An academy with no rows at all uses the instance gateway
 * (`PAYMENT_PROVIDER`), so nothing changes until it configures methods. No secrets leave this function.
 */
export async function checkoutMethods(payload: Payload, tenantId: number): Promise<CheckoutMethod[]> {
  const rows = await methodRows(payload, tenantId)
  if (rows.length === 0) {
    return [{ ref: ENV_METHOD, key: 'zarinpal', kind: 'gateway', title: 'پرداخت آنلاین (کارت‌های عضو شتاب)', instructions: null, cards: [], networks: [] }]
  }
  return rows
    .filter((m) => m.enabled)
    .map(toCheckout)
    .filter((m): m is CheckoutMethod => m !== null)
}

async function enabledMethod(payload: Payload, tenantId: number, ref: MethodRef, kind: CheckoutMethod['kind'] | 'manual'): Promise<PaymentMethod | null> {
  const rows = await methodRows(payload, tenantId)
  if (ref === ENV_METHOD) {
    if (rows.length === 0 && kind === 'gateway') return null
    throw new PaymentError('این روش پرداخت در دسترس نیست.')
  }
  const row = rows.find((m) => m.id === ref)
  if (!row || !row.enabled || PAYMENT_METHODS[row.method].kind !== kind) throw new PaymentError('این روش پرداخت در دسترس نیست.')
  return row
}

/** E-029 (C8, ADR 013): is this academy a demo sandbox? Sandboxes use the mock gateway and chain, whatever the env says. */
async function isSandboxTenant(payload: Payload, tenantId: number): Promise<boolean> {
  const t = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true, disableErrors: true, select: { isSandbox: true } })
  return t?.isSandbox === true
}

function gatewayFor(row: PaymentMethod | null, origin: string, sandboxTenant: boolean): PaymentGateway {
  const e = env()
  const mockGatewayUrl = `${origin}/pay/mock`
  // ADR 017 §5: the demo and CI run every gateway against the mock. E-029: so does every demo sandbox.
  if (sandboxTenant || e.PAYMENT_PROVIDER === 'mock') return createGateway({ gateway: 'mock', sandbox: true, credentials: {}, mockGatewayUrl })
  if (!row) return createPaymentProvider({ provider: e.PAYMENT_PROVIDER, zarinpalMerchantId: e.ZARINPAL_MERCHANT_ID, zarinpalSandbox: e.ZARINPAL_SANDBOX, mockGatewayUrl })
  if (PAYMENT_METHODS[row.method].kind !== 'gateway') throw new PaymentError('این روش پرداخت در دسترس نیست.')
  return createGateway({
    gateway: row.method as Exclude<PaymentMethodKey, 'usdt' | 'card' | 'manual'>,
    sandbox: row.mode !== 'live',
    credentials: openCredentials(row.credentialsSealed) ?? {},
    mockGatewayUrl,
  })
}

// ---------------------------------------------------------------- Orders

export async function loadStudentOrder(payload: Payload, tenantId: number, userId: number, orderId: number): Promise<Order> {
  const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!order || idOf(order.tenant) !== tenantId || idOf(order.user) !== userId) throw new PaymentError('این سفارش پیدا نشد.')
  if (order.source === 'import') throw new PaymentError('این سفارش از سایت قبلی منتقل شده و از اینجا پرداخت نمی‌شود.')
  if (order.status === 'cancelled' || order.status === 'refunded') throw new PaymentError('این سفارش بسته شده است.')
  return order
}

/** Instalment indexes covered by a payment waiting for a person. */
export async function awaitingIndexes(payload: Payload, orderId: number): Promise<Set<number>> {
  const res = await payload.find({
    collection: 'payments',
    where: { and: [{ order: { equals: orderId } }, { status: { in: [...AWAITING_REVIEW] } }] },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return new Set(res.docs.flatMap((p) => p.instalmentIndexes ?? []))
}

const SELECT_ERRORS = {
  nothing_due: 'همهٔ اقساط این سفارش پرداخت شده است.',
  unknown_instalment: 'این قسط در سفارش نیست.',
  already_paid: 'این قسط قبلاً پرداخت شده است.',
  awaiting_review: 'برای این قسط پرداختی ثبت شده که در انتظار بررسی است. تا نتیجهٔ آن مشخص نشده، پرداخت دوباره لازم نیست.',
} as const

async function pickInstalments(payload: Payload, order: Order, pick: InstalmentPick) {
  const sel = selectInstalments(order.instalments ?? [], pick, await awaitingIndexes(payload, order.id))
  if (!sel.ok) throw new PaymentError(SELECT_ERRORS[sel.reason])
  return sel
}

const isUniqueViolation = (err: unknown) => {
  const s = err instanceof Error ? `${err.message} ${JSON.stringify((err as { data?: unknown }).data ?? '')}` : String(err)
  return /unique|duplicate|reuse_key|reuseKey/i.test(s)
}

async function newPayment(payload: Payload, order: Order, data: Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'user' | 'tenant'>): Promise<Payment> {
  return payload.create({
    collection: 'payments',
    overrideAccess: true,
    data: { ...data, tenant: idOf(order.tenant), order: order.id, user: idOf(order.user)!, course: idOf(order.course), cohort: idOf(order.cohort) },
  })
}

/**
 * Compare-and-set on status, so two people clicking at once cannot both win. Returns the updated row or null when
 * the payment had already moved on.
 */
async function transition(payload: Payload, id: number, from: Payment['status'] | Payment['status'][], data: Partial<Payment>): Promise<Payment | null> {
  const res = await payload.update({
    collection: 'payments',
    where: { and: [{ id: { equals: id } }, { status: Array.isArray(from) ? { in: from } : { equals: from } }] },
    data,
    overrideAccess: true,
    depth: 0,
  })
  return res.docs[0] ?? null
}

/**
 * The one place an instalment becomes paid. Re-reads the order, refuses an instalment already paid, then marks
 * the payment confirmed and the instalments paid. First payment → enrollment, seat, coupon use, SMS.
 */
async function confirmAndApply(payload: Payload, payment: Payment, from: Payment['status'] | Payment['status'][], patch: Partial<Payment>): Promise<{ order: Order; status: 'paid' | 'partially_paid' }> {
  const order = await payload.findByID({ collection: 'orders', id: idOf(payment.order)!, depth: 0, overrideAccess: true })
  const applied = applyConfirmedPayment(order.instalments ?? [], payment.instalmentIndexes ?? [], new Date())
  if (!applied.ok) throw new PaymentError('این قسط در این فاصله با پرداخت دیگری تسویه شده است. پرداخت تأیید نشد؛ با پشتیبانی مالی هماهنگ کنید.')
  const done = await transition(payload, payment.id, from, { ...patch, status: 'confirmed' })
  if (!done) throw new PaymentError(PAYMENT_ACTION_ERRORS.wrong_status)
  const updated = await payload.update({
    collection: 'orders',
    id: order.id,
    overrideAccess: true,
    data: {
      instalments: (order.instalments ?? []).map((i) => {
        const a = applied.instalments.find((x) => x.index === i.index)
        return a?.status === 'paid' && i.status !== 'paid' ? { ...i, status: 'paid' as const, paidAt: new Date(a.paidAt ?? Date.now()).toISOString() } : i
      }),
      status: applied.status,
    },
  })
  const tenant = await payload.findByID({ collection: 'tenants', id: idOf(order.tenant)!, overrideAccess: true })
  if (applied.firstPayment) await onFirstPayment(payload, updated, tenant)
  else {
    const user = await payload.findByID({ collection: 'users', id: idOf(order.user)!, depth: 0, overrideAccess: true })
    await notify(user.phone, `${tenant.name}: پرداخت ${formatToman(rial(payment.amount))} برای سفارش ${order.id} تأیید شد.`, tenant)
  }
  return { order: updated, status: applied.status }
}

// ---------------------------------------------------------------- Gateway

export type StartResult = { paymentId: number; redirect: GatewayRedirect }

export async function startGatewayPayment(args: { payload: Payload; tenant: Tenant; order: Order; user: User; method: MethodRef; pick: InstalmentPick; origin: string }): Promise<StartResult> {
  const { payload, tenant, order, user, origin } = args
  const row = await enabledMethod(payload, tenant.id, args.method, 'gateway')
  const sel = await pickInstalments(payload, order, args.pick)
  const gateway = gatewayFor(row, origin, tenant.isSandbox === true)
  const payment = await newPayment(payload, order, {
    method: row?.method ?? 'zarinpal',
    methodRow: row?.id ?? null,
    methodTitle: row?.title ?? 'پرداخت آنلاین',
    provider: row ? gateway.name : `env:${gateway.name}`,
    instalmentIndexes: sel.indexes,
    amount: sel.amount,
    status: 'started',
  })
  try {
    const created = await gateway.createPayment({
      amount: sel.amount,
      description: `سفارش ${order.id} — قسط ${sel.indexes.map((i) => i + 1).join('، ')}`,
      callbackUrl: `${origin}/payments/callback?payment=${payment.id}`,
      mobile: user.phone ?? undefined,
      orderId: String(order.id),
      attemptId: String(payment.id),
    })
    await payload.update({ collection: 'payments', id: payment.id, overrideAccess: true, data: { authority: created.authority, reuseKey: reuseKey.gatewayAttempt(gateway.name, created.authority) } })
    return { paymentId: payment.id, redirect: created.redirect }
  } catch (err) {
    await payload.update({ collection: 'payments', id: payment.id, overrideAccess: true, data: { status: 'failed', error: err instanceof Error ? err.message.slice(0, 300) : 'gateway error' } })
    console.error('[payments] gateway request failed', payment.id, err)
    throw new PaymentError('اتصال به درگاه پرداخت انجام نشد. چند دقیقهٔ دیگر دوباره تلاش کنید یا روش دیگری را انتخاب کنید.')
  }
}

export type CallbackOutcome = { status: 'paid' | 'partial' | 'failed'; paymentId: number | null; orderId: number | null; message?: string }

const BANK_RETURNS = 'اگر مبلغی از حساب شما کسر شده، طبق قوانین بانکی حداکثر تا ۷۲ ساعت به حساب‌تان بازمی‌گردد.'

/** Gateway callback. Idempotent; verifies attempt, order and amount; never verifies money the order does not owe. */
export async function handleGatewayCallback(payload: Payload, paymentId: number, params: URLSearchParams): Promise<CallbackOutcome> {
  const payment = await payload.findByID({ collection: 'payments', id: paymentId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!payment || PAYMENT_METHODS[payment.method].kind !== 'gateway' || !payment.authority) return { status: 'failed', paymentId: null, orderId: null, message: 'تراکنش پیدا نشد.' }
  const orderId = idOf(payment.order)!
  const tenantId = idOf(payment.tenant)!
  const settled = async (): Promise<CallbackOutcome> => {
    const o = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
    return { status: o.status === 'paid' ? 'paid' : 'partial', paymentId, orderId }
  }
  if (payment.status === 'confirmed') return settled()
  if (payment.status !== 'started') return { status: 'failed', paymentId, orderId, message: BANK_RETURNS }

  const row = payment.methodRow ? await payload.findByID({ collection: 'payment-methods', id: idOf(payment.methodRow)!, depth: 0, overrideAccess: true, showHiddenFields: true }) : null
  const gateway = gatewayFor(row, env().NEXT_PUBLIC_SITE_URL, await isSandboxTenant(payload, tenantId))
  const cb = gateway.parseCallback(params)
  if (!cb || cb.authority !== payment.authority) return { status: 'failed', paymentId, orderId, message: 'تراکنش پیدا نشد.' }

  const fail = async (error: string, message: string): Promise<CallbackOutcome> => {
    const moved = await transition(payload, payment.id, 'started', { status: 'failed', error })
    if (moved) await audit(payload, null, { tenant: tenantId, action: 'payments.gateway.failed', docId: payment.id, note: error })
    return { status: 'failed', paymentId, orderId, message }
  }
  if (!cb.success) return fail('cancelled', `پرداخت انجام نشد یا لغو شد. ${BANK_RETURNS}`)

  // The order must still owe exactly this attempt; otherwise do not verify (the bank returns the money).
  const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  const instalments = order.instalments ?? []
  const unpaid = (payment.instalmentIndexes ?? []).every((i) => instalments.find((x) => x.index === i)?.status !== 'paid')
  const pre = checkGatewayResult({ attemptAmount: payment.amount, dueAmount: unpaid ? amountOfInstalments(instalments, payment.instalmentIndexes ?? []) : null })
  if (!pre.ok) return fail(pre.reason, `این قسط پیش‌تر تسویه شده بود و این پرداخت تأیید نشد. ${BANK_RETURNS}`)

  let result
  try {
    result = await gateway.verify({ authority: payment.authority, amount: payment.amount, attemptId: String(payment.id), extra: cb.extra })
  } catch (err) {
    console.error('[payments] verify error', payment.id, err)
    return { status: 'failed', paymentId, orderId, message: `پاسخ بانک دریافت نشد. ${BANK_RETURNS}` }
  }
  if (!result.ok) return fail(`${result.code}: ${result.message}`.slice(0, 300), `بانک پرداخت را تأیید نکرد. ${BANK_RETURNS}`)
  const post = checkGatewayResult({ attemptAmount: payment.amount, dueAmount: payment.amount, reportedAmount: result.amount })
  if (!post.ok) return fail(`amount_mismatch: gateway reported ${result.amount}`, 'مبلغ تأییدشدهٔ بانک با مبلغ قسط یکسان نبود. کارشناسان مالی پیگیری می‌کنند.')

  try {
    await confirmAndApply(payload, payment, 'started', {
      verifiedBy: 'gateway',
      refId: result.refId,
      cardPan: result.cardPan ?? null,
      reuseKey: reuseKey.gatewayRef(gateway.name, result.refId),
      confirmedAt: new Date().toISOString(),
    })
  } catch (err) {
    if (isUniqueViolation(err)) return fail('reused: gateway ref already counted', 'این تراکنش قبلاً ثبت شده است.')
    if (err instanceof PaymentError) return fail('order_changed', err.message)
    throw err
  }
  await audit(payload, null, { tenant: tenantId, action: 'payments.gateway.verified', docId: payment.id, note: `${gateway.name} ref ${result.refId}` })
  return settled()
}

// ---------------------------------------------------------------- Tether (USDT)

/** E-029: a sandbox academy always uses the mock chain (no TronGrid/BscScan calls). */
const chainMode = (sandboxTenant = false) => (sandboxTenant ? 'mock' : (env().CHAIN_VERIFIER ?? (env().PAYMENT_PROVIDER === 'mock' ? 'mock' : 'live')))

function tokenFor(network: UsdtNetwork, sandbox: boolean, sandboxTenant: boolean): { contract: string | null; decimals: number; minConfirmations: number } {
  const t = USDT_TOKENS[network]
  // The mock chain has no testnet: it checks against the mainnet contract in both modes.
  if (!sandbox || chainMode(sandboxTenant) === 'mock') return { contract: t.contract, decimals: t.decimals, minConfirmations: t.minConfirmations }
  const e = env()
  const contract = (network === 'trc20' ? e.USDT_TRC20_TESTNET_CONTRACT : e.USDT_BEP20_TESTNET_CONTRACT) ?? null
  return { contract, decimals: t.decimals, minConfirmations: t.minConfirmations }
}

function verifierFor(network: UsdtNetwork, sandbox: boolean, sandboxTenant: boolean) {
  const e = env()
  if (chainMode(sandboxTenant) === 'mock') return createChainVerifier({ verifier: 'mock' })
  if (network === 'trc20') return createChainVerifier({ verifier: 'live', network, apiUrl: sandbox ? e.TRONGRID_TESTNET_API_URL : e.TRONGRID_API_URL, apiKey: e.TRONGRID_API_KEY })
  if (!e.BSC_API_KEY) return null // BscScan/Etherscan need a key: without one, verification is "unavailable".
  return createChainVerifier({ verifier: 'live', network, apiUrl: sandbox ? e.BSC_TESTNET_API_URL : e.BSC_API_URL, apiKey: e.BSC_API_KEY })
}

/** Creates a quote (payment `started`) for the next instalment(s) at the academy's hand-set rate. */
export async function startUsdtPayment(args: { payload: Payload; tenant: Tenant; order: Order; method: MethodRef; network: UsdtNetwork; pick: InstalmentPick }): Promise<Payment> {
  const { payload, tenant, order, network } = args
  const row = await enabledMethod(payload, tenant.id, args.method, 'usdt')
  if (!row) throw new PaymentError('این روش پرداخت در دسترس نیست.')
  const wallet = row.wallets?.find((w) => w.network === network)
  if (!wallet || !row.usdtRateRial || !row.usdtLegalAck) throw new PaymentError('پرداخت تتر روی این شبکه فعال نیست.')
  const sbx = tenant.isSandbox === true
  if (network === 'trc20' && chainMode(sbx) === 'live' && !isTronAddress(wallet.address)) throw new PaymentError('پرداخت تتر روی این شبکه فعال نیست.')
  const sandbox = row.mode !== 'live'
  const token = tokenFor(network, sandbox, sbx)
  const sel = await pickInstalments(payload, order, args.pick)
  const q = usdtQuote(sel.amount, row.usdtRateRial, token.decimals)
  const payment = await newPayment(payload, order, {
    method: 'usdt',
    methodRow: row.id,
    methodTitle: row.title,
    provider: chainMode(sbx) === 'mock' ? 'mock-chain' : network,
    instalmentIndexes: sel.indexes,
    amount: sel.amount,
    status: 'started',
    usdt: {
      network,
      wallet: normaliseWallet(network, wallet.address),
      tokenContract: token.contract ?? USDT_TOKENS[network].contract,
      rateRial: row.usdtRateRial,
      units: q.units.toString(),
      display: q.display,
      quotedAt: new Date().toISOString(),
    },
  })
  await audit(payload, null, { tenant: tenant.id, action: 'payments.usdt.quoted', docId: payment.id, note: `${q.display} USDT ${network} at ${row.usdtRateRial} rial` })
  return payment
}

export type UsdtSubmitResult = { state: 'confirmed' | 'waiting' | 'review' | 'failed'; message: string }

/**
 * The student's tx hash. Verified on-chain when possible: pass → confirmed (no person); a definite mismatch →
 * failed (hash released); not yet confirmed → waiting; verifier unavailable → `submitted` for the four-eyes queue.
 */
export async function submitUsdtHash(args: { payload: Payload; tenantId: number; userId: number; paymentId: number; txHash?: string }): Promise<UsdtSubmitResult> {
  const { payload } = args
  const p = await payload.findByID({ collection: 'payments', id: args.paymentId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!p || p.method !== 'usdt' || idOf(p.tenant) !== args.tenantId || idOf(p.user) !== args.userId || !p.usdt?.network) throw new PaymentError('این پرداخت پیدا نشد.')
  if (p.status !== 'started') throw new PaymentError('این پرداخت قبلاً ثبت شده است.')
  const network = p.usdt.network
  let hash = p.usdt.txHash ?? null
  if (args.txHash !== undefined) {
    const h = normaliseTxHash(network, args.txHash)
    if (!h) throw new PaymentError(network === 'trc20' ? 'شناسهٔ تراکنش ترون ۶۴ نویسهٔ ۰ تا ۹ و a تا f است.' : 'شناسهٔ تراکنش BSC با 0x شروع می‌شود و ۶۴ نویسه پس از آن دارد.')
    if (hash && hash !== h) throw new PaymentError('برای این پرداخت قبلاً شناسهٔ دیگری ثبت شده است.')
    if (!hash) {
      try {
        await payload.update({ collection: 'payments', id: p.id, overrideAccess: true, data: { reuseKey: reuseKey.tx(network, h), usdt: { ...p.usdt, txHash: h } } })
      } catch (err) {
        if (isUniqueViolation(err)) throw new PaymentError(USDT_CHECK_MESSAGES.reused)
        throw err
      }
      hash = h
    }
  }
  if (!hash) throw new PaymentError('شناسهٔ تراکنش را وارد کنید.')

  const row = p.methodRow ? await payload.findByID({ collection: 'payment-methods', id: idOf(p.methodRow)!, depth: 0, overrideAccess: true }) : null
  const sandbox = row?.mode !== 'live'
  const sbx = await isSandboxTenant(payload, args.tenantId)
  const token = tokenFor(network, sandbox, sbx)
  const usdt = { ...p.usdt, txHash: hash, checkedAt: new Date().toISOString() }
  const toReview = async (why: string): Promise<UsdtSubmitResult> => {
    await transition(payload, p.id, 'started', { status: 'submitted', usdt: { ...usdt, check: `unavailable: ${why}`.slice(0, 200) } })
    await audit(payload, null, { tenant: args.tenantId, action: 'payments.usdt.to_review', docId: p.id, note: why.slice(0, 300) })
    return { state: 'review', message: USDT_CHECK_MESSAGES.unavailable }
  }

  const verifier = verifierFor(network, sandbox, sbx)
  if (!verifier || !token.contract) return toReview(!verifier ? 'no API key' : 'no testnet contract configured')
  let seen
  try {
    seen = await verifier.lookup({ network, txHash: hash, hint: { to: usdt.wallet ?? '', amount: BigInt(usdt.units ?? '0'), tokenContract: token.contract } })
  } catch (err) {
    console.error('[payments] chain verifier unavailable', p.id, err)
    return toReview(err instanceof IntegrationError ? err.message : 'chain API error')
  }
  const check = checkUsdtTransfer(
    {
      network,
      tokenContract: token.contract,
      recipient: usdt.wallet ?? '',
      minUnits: BigInt(usdt.units ?? '0'),
      minConfirmations: token.minConfirmations,
      quotedAt: new Date(usdt.quotedAt ?? p.createdAt),
    },
    seen,
  )
  if (check.result === 'waiting') {
    await payload.update({ collection: 'payments', id: p.id, overrideAccess: true, data: { usdt: { ...usdt, check: `waiting: ${check.reason}`, confirmations: check.confirmations ?? null } } })
    return { state: 'waiting', message: USDT_CHECK_MESSAGES[check.reason] }
  }
  if (check.result === 'failed') {
    // The hash was not counted, so release it (a typo must not burn someone else's real transaction).
    await transition(payload, p.id, 'started', { status: 'failed', reuseKey: null, error: `usdt: ${check.reason}`, usdt: { ...usdt, check: `failed: ${check.reason}` } })
    await audit(payload, null, { tenant: args.tenantId, action: 'payments.usdt.failed', docId: p.id, note: check.reason })
    return { state: 'failed', message: USDT_CHECK_MESSAGES[check.reason] }
  }
  await confirmAndApply(payload, p, 'started', { verifiedBy: 'chain', confirmedAt: new Date().toISOString(), usdt: { ...usdt, check: 'confirmed', confirmations: seen.found ? seen.confirmations : null } })
  await audit(payload, null, { tenant: args.tenantId, action: 'payments.usdt.verified', docId: p.id, note: `${network} ${hash}` })
  return { state: 'confirmed', message: 'پرداخت تتر شما روی شبکه تأیید شد.' }
}

// ---------------------------------------------------------------- Card-to-card

const RECEIPT_MAX_BYTES = 5 * 1024 * 1024
const RECEIPT_TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/webp': { ext: 'webp', magic: (b) => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  'application/pdf': { ext: 'pdf', magic: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
}

export async function submitCardPayment(args: {
  payload: Payload
  tenant: Tenant
  order: Order
  method: MethodRef
  toCard: string
  pick: InstalmentPick
  last4: string
  tracking: string
  paidAt: string
  receipt: File | null
}): Promise<Payment> {
  const { payload, tenant, order } = args
  const row = await enabledMethod(payload, tenant.id, args.method, 'card')
  if (!row) throw new PaymentError('این روش پرداخت در دسترس نیست.')
  const card = (row.cards ?? []).find((c) => formatCardNumber(c.number) === formatCardNumber(args.toCard)) ?? (row.cards ?? [])[0]
  if (!card) throw new PaymentError('این روش پرداخت در دسترس نیست.')
  const ev = checkCardEvidence({ last4: args.last4, tracking: args.tracking, paidAt: args.paidAt })
  if (!ev.ok) throw new PaymentError(ev.message)
  const sel = await pickInstalments(payload, order, args.pick)

  let receiptId: number | null = null
  if (args.receipt && args.receipt.size > 0) {
    const type = RECEIPT_TYPES[args.receipt.type]
    if (!type) throw new PaymentError('تصویر رسید باید JPG، PNG، WebP یا PDF باشد.')
    if (args.receipt.size > RECEIPT_MAX_BYTES) throw new PaymentError('حجم تصویر رسید باید کمتر از ۵ مگابایت باشد.')
    const data = Buffer.from(await args.receipt.arrayBuffer())
    if (!type.magic(data)) throw new PaymentError('فایل رسید خراب است یا با نوعش هم‌خوانی ندارد.')
    const doc = await payload.create({
      collection: 'payment-receipts',
      overrideAccess: true,
      data: { tenant: tenant.id, owner: idOf(order.user)! },
      file: { data, mimetype: args.receipt.type, name: `${crypto.randomUUID()}.${type.ext}`, size: data.length },
    })
    receiptId = doc.id
  }
  try {
    const p = await newPayment(payload, order, {
      method: 'card',
      methodRow: row.id,
      methodTitle: row.title,
      provider: 'card',
      instalmentIndexes: sel.indexes,
      amount: sel.amount,
      status: 'submitted',
      reuseKey: reuseKey.card(tenant.id, ev.value.tracking),
      card: { last4: ev.value.last4, tracking: ev.value.tracking, paidAt: ev.value.paidAt.toISOString(), toCard: formatCardNumber(card.number), receipt: receiptId },
    })
    await audit(payload, null, { tenant: tenant.id, action: 'payments.card.submitted', docId: p.id, note: `tracking ${ev.value.tracking}` })
    return p
  } catch (err) {
    if (isUniqueViolation(err)) throw new PaymentError('این شمارهٔ پیگیری قبلاً برای پرداخت دیگری ثبت شده است.')
    throw err
  }
}

// ---------------------------------------------------------------- Staff (finance desk)

export type StaffCtx = { tenant: Tenant; user: User; req: PayloadRequest }

export async function staffActor(s: StaffCtx): Promise<PaymentActor> {
  const [canRecord, canApprove] = await Promise.all([canIn(s.req, s.tenant.id, 'payments.manual.record'), canIn(s.req, s.tenant.id, 'payments.manual.approve')])
  return { id: s.user.id, canRecord, canApprove }
}

async function staffPayment(s: StaffCtx, id: number): Promise<Payment> {
  const p = await s.req.payload.findByID({ collection: 'payments', id, depth: 0, overrideAccess: true, disableErrors: true })
  if (!p || idOf(p.tenant) !== s.tenant.id) throw new PaymentError('این پرداخت پیدا نشد.')
  return p
}

export async function staffPaymentAction(s: StaffCtx, paymentId: number, action: PaymentAction, reason?: string): Promise<Payment['status']> {
  const payload = s.req.payload
  const p = await staffPayment(s, paymentId)
  const actor = await staffActor(s)
  const d = checkPaymentAction(action, { status: p.status, method: p.method, studentId: idOf(p.user)!, recordedBy: idOf(p.recordedBy) }, actor, reason)
  if (!d.ok) throw new PaymentError(PAYMENT_ACTION_ERRORS[d.reason])
  const now = new Date().toISOString()
  if (action === 'record') {
    const moved = await transition(payload, p.id, 'submitted', { status: 'recorded', recordedBy: s.user.id, recordedAt: now })
    if (!moved) throw new PaymentError(PAYMENT_ACTION_ERRORS.wrong_status)
    await audit(payload, s, { tenant: s.tenant.id, action: 'payments.recorded', docId: p.id, changes: { status: { from: 'submitted', to: 'recorded' } } })
    return 'recorded'
  }
  if (action === 'reject') {
    const text = (reason ?? '').trim()
    const moved = await transition(payload, p.id, ['submitted', 'recorded'], { status: 'rejected', rejectedBy: s.user.id, rejectedAt: now, rejectionReason: text, reuseKey: null })
    if (!moved) throw new PaymentError(PAYMENT_ACTION_ERRORS.wrong_status)
    await audit(payload, s, { tenant: s.tenant.id, action: 'payments.rejected', docId: p.id, note: text, changes: { status: { from: p.status, to: 'rejected' } } })
    const user = await payload.findByID({ collection: 'users', id: idOf(p.user)!, depth: 0, overrideAccess: true })
    await notify(user.phone, `${s.tenant.name}: پرداخت ${formatToman(rial(p.amount))} سفارش ${idOf(p.order)} تأیید نشد. دلیل و راه ادامه در پنل شما آمده است.`, s.tenant)
    return 'rejected'
  }
  await confirmAndApply(payload, p, 'recorded', { confirmedBy: s.user.id, confirmedAt: now, verifiedBy: 'people' })
  await audit(payload, s, { tenant: s.tenant.id, action: 'payments.confirmed', docId: p.id, changes: { status: { from: 'recorded', to: 'confirmed' } } })
  return 'confirmed'
}

/** A cash / POS / transfer payment recorded by staff. It starts as `recorded`; a second person confirms it. */
export async function recordManualPayment(
  s: StaffCtx,
  input: { orderId: number; pick: 'next' | 'all'; channel: ManualChannel; reference: string; paidAt: string; note?: string },
): Promise<Payment> {
  const payload = s.req.payload
  const rows = await methodRows(payload, s.tenant.id)
  const manual = rows.find((m) => m.method === 'manual')
  if (manual && !manual.enabled) throw new PaymentError('ثبت دستی پرداخت در تنظیمات این آکادمی خاموش است.')
  if (manual?.manualChannels?.length && !manual.manualChannels.includes(input.channel)) throw new PaymentError('این شیوهٔ پرداخت در تنظیمات آکادمی فعال نیست.')
  const order = await payload.findByID({ collection: 'orders', id: input.orderId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!order || idOf(order.tenant) !== s.tenant.id) throw new PaymentError('این سفارش در این آکادمی پیدا نشد.')
  if (order.source === 'import' || order.status === 'cancelled' || order.status === 'refunded') throw new PaymentError('برای این سفارش پرداخت ثبت نمی‌شود.')
  const d = checkManualRecord({ studentId: idOf(order.user)!, actor: await staffActor(s) })
  if (!d.ok) throw new PaymentError(PAYMENT_ACTION_ERRORS[d.reason])
  const paidAt = new Date(input.paidAt)
  if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 10 * 60 * 1000) throw new PaymentError('زمان پرداخت معتبر نیست.')
  const sel = await pickInstalments(payload, order, input.pick)
  const now = new Date().toISOString()
  const p = await newPayment(payload, order, {
    method: 'manual',
    methodRow: manual?.id ?? null,
    methodTitle: MANUAL_CHANNELS[input.channel],
    provider: 'manual',
    instalmentIndexes: sel.indexes,
    amount: sel.amount,
    status: 'recorded',
    recordedBy: s.user.id,
    recordedAt: now,
    manual: { channel: input.channel, reference: input.reference || null, paidAt: paidAt.toISOString(), note: input.note || null },
  })
  await audit(payload, s, { tenant: s.tenant.id, action: 'payments.manual.recorded', docId: p.id, note: `${input.channel} ${formatToman(rial(sel.amount))} order ${order.id}` })
  return p
}

// ---------------------------------------------------------------- Reads

/** Payments waiting for a person, oldest first (the finance queue). */
export async function reviewQueue(s: StaffCtx): Promise<Payment[]> {
  const res = await s.req.payload.find({
    collection: 'payments',
    where: { and: [{ tenant: { equals: s.tenant.id } }, { status: { in: [...AWAITING_REVIEW] } }] },
    sort: 'createdAt',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })
  return res.docs
}

export async function orderPayments(payload: Payload, tenantId: number, orderId: number): Promise<Payment[]> {
  const res = await payload.find({
    collection: 'payments',
    where: { and: [{ tenant: { equals: tenantId } }, { order: { equals: orderId } }] },
    sort: '-createdAt',
    limit: 200,
    depth: 1,
    overrideAccess: true,
  })
  return res.docs
}

/** One of the student's own payments, for the status page. */
export async function studentPayment(payload: Payload, tenantId: number, userId: number, id: number): Promise<Payment | null> {
  const p = await payload.findByID({ collection: 'payments', id, depth: 1, overrideAccess: true, disableErrors: true })
  if (!p || idOf(p.tenant) !== tenantId || idOf(p.user) !== userId) return null
  return p
}
