'use server'

import { LEAD_OUTCOMES, canTransitionLead, generateOtp, hashOtp, LEAD_STATUSES, nextFollowUpAt as defaultFollowUpAt, normalizeIranMobile, safeEqual, toLatinDigits, type LeadStatus } from '@edvora/core'
import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { env } from '../../env'
import { CheckoutError, createOrder, startInstalmentPayment } from '../../lib/checkout'
import { saveSubmission } from '../../lib/assignmentSubmissions'
import { idOf } from '../../lib/ids'
import { FOLLOW_UP_CONTEXT } from '../../collections/Leads'
import { canIn } from '../../access/permissions'
import { onLessonMarked, onLessonWatched, safely, type WatchResult } from '../../lib/gamification'
import { blockersFor, findEnrollment, loadCourseState } from '../../lib/learning'
import { getPayloadClient } from '../../lib/payload'
import { getSms, notify } from '../../lib/providers'
import { QuizError, saveAnswers, startAttempt, submitAttempt } from '../../lib/quizAttempts'
import { getCurrentUser, startSession } from '../../lib/session'
import { getStaffSession } from '../../lib/staff'
import { studentAttempt, studentCourse, studentQuiz } from '../../lib/student'
import { getCurrentTenant } from '../../lib/tenant'
import { IMPORT_CLAIM_PAGE } from '../../lib/wpimport/constants'

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

// ---------------------------------------------------------------- WordPress import: "I bought on the old site" (W23)

const ImportClaimInput = z.object({
  oldName: z.string().trim().min(2, 'نامی را که در سایت قبلی داشتید بنویسید.').max(80),
  oldEmail: z.string().trim().max(120).optional().transform((v) => (v ? v : undefined)).pipe(z.string().email('ایمیل معتبر نیست.').optional()),
  message: z.string().trim().max(500).optional(),
})

/**
 * A signed-in student whose old purchases were not found (their phone was not in WordPress) asks the academy to
 * link them. Stored as a lead for the academy (source `import-claim`); an admin with `import.run` links the account
 * to a held WordPress record by phone in the import desk. Nothing is linked automatically, never by email.
 */
export async function submitImportClaim(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = ImportClaimInput.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'اطلاعات فرم کامل نیست.' }
  const user = await getCurrentUser()
  if (!user?.phone) return { ok: false, message: 'ابتدا وارد شوید.' }
  try {
    const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])
    const recent = await payload.count({
      collection: 'leads',
      where: { and: [{ tenant: { equals: tenant.id } }, { phone: { equals: user.phone } }, { 'source.page': { equals: IMPORT_CLAIM_PAGE } }, { createdAt: { greater_than: new Date(Date.now() - 24 * 3600_000).toISOString() } }] },
      overrideAccess: true,
    })
    if (recent.totalDocs === 0) {
      const v = parsed.data
      await payload.create({
        collection: 'leads',
        overrideAccess: true,
        data: {
          tenant: tenant.id,
          name: user.name || v.oldName,
          phone: user.phone,
          message: [`نام در سایت قبلی: ${v.oldName}`, v.oldEmail ? `ایمیل قبلی: ${v.oldEmail}` : null, v.message ? `توضیح: ${v.message}` : null].filter(Boolean).join(' · '),
          status: 'new',
          source: { page: IMPORT_CLAIM_PAGE },
        },
      })
    }
    return { ok: true, message: 'درخواست شما ثبت شد. پس از بررسی، دوره‌های قبلی‌تان به همین حساب اضافه می‌شود.' }
  } catch (err) {
    console.error('[submitImportClaim]', err)
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

  if ((user.status ?? 'active') !== 'active') return { ok: false, step: 'code', phone, message: 'این حساب غیرفعال است. با پشتیبانی آکادمی تماس بگیرید.' }
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
  const parsed = z.object({ lessonId: z.coerce.number().int().positive(), back: z.string().max(300) }).safeParse(Object.fromEntries(form))
  if (!parsed.success) return
  const back = safeNext(parsed.data.back)
  const user = await getCurrentUser()
  if (!user) return

  try {
    const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])
    const lesson = await payload.findByID({ collection: 'lessons', id: parsed.data.lessonId, depth: 0, overrideAccess: true, disableErrors: true })
    if (!lesson || idOf(lesson.tenant) !== tenant.id) return
    const course = await payload.findByID({ collection: 'courses', id: idOf(lesson.course)!, depth: 0, overrideAccess: true })
    const enrollment = await findEnrollment({ payload }, tenant.id, user.id, course.id)
    if (!enrollment) return
    // Server-side gates: drip (R3) and required quiz/assignment of this lesson (Q8).
    const state = await loadCourseState({ payload }, { tenantId: tenant.id, course, enrollment })
    if (state.locks.get(String(lesson.id))?.state !== 'open' || blockersFor(state, lesson.id).length > 0) return
    const done = new Set((enrollment.completedLessons ?? []).map((l) => idOf(l)!))
    done.add(lesson.id)
    const updated = await payload.update({ collection: 'enrollments', id: enrollment.id, overrideAccess: true, data: { completedLessons: [...done] } })
    // E-028: progress only. XP needs a server-confirmed completion (watched ≥ threshold or the lesson's quiz/assignment).
    await safely('mark complete', () => onLessonMarked({ payload }, { tenant, enrollment: updated, lesson, state }))
  } catch (err) {
    console.error('[markLessonComplete]', err)
  }
  revalidatePath(back)
}

