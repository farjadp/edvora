'use server'

import { generateOtp, hashOtp, normalizeIranMobile, safeEqual, toLatinDigits } from '@edvora/core'
import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { env } from '../../env'
import { CheckoutError, createOrder, startInstalmentPayment } from '../../lib/checkout'
import { idOf } from '../../lib/ids'
import { getPayloadClient } from '../../lib/payload'
import { getSms, notify } from '../../lib/providers'
import { getCurrentUser, startSession } from '../../lib/session'
import { getCurrentTenant } from '../../lib/tenant'

/**
 * Actions never call redirect() for same-site pages: Next renders that target through an internal
 * request that loses the academy's Host header (wrong tenant). They return `redirectTo` and the
 * browser navigates instead. See docs/adr/005-tenant-resolution.md.
 */
export type FormState = {
  ok: boolean
  message: string
  step?: 'phone' | 'code'
  phone?: string
  devCode?: string
  redirectTo?: string
} | null

const safeNext = (next: unknown) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard')

// ---------------------------------------------------------------- Leads (CRM)

const LeadInput = z.object({
  name: z.string().trim().min(2, 'نام را کامل بنویسید.').max(80),
  phone: z.string().transform((v, ctx) => {
    const p = normalizeIranMobile(v)
    if (!p) ctx.addIssue({ code: 'custom', message: 'شماره موبایل معتبر نیست.' })
    return p ?? ''
  }),
  courseId: z.coerce.number().int().positive().optional().catch(undefined),
  message: z.string().max(1000).optional(),
  page: z.string().max(300).optional(),
  website: z.string().max(0).optional(), // honeypot: bots fill it, humans can't see it
})

export async function submitLead(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = LeadInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'اطلاعات فرم کامل نیست.' }
  const data = parsed.data

  try {
    const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])
    const recent = await payload.find({
      collection: 'leads',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          { phone: { equals: data.phone } },
          { createdAt: { greater_than: new Date(Date.now() - 10 * 60 * 1000).toISOString() } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })
    if (!recent.docs[0]) {
      const referer = (await headers()).get('referer') ?? ''
      const utm = referer ? new URL(referer).searchParams : new URLSearchParams()
      await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          tenant: tenant.id,
          name: data.name,
          phone: data.phone,
          course: data.courseId ?? null,
          message: data.message ?? null,
          status: 'new',
          source: { page: data.page ?? null, utmSource: utm.get('utm_source'), utmCampaign: utm.get('utm_campaign') },
        },
      })
      await notify(data.phone, `${tenant.name}: درخواست مشاوره شما ثبت شد. مشاوران ما به‌زودی با شما تماس می‌گیرند.`)
    }
    return { ok: true, message: 'درخواست شما ثبت شد. مشاوران ما به‌زودی با شما تماس می‌گیرند.' }
  } catch (err) {
    console.error('[submitLead]', err)
    return { ok: false, message: 'ثبت درخواست انجام نشد. لطفاً دوباره تلاش کنید.' }
  }
}

// ---------------------------------------------------------------- Phone + SMS login

const OTP_TTL_MS = 2 * 60 * 1000
const OTP_MAX_ATTEMPTS = 5

export async function requestOtp(_prev: FormState, form: FormData): Promise<FormState> {
  const phone = normalizeIranMobile(String(form.get('phone') ?? ''))
  if (!phone) return { ok: false, step: 'phone', message: 'شماره موبایل معتبر نیست.' }

  try {
    const payload = await getPayloadClient()
    const recent = await payload.find({
      collection: 'otp-codes',
      where: { and: [{ phone: { equals: phone } }, { createdAt: { greater_than: new Date(Date.now() - 60 * 1000).toISOString() } }] },
      limit: 1,
      overrideAccess: true,
    })
    if (recent.docs[0]) return { ok: true, step: 'code', phone, message: 'کد قبلاً ارسال شده است. یک دقیقه صبر کنید.' }

    const code = generateOtp(5)
    await payload.create({
      collection: 'otp-codes',
      overrideAccess: true,
      data: { phone, codeHash: hashOtp(code, phone, env().SESSION_SECRET), expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString() },
    })
    const sent = await getSms().sendTemplate({ to: phone, template: env().KAVENEGAR_OTP_TEMPLATE, tokens: [code] })
    if (!sent.ok) return { ok: false, step: 'phone', message: 'ارسال پیامک انجام نشد. دوباره تلاش کنید.' }

    return {
      ok: true,
      step: 'code',
      phone,
      message: 'کد ورود پیامک شد.',
      // Only with the mock SMS provider, so local dev and agents can log in without a phone.
      devCode: env().SMS_PROVIDER === 'mock' ? code : undefined,
    }
  } catch (err) {
    console.error('[requestOtp]', err)
    return { ok: false, step: 'phone', message: 'خطایی رخ داد. دوباره تلاش کنید.' }
  }
}

