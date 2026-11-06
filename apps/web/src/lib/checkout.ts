import 'server-only'
import { applyCoupon, buildInstalmentPlan, formatToman, rial, type Coupon as CoreCoupon } from '@edvora/core'
import type { Payload } from 'payload'
import type { Coupon, Order, Tenant } from '../payload-types'
import { idOf } from './ids'
import { getRequestOrigin } from './origin'
import { getPayment, notify } from './providers'

export class CheckoutError extends Error {}

/** Finds a usable coupon for this academy, or throws a user-facing error. */
export async function findCoupon(payload: Payload, tenantId: number, code: string | undefined): Promise<Coupon | null> {
  if (!code?.trim()) return null
  const res = await payload.find({
    collection: 'coupons',
    where: { and: [{ tenant: { equals: tenantId } }, { code: { equals: code.trim().toUpperCase() } }, { active: { equals: true } }] },
    limit: 1,
    overrideAccess: true,
  })
  const coupon = res.docs[0]
  if (!coupon) throw new CheckoutError('کد تخفیف معتبر نیست.')
  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) throw new CheckoutError('مهلت این کد تخفیف تمام شده است.')
  if (coupon.usageLimit && (coupon.usedCount ?? 0) >= coupon.usageLimit) throw new CheckoutError('ظرفیت این کد تخفیف تکمیل شده است.')
  return coupon
}

const toCoreCoupon = (c: Coupon | null): CoreCoupon | null =>
  !c ? null : c.kind === 'percent' ? { kind: 'percent', value: c.value, maxDiscount: c.maxDiscount ? rial(c.maxDiscount) : undefined } : { kind: 'fixed', value: rial(c.value) }

export async function createOrder(args: {
  payload: Payload
  tenant: Tenant
  userId: number
  cohortId: number
  instalmentCount: number
  couponCode?: string
}): Promise<Order> {
  const { payload, tenant, userId, cohortId } = args
  const cohort = await payload.findByID({ collection: 'cohorts', id: cohortId, depth: 1, overrideAccess: true })
  if (idOf(cohort.tenant) !== tenant.id) throw new CheckoutError('این دوره در این آکادمی وجود ندارد.')
  if (!['open', 'preregistration'].includes(cohort.status ?? '')) throw new CheckoutError('ثبت‌نام این دوره بسته است.')
  if (cohort.seats && (cohort.seatsTaken ?? 0) >= cohort.seats) throw new CheckoutError('ظرفیت این دوره تکمیل شده است.')

  const course = typeof cohort.course === 'object' ? cohort.course : await payload.findByID({ collection: 'courses', id: cohort.course, overrideAccess: true })
  const subtotal = rial(cohort.priceOverride ?? course.price)
  const coupon = await findCoupon(payload, tenant.id, args.couponCode)
  const { price: total, discount } = applyCoupon(subtotal, toCoreCoupon(coupon))

  const count = Math.max(1, Math.min(args.instalmentCount, course.maxInstalments ?? 1))
  const plan = buildInstalmentPlan({ total, count, downPaymentPercent: count > 1 ? 40 : 0, firstDueDate: new Date() })

  return payload.create({
    collection: 'orders',
    overrideAccess: true,
    data: {
      tenant: tenant.id,
      user: userId,
      course: course.id,
      cohort: cohort.id,
      subtotal,
      discount,
      total,
      couponCode: coupon?.code ?? null,
      status: 'pending',
      instalments: plan.map((p) => ({ index: p.index, amount: p.amount, dueDate: p.dueDate.toISOString(), status: 'pending' as const })),
      payments: [],
    },
  })
}

/** Starts a gateway payment for one instalment and returns the URL to send the buyer to. */
export async function startInstalmentPayment(args: { payload: Payload; tenant: Tenant; order: Order; mobile?: string | null }): Promise<string> {
  const { payload, tenant, order } = args
  const next = order.instalments?.find((i) => i.status !== 'paid')
  if (!next) throw new CheckoutError('همه اقساط این سفارش پرداخت شده است.')

  const origin = await getRequestOrigin()
  const gateway = getPayment(tenant, origin)
  const { authority, redirectUrl } = await gateway.createPayment({
    amount: next.amount,
    description: `سفارش ${order.id} — قسط ${next.index + 1}`,
    callbackUrl: `${origin}/payments/callback?order=${order.id}`,
    mobile: args.mobile ?? undefined,
    orderId: String(order.id),
  })

  await payload.update({
    collection: 'orders',
    id: order.id,
    overrideAccess: true,
    data: {
      payments: [
        ...(order.payments ?? []),
        { instalmentIndex: next.index, provider: gateway.name, authority, amount: next.amount, status: 'started' as const },
      ],
    },
  })
  return redirectUrl
}