const WatchInput = z.object({
  lessonId: z.number().int().positive(),
  /** Seconds actually played since the previous beat (the server caps it by wall-clock time). */
  playedSeconds: z.number().min(0).max(600),
  /** The player's media duration; used only when the lesson has no staff-entered duration. */
  durationSeconds: z.number().positive().max(24 * 60 * 60).nullable().optional(),
})

export type WatchBeaconState = ({ ok: true } & WatchResult) | { ok: false; message: string }

/**
 * Player progress beacon (E-028 T3). Call every ~15–30 s while the video is PLAYING (not paused/hidden) with the
 * seconds played since the last call. At ≥ the academy's threshold (default 90 %) the lesson is completed and its
 * XP is paid once. Server-checked: tenant, signed-in student, live enrollment, drip.
 */
export async function reportLessonWatch(input: z.input<typeof WatchInput>): Promise<WatchBeaconState> {
  const parsed = WatchInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'درخواست نامعتبر است.' }
  const user = await getCurrentUser()
  if (!user) return { ok: false, message: 'وارد نشده‌اید.' }
  try {
    const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])
    const lesson = await payload.findByID({ collection: 'lessons', id: parsed.data.lessonId, depth: 0, overrideAccess: true, disableErrors: true })
    if (!lesson || idOf(lesson.tenant) !== tenant.id) return { ok: false, message: 'این جلسه در دسترس نیست.' }
    const course = await payload.findByID({ collection: 'courses', id: idOf(lesson.course)!, depth: 0, overrideAccess: true })
    const enrollment = await findEnrollment({ payload }, tenant.id, user.id, course.id)
    if (!enrollment) return { ok: false, message: 'این جلسه در دسترس نیست.' }
    const state = await loadCourseState({ payload }, { tenantId: tenant.id, course, enrollment })
    if (state.locks.get(String(lesson.id))?.state !== 'open') return { ok: false, message: 'این جلسه هنوز باز نشده است.' }
    const result = await onLessonWatched({ payload }, { tenant, enrollment, lesson, state, playedSeconds: parsed.data.playedSeconds, durationSeconds: parsed.data.durationSeconds ?? null })
    return { ok: true, ...result }
  } catch (err) {
    console.error('[reportLessonWatch]', err)
    return { ok: false, message: 'ثبت پیشرفت انجام نشد.' }
  }
}

// ---------------------------------------------------------------- Advisor follow-ups (E-028 T6)

const FollowUpInput = z.object({
  leadId: z.coerce.number().int().positive(),
  outcome: z.enum(LEAD_OUTCOMES),
  note: z.string().trim().max(1000).optional(),
  /** Next follow-up (ISO, UTC). Omitted = the stage default; null = none. */
  nextFollowUpAt: z.iso.datetime({ offset: true }).nullable().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
})

