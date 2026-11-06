import 'server-only'
import { buildInstalmentPlan, tomanToRial } from '@edvora/core'
import { randomBytes } from 'node:crypto'
import type { PayloadRequest } from 'payload'
import type { Order } from '../../payload-types'

/**
 * Fictional demo template for sandboxes (E-029 §4). Built from code, not copied from any tenant, so no IBA content
 * can leak in. Everything is labelled «نمونه»; prices are sample figures and say so; no real names or phone numbers
 * (lead phones are 10 digits, so they can never be a real Iranian mobile); no accreditation claims of any kind.
 */

const DAY = 24 * 60 * 60 * 1000
export const SAMPLE_NOTE = 'محتوای نمونه — این آکادمی آزمایشی است و داده‌هایش واقعی نیستند.'

export type TemplateContext = {
  req: PayloadRequest
  tenantId: number
  slug: string
  certificatePrefix: string
  adminUserId: number
  studentUserId: number
  now: Date
}

export type TemplateResult = { certificateCode: string; courseSlug: string }

const randomPassword = () => randomBytes(24).toString('base64url')

export async function buildTemplate(ctx: TemplateContext): Promise<TemplateResult> {
  const { req, tenantId: t, now } = ctx
  const create = <T>(collection: Parameters<PayloadRequest['payload']['create']>[0]['collection'], data: Record<string, unknown>) =>
    req.payload.create({ collection, data: { tenant: t, ...data } as never, overrideAccess: true, req, depth: 0 }) as unknown as Promise<T & { id: number }>
  const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString()

  // ---------------------------------------------------------------- courses + cohorts
  const main = await create<{ id: number }>('courses', {
    slug: 'nemoone-modiriat',
    title: 'دورهٔ نمونهٔ مدیریت کسب‌وکار',
    subtitle: 'دورهٔ نمونه برای امتحان ثبت‌نام، پرداخت قسطی، آزمون، تکلیف و گواهی — مبلغ‌ها نمونه‌اند',
    kind: 'program',
    programCode: 'MGT',
    status: 'published',
    featured: true,
    requiresDefense: false,
    sortOrder: 1,
    price: tomanToRial(9_000_000), // sample figure, labelled as such in the subtitle and FAQ
    maxInstalments: 3,
    durationLabel: '۳ ماه',
    summary: SAMPLE_NOTE,
    outcomes: [{ text: 'یک پروژهٔ نمونه' }, { text: 'گواهی نمونه با کد قابل استعلام' }],
    syllabus: [
      { title: 'ماژول ۱ — تحلیل بازار', hours: 6 },
      { title: 'ماژول ۲ — پروژه', hours: 8 },
    ],
    faq: [
      { question: 'آیا مبلغ‌ها واقعی‌اند؟', answer: 'خیر. مبلغ‌ها نمونه‌اند و پرداخت در این آکادمی آزمایشی ساختگی است.' },
      { question: 'آیا این گواهی معتبر است؟', answer: 'خیر. گواهی‌های این آکادمی آزمایشی نمونه‌اند و ارزش رسمی ندارند.' },
    ],
  })
  const workshop = await create<{ id: number }>('courses', {
    slug: 'nemoone-kargah-forush',
    title: 'کارگاه نمونهٔ فروش تلفنی',
    subtitle: 'کارگاه کوتاه نمونه — مبلغ نمونه',
    kind: 'short',
    status: 'published',
    sortOrder: 2,
    price: tomanToRial(2_500_000),
    maxInstalments: 1,
    durationLabel: '۲ جلسه',
    summary: SAMPLE_NOTE,
  })
  const video = await create<{ id: number }>('courses', {
    slug: 'nemoone-video-excel',
    title: 'دورهٔ ویدیویی نمونهٔ اکسل',
    subtitle: 'دورهٔ ویدیویی نمونه — مبلغ نمونه',
    kind: 'video',
    status: 'published',
    sortOrder: 3,
    price: tomanToRial(1_200_000),
    maxInstalments: 1,
    summary: SAMPLE_NOTE,
  })
  const cohort = await create<{ id: number }>('cohorts', {
    course: main.id, title: 'ورودی نمونه', startDate: iso(10 * DAY), schedule: 'دوشنبه‌ها ۱۸ تا ۲۰ (نمونه)', seats: 25, seatsTaken: 0, mode: 'online', status: 'open',
  })
  const workshopCohort = await create<{ id: number }>('cohorts', {
    course: workshop.id, title: 'نوبت نمونه', startDate: iso(5 * DAY), schedule: 'پنجشنبه ۱۰ تا ۱۳ (نمونه)', seats: 12, seatsTaken: 0, mode: 'online', status: 'open',
  })
  const videoCohort = await create<{ id: number }>('cohorts', {
    course: video.id, title: 'دسترسی آزاد', startDate: iso(0), schedule: 'دسترسی آنلاین پس از پرداخت', mode: 'online', status: 'open',
  })

  // ---------------------------------------------------------------- lessons (with drip, like the demo tenant)
  const lessonSpecs: { title: string; module: string; drip: { mode: string; days?: number } }[] = [
    { title: 'معرفی دوره', module: 'شروع', drip: { mode: 'none' } },
    { title: 'تحلیل بازار', module: 'ماژول ۱', drip: { mode: 'none' } },
    { title: 'طراحی پروژه', module: 'ماژول ۱', drip: { mode: 'afterPrevious' } },
    { title: 'جمع‌بندی و پروژهٔ نهایی', module: 'ماژول ۲', drip: { mode: 'afterEnrollment', days: 14 } },
    { title: 'منابع تکمیلی', module: 'ماژول ۲', drip: { mode: 'afterEnrollment', days: 0 } },
  ]
  const lessonIds: number[] = []
  for (const [i, spec] of lessonSpecs.entries()) {
    const l = await create<{ id: number }>('lessons', {
      course: main.id, title: spec.title, order: i + 1, module: spec.module, durationMinutes: 20 + i * 5, isFreePreview: i === 0,
      notes: `${SAMPLE_NOTE} در این جلسه ویدیوی واقعی وجود ندارد.`, drip: { days: null, releaseAt: null, ...spec.drip },
    })
    lessonIds.push(l.id)
  }

  // ---------------------------------------------------------------- quiz + assignment (generic textbook items)
  const questions: Record<string, unknown>[] = [
    { type: 'single', text: 'کدام مورد جزو چهار بخش تحلیل SWOT نیست؟', options: [{ text: 'نقاط قوت' }, { text: 'فرصت‌ها' }, { text: 'تهدیدها' }, { text: 'قیمت‌گذاری', isCorrect: true }] },
    { type: 'single', text: '«بازار هدف» یعنی…', options: [{ text: 'گروهی از مشتریان که کسب‌وکار برای آن‌ها محصول یا خدمت ارائه می‌کند', isCorrect: true }, { text: 'همهٔ مردم یک کشور' }, { text: 'فهرست رقبای اصلی' }] },
    { type: 'multiple', text: 'کدام موارد در SWOT عوامل بیرونی‌اند؟', options: [{ text: 'فرصت‌ها', isCorrect: true }, { text: 'تهدیدها', isCorrect: true }, { text: 'نقاط قوت' }, { text: 'نقاط ضعف' }] },
    { type: 'trueFalse', text: 'تحلیل رقبا بخشی از تحلیل بازار است.', correctAnswer: 'true' },
    { type: 'short', text: 'تحلیل SWOT چند بخش دارد؟ (عدد را بنویسید)', acceptedAnswers: [{ answer: '4' }, { answer: 'چهار' }] },
  ]
  const questionIds: number[] = []
  for (const q of questions) questionIds.push((await create<{ id: number }>('questions', { course: main.id, points: 1, archived: false, ...q })).id)
  await create('quizzes', {
    course: main.id, lesson: lessonIds[1], title: 'آزمون نمونهٔ جلسهٔ تحلیل بازار',
    description: 'آزمون نمونه: برای باز شدن جلسهٔ بعد در آن قبول شوید.',
    status: 'published', required: true, passMark: 60, attemptsLimit: 3, timeLimitMin: 10, countedAttempt: 'best', review: 'full', fullReviewWhen: 'afterPass',
    partialCredit: false, allowRetakeAfterPass: false, shuffle: false, questions: questionIds.map((question) => ({ question })),
  })
  await create('assignments', {
    course: main.id, title: 'تکلیف نمونه: تحلیل SWOT یک کسب‌وکار',
    description: 'یک کسب‌وکار فرضی انتخاب کنید و جدول SWOT آن را با دست‌کم دو مورد در هر بخش بنویسید. (تکلیف نمونه)',
    dueAt: iso(7 * DAY), maxScore: 20, passScore: 12, required: true, allowLate: true, status: 'published',
  })
  await create('coupons', { code: 'NEMOONE10', kind: 'percent', value: 10, active: true, note: 'کد تخفیف نمونه' })

  // ---------------------------------------------------------------- leads across the pipeline (no real people)
  const leadSpecs: { name: string; status: string; course: number; note?: string }[] = [
    { name: 'مریم (نمونه)', status: 'new', course: main.id },
    { name: 'رضا (نمونه)', status: 'new', course: main.id },
    { name: 'سارا (نمونه)', status: 'new', course: workshop.id },
    { name: 'علی (نمونه)', status: 'contacted', course: main.id, note: 'تماس نمونه: دربارهٔ اقساط پرسید.' },
    { name: 'نگار (نمونه)', status: 'contacted', course: video.id, note: 'تماس نمونه: لینک دوره را خواست.' },
    { name: 'حمید (نمونه)', status: 'follow_up', course: main.id, note: 'پیگیری نمونه: هفتهٔ بعد تماس گرفته شود.' },
    { name: 'لیلا (نمونه)', status: 'follow_up', course: workshop.id, note: 'پیگیری نمونه: منتظر تأیید مدیرش است.' },
    { name: 'کاوه (نمونه)', status: 'follow_up', course: main.id },
    { name: 'نسترن (نمونه)', status: 'enrolled', course: main.id, note: 'ثبت‌نام نمونه انجام شد.' },
    { name: 'بهرام (نمونه)', status: 'enrolled', course: video.id },
    { name: 'شیرین (نمونه)', status: 'lost', course: main.id, note: 'نمونه: زمان کلاس با کارش جور نبود.' },
    { name: 'امید (نمونه)', status: 'lost', course: workshop.id },
  ]
  for (const [i, l] of leadSpecs.entries()) {
    await create('leads', {
      name: l.name,
      // 10 digits: looks like a mobile in the desk, cannot dial anyone real.
      phone: `0900000${String(i + 1).padStart(3, '0')}`,
      course: l.course,
      status: l.status,
      advisor: ctx.adminUserId,
      message: 'سرنخ نمونه',
      source: { page: '/courses/nemoone-modiriat', utmSource: 'nemoone', utmCampaign: null },
      activities: l.note ? [{ kind: 'call', text: l.note, at: iso(-(i + 1) * 3600_000) }] : [],
    })
  }

  // ---------------------------------------------------------------- buyers, orders (paid / instalment / failed), enrollments
  const buyerIds: number[] = []
  for (let i = 1; i <= 3; i++) {
    const u = await req.payload.create({
      collection: 'users',
      overrideAccess: true,
      req,
      depth: 0,
      data: {
        email: `buyer${i}-${ctx.slug}@sandbox.invalid`,
        password: randomPassword(),
        name: `خریدار نمونه ${['۱', '۲', '۳'][i - 1]}`,
        roles: ['student'],
        tenants: [{ tenant: t }],
        sandboxTenant: t,
        source: 'manual',
      },
    })
    buyerIds.push(u.id)
  }

  type OrderSpec = { user: number; course: number; cohort: number; toman: number; status: Order['status']; instalments: number; paidCount: number; failed?: boolean }
  const orderSpecs: OrderSpec[] = [
    { user: ctx.studentUserId, course: main.id, cohort: cohort.id, toman: 9_000_000, status: 'paid', instalments: 1, paidCount: 1 },
    { user: buyerIds[0]!, course: main.id, cohort: cohort.id, toman: 9_000_000, status: 'partially_paid', instalments: 3, paidCount: 1 },
    { user: buyerIds[1]!, course: main.id, cohort: cohort.id, toman: 9_000_000, status: 'partially_paid', instalments: 3, paidCount: 2 },
    { user: buyerIds[2]!, course: workshop.id, cohort: workshopCohort.id, toman: 2_500_000, status: 'paid', instalments: 1, paidCount: 1 },
    { user: buyerIds[0]!, course: video.id, cohort: videoCohort.id, toman: 1_200_000, status: 'paid', instalments: 1, paidCount: 1 },
    { user: buyerIds[1]!, course: workshop.id, cohort: workshopCohort.id, toman: 2_500_000, status: 'failed', instalments: 1, paidCount: 0, failed: true },
    { user: buyerIds[2]!, course: video.id, cohort: videoCohort.id, toman: 1_200_000, status: 'failed', instalments: 1, paidCount: 0, failed: true },
    { user: buyerIds[2]!, course: main.id, cohort: cohort.id, toman: 9_000_000, status: 'pending', instalments: 3, paidCount: 0 },
  ]
  const seats = new Map<number, number>()
  for (const [i, o] of orderSpecs.entries()) {
    const total = tomanToRial(o.toman)
    const createdAt = new Date(now.getTime() - (orderSpecs.length - i) * DAY)
    const plan = buildInstalmentPlan({ total, count: o.instalments, downPaymentPercent: o.instalments > 1 ? 40 : 0, firstDueDate: createdAt })
    const instalments = plan.map((p) => ({ index: p.index, amount: p.amount, dueDate: p.dueDate.toISOString(), status: p.index < o.paidCount ? ('paid' as const) : ('pending' as const), paidAt: p.index < o.paidCount ? p.dueDate.toISOString() : null }))
    const payments = [
      ...plan.slice(0, o.paidCount).map((p) => ({ instalmentIndex: p.index, provider: 'mock', authority: `NEMOONE-${ctx.slug}-${i}-${p.index}`, amount: p.amount, status: 'verified' as const, refId: `NM${i}${p.index}` })),
      ...(o.failed ? [{ instalmentIndex: 0, provider: 'mock', authority: `NEMOONE-${ctx.slug}-${i}-fail`, amount: plan[0]!.amount, status: 'failed' as const, error: 'پرداخت نمونهٔ ناموفق' }] : []),
    ]
    const order = await create<{ id: number }>('orders', { user: o.user, course: o.course, cohort: o.cohort, subtotal: total, discount: 0, total, status: o.status, instalments, payments })
    if (o.status === 'paid' || o.status === 'partially_paid') {
      await create('enrollments', { user: o.user, course: o.course, cohort: o.cohort, order: order.id, status: 'active' })
      seats.set(o.cohort, (seats.get(o.cohort) ?? 0) + 1)
    }
  }
  for (const [cohortId, taken] of seats) {
    await req.payload.update({ collection: 'cohorts', id: cohortId, data: { seatsTaken: taken }, overrideAccess: true, req, depth: 0 })
  }

  // ---------------------------------------------------------------- one certificate, verifiable at /verify
  const certificateCode = `${ctx.certificatePrefix}-MGT-001`
  await create('certificates', {
    code: certificateCode, holderName: 'دانش‌آموختهٔ نمونه', course: main.id, cohort: cohort.id, finalProject: 'پروژهٔ نمونه', issuedAt: iso(-30 * DAY), status: 'valid',
  })

  return { certificateCode, courseSlug: 'nemoone-modiriat' }
}