export async function verifyOtp(_prev: FormState, form: FormData): Promise<FormState> {
  const phone = normalizeIranMobile(String(form.get('phone') ?? ''))
  const code = String(form.get('code') ?? '').replace(/[^\d۰-۹]/g, '')
  const name = String(form.get('name') ?? '').trim().slice(0, 80)
  const next = safeNext(form.get('next'))
  if (!phone) return { ok: false, step: 'phone', message: 'شماره موبایل معتبر نیست.' }

  const payload = await getPayloadClient()
  const tenant = await getCurrentTenant()
  const latinCode = toLatinDigits(code)

  const res = await payload.find({
    collection: 'otp-codes',
    where: { and: [{ phone: { equals: phone } }, { consumed: { equals: false } }] },
    sort: '-createdAt',
    limit: 1,
    overrideAccess: true,
  })
  const otp = res.docs[0]
  if (!otp || new Date(otp.expiresAt) < new Date()) return { ok: false, step: 'code', phone, message: 'کد منقضی شده است. دوباره درخواست دهید.' }
  if ((otp.attempts ?? 0) >= OTP_MAX_ATTEMPTS) return { ok: false, step: 'code', phone, message: 'تعداد تلاش‌ها زیاد بود. کد جدید بگیرید.' }

  if (!safeEqual(otp.codeHash, hashOtp(latinCode, phone, env().SESSION_SECRET))) {
    await payload.update({ collection: 'otp-codes', id: otp.id, overrideAccess: true, data: { attempts: (otp.attempts ?? 0) + 1 } })
    return { ok: false, step: 'code', phone, message: 'کد وارد شده درست نیست.' }
  }
  await payload.update({ collection: 'otp-codes', id: otp.id, overrideAccess: true, data: { consumed: true } })

  const found = await payload.find({ collection: 'users', where: { phone: { equals: phone } }, limit: 1, depth: 0, overrideAccess: true })
  let user = found.docs[0]
  if (!user) {
    user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        phone,
        name: name || null,
        roles: ['student'],
        email: `${phone}@phone.${tenant.slug}.edvora.local`,
        password: randomBytes(24).toString('base64url'),
        tenants: [{ tenant: tenant.id }],
      },
    })
  } else if (!user.tenants?.some((t) => idOf(t.tenant) === tenant.id)) {
    user = await payload.update({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
      data: { tenants: [...(user.tenants ?? []).map((t) => ({ tenant: idOf(t.tenant)! })), { tenant: tenant.id }] },
    })
  }

  await startSession(user, tenant.id)
  return { ok: true, step: 'code', phone, message: 'وارد شدید.', redirectTo: next }
}

// ---------------------------------------------------------------- Checkout

export async function startCheckout(_prev: FormState, form: FormData): Promise<FormState> {
  const cohortId = Number(form.get('cohortId'))
  const instalments = Number(form.get('instalments') ?? 1)
  const coupon = String(form.get('coupon') ?? '')
  const back = safeNext(form.get('back'))

  const user = await getCurrentUser()
  if (!user) return { ok: true, message: 'برای ثبت‌نام وارد شوید.', redirectTo: `/login?next=${encodeURIComponent(back)}` }
  if (!Number.isInteger(cohortId) || cohortId <= 0) return { ok: false, message: 'دوره انتخاب نشده است.' }

  try {
    const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])
    const order = await createOrder({ payload, tenant, userId: user.id, cohortId, instalmentCount: instalments, couponCode: coupon })
    const url = await startInstalmentPayment({ payload, tenant, order, mobile: user.phone })
    return { ok: true, message: 'در حال انتقال به درگاه…', redirectTo: url }
  } catch (err) {
    if (err instanceof CheckoutError) return { ok: false, message: err.message }
    console.error('[startCheckout]', err)
    return { ok: false, message: 'اتصال به درگاه پرداخت انجام نشد. دوباره تلاش کنید.' }
  }
}

// ---------------------------------------------------------------- Learning

export async function markLessonComplete(form: FormData): Promise<void> {
  const lessonId = Number(form.get('lessonId'))
  const back = safeNext(form.get('back'))
  const user = await getCurrentUser()
  if (!user) return

  const payload = await getPayloadClient()
  const lesson = await payload.findByID({ collection: 'lessons', id: lessonId, depth: 0, overrideAccess: true })
  const res = await payload.find({
    collection: 'enrollments',
    where: { and: [{ user: { equals: user.id } }, { course: { equals: idOf(lesson.course) } }, { status: { not_equals: 'cancelled' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const enrollment = res.docs[0]
  if (enrollment) {
    const done = new Set((enrollment.completedLessons ?? []).map((l) => idOf(l)!))
    done.add(lesson.id)
    await payload.update({ collection: 'enrollments', id: enrollment.id, overrideAccess: true, data: { completedLessons: [...done] } })
  }
  revalidatePath(back)
}