export type FollowUpState = { ok: boolean; message: string }

/**
 * Records a follow-up outcome on a lead (the only thing the advisor goal counts). Staff session (E-022), the lead
 * must be in this academy and inside the actor's `leads.view` scope (own leads for advisors, G8.5). Runs as the
 * staff user, so collection access, the lead guard and the audit log all apply.
 */
export async function recordFollowUpOutcome(input: z.input<typeof FollowUpInput>): Promise<FollowUpState> {
  const parsed = FollowUpInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'اطلاعات پیگیری کامل نیست.' }
  const data = parsed.data
  try {
    const s = await getStaffSession()
    if (s.state !== 'ok' || !s.req || !s.user) return { ok: false, message: 'دسترسی ندارید.' }
    const payload = s.req.payload
    const lead = await payload.findByID({ collection: 'leads', id: data.leadId, depth: 0, overrideAccess: true, disableErrors: true })
    // Another academy's lead: same answer as "not found" (no existence leak).
    if (!lead || idOf(lead.tenant) !== s.tenant.id) return { ok: false, message: 'این مورد پیدا نشد.' }
    if (!(await canIn(s.req, s.tenant.id, 'leads.view', { ownerId: idOf(lead.advisor), courseId: idOf(lead.course) }))) return { ok: false, message: 'این مورد پیدا نشد.' }
    const from = (lead.status ?? 'new') as LeadStatus
    const to = data.status ?? from
    if (!canTransitionLead(from, to)) return { ok: false, message: 'این تغییر وضعیت مجاز نیست.' }
    const now = new Date()
    const next = data.nextFollowUpAt === undefined ? (defaultFollowUpAt(to, now)?.toISOString() ?? null) : data.nextFollowUpAt
    await payload.update({
      collection: 'leads',
      id: lead.id,
      req: s.req,
      overrideAccess: false,
      context: { [FOLLOW_UP_CONTEXT]: true },
      data: {
        status: to,
        nextFollowUpAt: to === 'enrolled' ? null : next,
        lastOutcome: data.outcome,
        lastOutcomeAt: now.toISOString(),
        lastOutcomeBy: s.user.id,
        followUps: [
          ...(lead.followUps ?? []).map((f) => ({ ...f, by: idOf(f.by) })),
          { at: now.toISOString(), outcome: data.outcome, by: s.user.id, dueAt: lead.nextFollowUpAt ?? null, note: data.note ?? null },
        ],
      },
    })
    revalidatePath('/staff/leads')
    return { ok: true, message: 'نتیجهٔ پیگیری ثبت شد.' }
  } catch (err) {
    console.error('[recordFollowUpOutcome]', err)
    return { ok: false, message: 'ثبت انجام نشد. دوباره تلاش کنید.' }
  }
}

// ---------------------------------------------------------------- Quizzes (phase-2 §Q)

const QuizRef = z.object({ quizId: z.coerce.number().int().positive(), course: z.string().trim().min(1).max(200) })

export async function startQuiz(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = QuizRef.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, message: 'درخواست نامعتبر است.' }
  try {
    const ctx = await studentQuiz(parsed.data.course, parsed.data.quizId)
    if (!ctx) return { ok: false, message: 'این آزمون در دسترس نیست.' }
    if (!ctx.status.released) return { ok: false, message: 'این آزمون با باز شدن جلسه‌اش در دسترس قرار می‌گیرد.' }
    const payload = await getPayloadClient()
    await startAttempt({ payload }, { tenantId: ctx.tenant.id, quiz: ctx.quiz, enrollment: ctx.state.enrollment, attempts: ctx.status.attempts, extraAttempts: ctx.status.extraAttempts })
    return { ok: true, message: 'آزمون شروع شد.', redirectTo: `/learn/${ctx.course.slug}/quiz/${ctx.quiz.id}` }
  } catch (err) {
    if (err instanceof QuizError) return { ok: false, message: err.message }
    console.error('[startQuiz]', err)
    return { ok: false, message: 'شروع آزمون انجام نشد. دوباره تلاش کنید.' }
  }
}