export type CallbackOutcome = { status: 'paid' | 'partial' | 'failed'; orderId: number; message?: string }

/**
 * Handles the gateway callback. Idempotent: a verified attempt is never verified twice,
 * and enrollment is created once.
 */
export async function handlePaymentCallback(payload: Payload, orderId: number, params: URLSearchParams): Promise<CallbackOutcome> {
  const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
  const tenant = await payload.findByID({ collection: 'tenants', id: idOf(order.tenant)!, overrideAccess: true })
  const gateway = getPayment(tenant)
  const cb = gateway.parseCallback(params)
  const attempt = order.payments?.find((p) => p.authority === cb?.authority)
  if (!cb || !attempt) return { status: 'failed', orderId, message: 'تراکنش پیدا نشد.' }

  const isFullyPaid = (o: Order) => (o.instalments ?? []).every((i) => i.status === 'paid')
  if (attempt.status === 'verified') return { status: isFullyPaid(order) ? 'paid' : 'partial', orderId }

  const markAttempt = (patch: Partial<NonNullable<Order['payments']>[number]>) =>
    (order.payments ?? []).map((p) => (p.authority === attempt.authority ? { ...p, ...patch } : p))

  if (!cb.success) {
    await payload.update({ collection: 'orders', id: orderId, overrideAccess: true, data: { payments: markAttempt({ status: 'failed', error: 'cancelled' }) } })
    return { status: 'failed', orderId, message: 'پرداخت انجام نشد یا لغو شد.' }
  }

  const result = await gateway.verify({ authority: attempt.authority, amount: attempt.amount })
  if (!result.ok) {
    await payload.update({ collection: 'orders', id: orderId, overrideAccess: true, data: { payments: markAttempt({ status: 'failed', error: `${result.code}: ${result.message}` }) } })
    return { status: 'failed', orderId, message: 'بانک پرداخت را تأیید نکرد. اگر مبلغی کسر شده، تا ۷۲ ساعت بازمی‌گردد.' }
  }

  const firstPayment = !(order.instalments ?? []).some((i) => i.status === 'paid')
  const instalments = (order.instalments ?? []).map((i) =>
    i.index === attempt.instalmentIndex ? { ...i, status: 'paid' as const, paidAt: new Date().toISOString() } : i,
  )
  const updated = await payload.update({
    collection: 'orders',
    id: orderId,
    overrideAccess: true,
    data: {
      instalments,
      payments: markAttempt({ status: 'verified', refId: result.refId, cardPan: result.cardPan ?? null }),
      status: instalments.every((i) => i.status === 'paid') ? 'paid' : 'partially_paid',
    },
  })

  if (firstPayment) await onFirstPayment(payload, updated, tenant)
  return { status: isFullyPaid(updated) ? 'paid' : 'partial', orderId }
}

async function onFirstPayment(payload: Payload, order: Order, tenant: Tenant) {
  const userId = idOf(order.user)!
  const courseId = idOf(order.course)!
  const cohortId = idOf(order.cohort)

  const existing = await payload.find({
    collection: 'enrollments',
    where: { and: [{ user: { equals: userId } }, { course: { equals: courseId } }] },
    limit: 1,
    overrideAccess: true,
  })
  if (!existing.docs[0]) {
    await payload.create({
      collection: 'enrollments',
      overrideAccess: true,
      data: { tenant: tenant.id, user: userId, course: courseId, cohort: cohortId, order: order.id, status: 'active' },
    })
  }

  if (cohortId) {
    const cohort = await payload.findByID({ collection: 'cohorts', id: cohortId, depth: 0, overrideAccess: true })
    await payload.update({ collection: 'cohorts', id: cohortId, overrideAccess: true, data: { seatsTaken: (cohort.seatsTaken ?? 0) + 1 } })
  }

  if (order.couponCode) {
    const c = await payload.find({
      collection: 'coupons',
      where: { and: [{ tenant: { equals: tenant.id } }, { code: { equals: order.couponCode } }] },
      limit: 1,
      overrideAccess: true,
    })
    const coupon = c.docs[0]
    if (coupon) await payload.update({ collection: 'coupons', id: coupon.id, overrideAccess: true, data: { usedCount: (coupon.usedCount ?? 0) + 1 } })
  }

  const user = await payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
  const course = await payload.findByID({ collection: 'courses', id: courseId, depth: 0, overrideAccess: true })
  await notify(user.phone, `${tenant.name}: ثبت‌نام شما در «${course.title}» قطعی شد. مبلغ کل: ${formatToman(rial(order.total))}`, tenant)
}
