import 'server-only'
import { formatToman, priceOrder, rial } from '@edvora/core'
import type { Payload } from 'payload'
import type { Order, Tenant } from '../payload-types'
import { CheckoutError, findCoupon, toCoreCoupon } from './coupons'
import { idOf } from './ids'
import { notify } from './providers'

export { CheckoutError, findCoupon }

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
  const coupon = await findCoupon(payload, tenant.id, args.couponCode)
  const { subtotal, discount, total, instalments } = priceOrder({
    price: cohort.priceOverride ?? course.price,
    coupon: toCoreCoupon(coupon),
    instalmentCount: args.instalmentCount,
    maxInstalments: course.maxInstalments,
    firstDueDate: new Date(),
  })

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
      instalments: instalments.map((p) => ({ index: p.index, amount: p.amount, dueDate: p.dueDate.toISOString(), status: 'pending' as const })),
      payments: [],
    },
  })
}

/** First confirmed payment of an order: enrollment, seat, coupon use, SMS. Called by lib/payments only. */
export async function onFirstPayment(payload: Payload, order: Order, tenant: Tenant) {
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