const AnswerInput = z.record(
  z.string().max(40),
  z.object({ optionIds: z.array(z.string().max(80)).max(50).optional(), text: z.string().max(500).optional() }),
)
const AttemptInput = z.object({ attemptId: z.number().int().positive(), answers: AnswerInput })

export type QuizSaveState = { ok: boolean; message: string; closed?: boolean; redirectTo?: string }

const resultUrl = (courseSlug: string, quizId: number, attemptNo: number) => `/learn/${courseSlug}/quiz/${quizId}/attempt/${attemptNo}`

/** Autosave (Q3). Called by the quiz screen; the server decides whether time is up. */
export async function saveQuizAnswers(input: z.input<typeof AttemptInput>): Promise<QuizSaveState> {
  const parsed = AttemptInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'پاسخ‌ها نامعتبرند.' }
  try {
    const ctx = await studentAttempt(parsed.data.attemptId)
    if (!ctx) return { ok: false, message: 'این آزمون در دسترس نیست.', closed: true }
    const url = resultUrl(ctx.course.slug, ctx.quiz.id, ctx.attempt.attemptNo)
    if (ctx.attempt.status !== 'in_progress') return { ok: false, message: 'این تلاش ارسال شده است.', closed: true, redirectTo: url }
    await saveAnswers({ payload: await getPayloadClient() }, ctx.attempt, ctx.quiz, parsed.data.answers)
    return { ok: true, message: 'ذخیره شد' }
  } catch (err) {
    if (err instanceof QuizError) return { ok: false, message: err.message, closed: true }
    console.error('[saveQuizAnswers]', err)
    return { ok: false, message: 'ذخیره نشد' }
  }
}

/** Submit (Q3, Q5). Idempotent: a second submit returns the same result page. */
export async function submitQuiz(input: z.input<typeof AttemptInput>): Promise<QuizSaveState> {
  const parsed = AttemptInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'پاسخ‌ها نامعتبرند.' }
  try {
    const ctx = await studentAttempt(parsed.data.attemptId)
    if (!ctx) return { ok: false, message: 'این آزمون در دسترس نیست.' }
    const done = await submitAttempt({ payload: await getPayloadClient() }, ctx.attempt, ctx.quiz, parsed.data.answers)
    return { ok: true, message: 'ارسال شد.', closed: true, redirectTo: resultUrl(ctx.course.slug, ctx.quiz.id, done.attemptNo) }
  } catch (err) {
    console.error('[submitQuiz]', err)
    return { ok: false, message: 'ارسال انجام نشد. پاسخ‌ها روی همین دستگاه نگه داشته شده‌اند؛ دوباره تلاش کنید.' }
  }
}

// ---------------------------------------------------------------- Assignments (phase-2 §C2)

const SubmissionInput = z.object({
  assignmentId: z.coerce.number().int().positive(),
  course: z.string().trim().min(1).max(200),
  text: z.string().max(20_000).optional().default(''),
})

export async function submitAssignment(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = SubmissionInput.safeParse({ assignmentId: form.get('assignmentId'), course: form.get('course'), text: form.get('text') ?? '' })
  if (!parsed.success) return { ok: false, message: 'اطلاعات فرم کامل نیست.' }
  const files = form.getAll('files').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f && f.size > 0)
  const remove = form
    .getAll('removeFile')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0)
  try {
    const ctx = await studentCourse(parsed.data.course)
    if (!ctx) return { ok: false, message: 'این تکلیف در دسترس نیست.' }
    const result = await saveSubmission({ payload: await getPayloadClient() }, { ctx, assignmentId: parsed.data.assignmentId, text: parsed.data.text, files, removeFileIds: remove })
    if (!result.ok) return { ok: false, message: result.message }
    return { ok: true, message: result.message, redirectTo: `/learn/${ctx.course.slug}/assignment/${parsed.data.assignmentId}?saved=1` }
  } catch (err) {
    console.error('[submitAssignment]', err)
    return { ok: false, message: 'ارسال انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید؛ تحویل قبلی شما دست نخورده است.' }
  }
}
