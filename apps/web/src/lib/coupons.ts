import { rial, type Coupon as CoreCoupon } from '@edvora/core'
import type { Payload, PayloadRequest } from 'payload'
import type { Coupon } from '../payload-types'

/** A user-facing checkout/pricing error (Persian message). */
export class CheckoutError extends Error {}

/** Finds a usable coupon for this academy, or throws a user-facing error. */
export async function findCoupon(payload: Payload, tenantId: number, code: string | null | undefined, req?: PayloadRequest): Promise<Coupon | null> {
  if (!code?.trim()) return null
  const res = await payload.find({
    collection: 'coupons',
    where: { and: [{ tenant: { equals: tenantId } }, { code: { equals: code.trim().toUpperCase() } }, { active: { equals: true } }] },
    limit: 1,
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  const coupon = res.docs[0]
  if (!coupon) throw new CheckoutError('کد تخفیف معتبر نیست.')
  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) throw new CheckoutError('مهلت این کد تخفیف تمام شده است.')
  if (coupon.usageLimit && (coupon.usedCount ?? 0) >= coupon.usageLimit) throw new CheckoutError('ظرفیت این کد تخفیف تکمیل شده است.')
  return coupon
}

export const toCoreCoupon = (c: Coupon | null): CoreCoupon | null =>
  !c ? null : c.kind === 'percent' ? { kind: 'percent', value: c.value, maxDiscount: c.maxDiscount ? rial(c.maxDiscount) : undefined } : { kind: 'fixed', value: rial(c.value) }
