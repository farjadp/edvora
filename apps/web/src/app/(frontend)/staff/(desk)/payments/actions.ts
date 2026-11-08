'use server'

/**
 * Finance desk payment actions (ADR 017 §8). Zod-validated; every action re-checks the staff session in the academy
 * resolved from the Host header, then lib/payments checks permission and four-eyes again. Returns `{ redirectTo }`,
 * never redirect() (ADR 005).
 */
import { REJECTION_REASON_MAX } from '@edvora/core'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PaymentError, recordManualPayment, staffPaymentAction } from '../../../../../lib/payments'
import { getStaffSession } from '../../../../../lib/staff'
import type { PayloadRequest } from 'payload'
import type { Tenant, User } from '../../../../../payload-types'

export type PaymentDeskState = { ok: boolean; message: string; redirectTo?: string } | null

async function actor(): Promise<{ tenant: Tenant; user: User; req: PayloadRequest } | null> {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !s.user || !s.req) return null
  return { tenant: s.tenant, user: s.user, req: s.req }
}

const DENIED: PaymentDeskState = { ok: false, message: 'نشست شما معتبر نیست. دوباره وارد شوید.' }
const fail = (err: unknown, where: string): PaymentDeskState => {
  if (err instanceof PaymentError) return { ok: false, message: err.message }
  console.error(`[${where}]`, err)
  return { ok: false, message: 'انجام نشد. دوباره تلاش کنید.' }
}

const ActionInput = z.object({
  paymentId: z.coerce.number().int().positive(),
  action: z.enum(['record', 'confirm', 'reject']),
  reason: z.string().trim().max(REJECTION_REASON_MAX).optional(),
  back: z.string().max(200).optional(),
})

const DONE = { recorded: 'بررسی اول ثبت شد. حالا نفر دوم باید تأیید کند.', confirmed: 'پرداخت تأیید شد و قسط‌ها تسویه شد.', rejected: 'پرداخت رد شد و دلیل آن به دانشجو نشان داده می‌شود.' } as const

export async function paymentReviewAction(_prev: PaymentDeskState, form: FormData): Promise<PaymentDeskState> {
  const parsed = ActionInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: 'اطلاعات فرم کامل نیست.' }
  const s = await actor()
  if (!s) return DENIED
  try {
    const status = await staffPaymentAction(s, parsed.data.paymentId, parsed.data.action, parsed.data.reason)
    const back = parsed.data.back?.startsWith('/staff/') ? parsed.data.back : '/staff/finance'
    revalidatePath(back)
    return { ok: true, message: DONE[status as keyof typeof DONE] ?? 'انجام شد.', redirectTo: back }
  } catch (err) {
    return fail(err, 'paymentReviewAction')
  }
}

const ManualInput = z.object({
  orderId: z.coerce.number().int().positive({ message: 'شمارهٔ سفارش را وارد کنید.' }),
  pick: z.enum(['next', 'all']).default('next'),
  channel: z.enum(['cash', 'pos', 'transfer', 'other']),
  reference: z.string().trim().max(60).default(''),
  paidAt: z.string().min(10, 'زمان پرداخت را وارد کنید.').max(40),
  note: z.string().trim().max(500).optional(),
})

export async function recordManualPaymentAction(_prev: PaymentDeskState, form: FormData): Promise<PaymentDeskState> {
  const parsed = ManualInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'اطلاعات فرم کامل نیست.' }
  const s = await actor()
  if (!s) return DENIED
  const d = parsed.data
  try {
    const paidAt = /Z|[+-]\d\d:\d\d$/.test(d.paidAt) ? d.paidAt : `${d.paidAt}+03:30`
    await recordManualPayment(s, { orderId: d.orderId, pick: d.pick, channel: d.channel, reference: d.reference, paidAt, note: d.note })
    revalidatePath('/staff/finance')
    return { ok: true, message: 'پرداخت ثبت شد. یک همکار دیگر باید آن را تأیید کند.', redirectTo: `/staff/payments/orders/${d.orderId}` }
  } catch (err) {
    return fail(err, 'recordManualPaymentAction')
  }
}
