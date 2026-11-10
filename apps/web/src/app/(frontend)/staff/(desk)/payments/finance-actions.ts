'use server'

/**
 * Finance desk actions (E-023, ADR 021): contact notes and refunds. Zod-validated; every action re-checks the staff
 * session in the academy resolved from the Host header, then lib/finance checks permission and four-eyes again.
 * Returns `{ redirectTo }`, never redirect() (ADR 005).
 */
import { CONTACT_NOTE_MAX, CONTACT_OUTCOMES, REFUND_REASON_MAX, REFUND_REFERENCE_MAX, toLatinDigits, tomanToRial } from '@edvora/core'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { FinanceError, recordContact, refundAction, requestRefund, type FinanceCtx } from '../../../../../lib/finance'
import { getStaffSession } from '../../../../../lib/staff'

export type FinanceDeskState = { ok: boolean; message: string; redirectTo?: string } | null

async function actor(): Promise<FinanceCtx | null> {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !s.user || !s.req) return null
  return { tenant: s.tenant, user: s.user, req: s.req }
}

const DENIED: FinanceDeskState = { ok: false, message: 'نشست شما معتبر نیست. دوباره وارد شوید.' }
const fail = (err: unknown, where: string): FinanceDeskState => {
  if (err instanceof FinanceError) return { ok: false, message: err.message }
  console.error(`[${where}]`, err)
  return { ok: false, message: 'انجام نشد. دوباره تلاش کنید.' }
}
const backOf = (v: string | undefined, fallback: string) => (v && /^\/staff\/[\w\-/?=&%.]*$/.test(v) && !v.includes('//') ? v : fallback)

const ContactInput = z.object({
  orderId: z.coerce.number().int().positive(),
  instalmentIndex: z.coerce.number().int().min(0).max(100),
  outcome: z.enum(Object.keys(CONTACT_OUTCOMES) as [keyof typeof CONTACT_OUTCOMES, ...(keyof typeof CONTACT_OUTCOMES)[]], { message: 'نتیجهٔ تماس را انتخاب کنید.' }),
  note: z.string().trim().max(CONTACT_NOTE_MAX).optional(),
  back: z.string().max(300).optional(),
})

export async function contactNoteAction(_prev: FinanceDeskState, form: FormData): Promise<FinanceDeskState> {
  const parsed = ContactInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'اطلاعات فرم کامل نیست.' }
  const s = await actor()
  if (!s) return DENIED
  try {
    await recordContact(s, parsed.data)
    const back = backOf(parsed.data.back, '/staff/finance?tab=overdue')
    revalidatePath('/staff/finance')
    return { ok: true, message: 'یادداشت تماس ثبت شد.', redirectTo: back }
  } catch (err) {
    return fail(err, 'contactNoteAction')
  }
}

/** Toman typed by a person → integer rials. Persian digits and separators allowed; decimals refused. */
const TomanAmount = z
  .string()
  .transform((v) => toLatinDigits(v).replace(/[,٬\s]/g, ''))
  .refine((v) => /^\d{1,13}$/.test(v), 'مبلغ را به تومان و فقط با رقم وارد کنید.')
  .transform((v) => tomanToRial(Number(v)))

const RefundInput = z.object({
  orderId: z.coerce.number().int().positive(),
  amount: TomanAmount,
  reason: z.string().trim().max(REFUND_REASON_MAX),
})

export async function refundRequestAction(_prev: FinanceDeskState, form: FormData): Promise<FinanceDeskState> {
  const parsed = RefundInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'اطلاعات فرم کامل نیست.' }
  const s = await actor()
  if (!s) return DENIED
  try {
    await requestRefund(s, parsed.data)
    const back = `/staff/payments/orders/${parsed.data.orderId}`
    revalidatePath(back)
    return { ok: true, message: 'درخواست بازپرداخت ثبت شد. همکار دیگری باید آن را تأیید کند.', redirectTo: back }
  } catch (err) {
    return fail(err, 'refundRequestAction')
  }
}

const ReviewInput = z.object({
  refundId: z.coerce.number().int().positive(),
  action: z.enum(['approve', 'reject', 'cancel', 'complete']),
  reason: z.string().trim().max(REFUND_REASON_MAX).optional(),
  reference: z
    .string()
    .trim()
    .max(REFUND_REFERENCE_MAX)
    .transform((v) => toLatinDigits(v))
    .optional(),
  back: z.string().max(300).optional(),
})

const DONE = {
  approved: 'بازپرداخت تأیید شد. پس از واریز، شمارهٔ پیگیری آن را ثبت کنید.',
  rejected: 'درخواست بازپرداخت رد شد.',
  cancelled: 'درخواست بازپرداخت لغو شد.',
  refunded: 'بازپرداخت ثبت شد و وضعیت سفارش به‌روز شد.',
} as const

export async function refundReviewAction(_prev: FinanceDeskState, form: FormData): Promise<FinanceDeskState> {
  const parsed = ReviewInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'اطلاعات فرم کامل نیست.' }
  const s = await actor()
  if (!s) return DENIED
  try {
    const status = await refundAction(s, parsed.data.refundId, parsed.data.action, { reason: parsed.data.reason, reference: parsed.data.reference })
    const back = backOf(parsed.data.back, '/staff/finance?tab=refunds')
    revalidatePath('/staff/finance')
    return { ok: true, message: DONE[status as keyof typeof DONE] ?? 'انجام شد.', redirectTo: back }
  } catch (err) {
    return fail(err, 'refundReviewAction')
  }
}
