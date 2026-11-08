/**
 * Seeds two academies:
 *  - "iba"  — Iran Brand Academy, customer #1, with REAL content from iranbrandacademy.com (Notion page 02).
 *             Unknown facts (MBA/DBA fees, next cohort dates) are left empty on purpose, not invented.
 *  - "demo" — a fake academy that holds all test data (coupons, sample certificate, priced cohort),
 *             and proves tenant isolation.
 *
 * Idempotent: re-running updates existing records by their natural key.
 *   pnpm seed
 */
import { ROLE_TEMPLATES, plainTextToLexical as rt, tomanToRial } from '@edvora/core'
import { dayStartsAt, tehranDayNumber, weekdayOf, xpKey } from '@edvora/core/gamification'
import { randomBytes } from 'node:crypto'
import { getPayload, type CollectionSlug, type Payload, type Where } from 'payload'
import { FOLLOW_UP_CONTEXT } from '../collections/Leads'
import { flushGamification, onLessonMarked, onLessonWatched, refreshEnrollmentGamification } from '../lib/gamification'
import { loadCourseState } from '../lib/learning'
import { startAttempt, submitAttempt } from '../lib/quizAttempts'
import config from '../payload.config'
import type { Answers } from '@edvora/core'
import { sealConnectionSecret } from '../lib/wpimport/secrets'
import { tronHexToBase58 } from '@edvora/integrations'
import { createHash } from 'node:crypto'

async function upsert<T extends Record<string, unknown>>(payload: Payload, collection: CollectionSlug, where: Where, data: T) {
  const found = await payload.find({ collection, where, limit: 1, depth: 0, overrideAccess: true })
  const existing = found.docs[0] as { id: number } | undefined
  if (existing) return (await payload.update({ collection, id: existing.id, data: data as never, overrideAccess: true })) as { id: number }
  return (await payload.create({ collection, data: data as never, overrideAccess: true })) as { id: number }
}

const DAY = 24 * 60 * 60 * 1000

async function seedIba(payload: Payload) {
  const tenant = await upsert(payload, 'tenants', { slug: { equals: 'iba' } }, {
    name: 'آکادمی برند ایران',
    slug: 'iba',
    domains: [{ domain: 'iranbrandacademy.com' }, { domain: 'iba.localhost' }],
    plan: 'pro',
    features: ['site', 'lms', 'payments', 'crm', 'certificates', 'live', 'consulting', 'b2b'],
    tagline: 'آموزش برندسازی با بیش از ۲۶ سال تجربه و ۲۵۰ پروژه مشاوره',
    primaryColor: '#1A56DB',
    accentColor: '#F59E0B',
    defaultTheme: 'light',
    certificatePrefix: 'BA',
    notice: {
      enabled: true,
      text: 'تیم آموزش تا عادی شدن شرایط فقط به‌صورت آنلاین، ایمیل و تلفنی پاسخگوست.',
    },
    manifesto: rt(
      'آکادمی برند دانشگاه نیست؛ دانشگاه‌ها در مدیریت بیش از حد نظری‌اند.\nآکادمی برند مدرسه کسب‌وکار هم نیست؛ آن‌ها به نمونه‌های خارجی تکیه دارند.\nروش ما: مباحثه به سبک حوزه، نگاه علمی دانشگاه و رویکرد کاربردی مدرسه کسب‌وکار.\n— شهریار شفیعی',
    ),
    stats: [
      { value: '+26', label: 'سال تجربه' },
      { value: '+250', label: 'پروژه مشاوره برند' },
      { value: '+16', label: 'دوره برگزارشده Brand MBA' },
      { value: '1381', label: 'آغاز فعالیت' },
    ],
    clientLogos: [
      'ایرانسل', 'نفت پارس', 'بیمه دی', 'سفیر', 'دیاکو', 'سان استار', 'گلستان', 'مهرنوش', 'عصر ایران', 'دنیای فرش',
      'برنز استیل', 'دکوپانل', 'حس هفتم', 'ترشه', 'پالاز موکت', 'باتری درنا', 'درسا', 'آمیتیس',
    ].map((name) => ({ name })),
    services: [
      { title: 'مشاوره برندسازی', text: 'بیش از ۲۶ سال تجربه و ۲۵۰ پروژه مشاوره برند.' },
      { title: 'ارزش‌گذاری برند', text: 'سنجش و قیمت‌گذاری برند شما با روش‌شناسی آکادمی برند.' },
      { title: 'جلسات مشاوره ساعتی', text: 'یک جلسه متمرکز برای یک تصمیم مشخص برند.' },
      { title: 'آموزش سازمانی', text: 'دوره‌های اختصاصی برای تیم‌های شرکت شما.' },
      { title: 'برندسازی کامل سازمان', text: 'از استراتژی تا هویت، برای کل سازمان.' },
    ],
    contact: { phone: '021-22277111', email: 'info@IranBrandAcademy.com' },
  })
  const t = tenant.id

  const course = (slug: string, data: Record<string, unknown>) =>
    upsert(payload, 'courses', { and: [{ tenant: { equals: t } }, { slug: { equals: slug } }] }, { tenant: t, slug, status: 'published', ...data })

  const certificateFaq = {
    question: 'آیا این دوره مدرک دانشگاهی است؟',
    answer: rt(
      'خیر. گواهی آکادمی برند ایران مدرک دانشگاهی نیست. این گواهی نشان می‌دهد دوره، پروژه نهایی و کارگاه فنی را با موفقیت گذرانده‌اید و با کد یکتای آن در صفحه استعلام قابل بررسی است.',
    ),
  }

  await course('brand-mba', {
    title: 'Brand MBA',
    subtitle: 'دوره متوسط تا پیشرفته برندسازی، همراه با پروژه‌های واقعی برند',
    kind: 'program',
    programCode: 'MBA',
    featured: true,
    requiresDefense: true,
    sortOrder: 1,
    price: 0, // TODO(client): real fee and instalment terms
    maxInstalments: 1,
    summary: 'دوره بلندمدت Brand MBA آکادمی برند ایران. شانزده دوره از آن برگزار شده و ورودی هفدهم در راه است.',
    faculty: [
      { name: 'دکتر شهریار شفیعی', role: 'بنیان‌گذار و رئیس هیئت علمی' },
      { name: 'امیرهوشنگ کمالی‌فرد', role: 'نام‌گذاری و جوهره برند' },
    ],
    faq: [certificateFaq],
  })

  await course('brand-dba', {
    title: 'Brand DBA',
    subtitle: 'دوره عالی برندسازی — یک‌ساله',
    kind: 'program',
    programCode: 'DBA',
    requiresDefense: true,
    sortOrder: 2,
    price: 0, // TODO(client): fee. Do NOT add the "Ministry of Science" claim until verified (Notion page 04).
    maxInstalments: 1,
    summary: 'پیش‌ثبت‌نام دوره عالی برندسازی آغاز شده است.',
    faculty: [{ name: 'دکتر شهریار شفیعی', role: 'بنیان‌گذار و رئیس هیئت علمی' }],
    faq: [certificateFaq],
  })

  const strategic = await course('strategic-thinking', {
    title: 'تفکر استراتژیک',
    subtitle: 'کارگاه آنلاین دوماهه با دکتر شهریار شفیعی — هر دو سال یک بار',
    kind: 'short',
    sortOrder: 3,
    price: 0,
    durationLabel: '۲ ماه',
    faculty: [{ name: 'دکتر شهریار شفیعی', role: 'مدرس' }],
  })

  const premium = await course('premium-branding', {
    title: 'دوره کوتاه برندسازی پرمیوم',
    subtitle: 'دوره فشرده چهارماهه با کاربرگ و پروژه',
    kind: 'short',
    sortOrder: 4,
    price: 0,
    durationLabel: '۴ ماه',
    audience: [
      { title: 'مدیران و کارآفرینان', text: 'کسانی که درباره برند کسب‌وکار خود تصمیم می‌گیرند.' },
      { title: 'مدیران بازاریابی', text: 'برای ساختن برند، نه فقط کمپین.' },
      { title: 'مشاوران', text: 'برای افزودن روش‌شناسی برند به خدماتشان.' },
    ],
  })

  await course('decision-at-the-edge-of-crisis', {
    title: 'تصمیم در لبه بحران',
    subtitle: 'راهنمای عملیاتی نجات کسب‌وکار',
    kind: 'video',
    sortOrder: 5,
    price: 0,
  })
  await course('mind-at-the-edge-of-crisis', {
    title: 'روان در لبه بحران',
    subtitle: 'تاب‌آوری روانی برای مدیران در بحران',
    kind: 'video',
    sortOrder: 6,
    price: 0,
    durationLabel: '۶ ساعت',
  })
  await course('personal-branding', { title: 'برندسازی شخصی', kind: 'short', sortOrder: 7, price: 0 })

  // Graduation lesson bundles — real prices from the current site (temporary, crisis-only offer).
  const bundleNote = 'برای دانشجویان MBA/DBA که دوره را تمام کرده‌اند اما به‌دلیل شرایط نتوانستند کارگاه فنی را ارائه دهند.'
  const bundles = [
    { slug: 'dba-graduation-bundle', title: 'بسته دانش‌آموختگی Brand DBA', toman: 11_700_000, lessons: ['استراتژی و معماری برند', 'چگونه مشتریان خود را پیدا کنیم', 'تکنیک‌های فرانچایز'] },
    { slug: 'mba-graduation-bundle-1', title: 'بسته دانش‌آموختگی Brand MBA — گزینه ۱', toman: 8_470_000, lessons: ['برندسازی شخصی', 'استراتژی و معماری برند'] },
    { slug: 'mba-graduation-bundle-2', title: 'بسته دانش‌آموختگی Brand MBA — گزینه ۲', toman: 6_900_000, lessons: ['تکنیک‌های فروش B2B', 'تکنیک‌های متقاعدسازی در فروش'] },
  ]
  for (const [i, b] of bundles.entries()) {
    const c = await course(b.slug, {
      title: b.title,
      subtitle: b.lessons.join(' · '),
      kind: 'bundle',
      sortOrder: 10 + i,
      price: tomanToRial(b.toman),
      maxInstalments: 1, // TODO(client): confirm whether bundles can be paid in instalments
      summary: bundleNote,
    })
    await upsert(payload, 'cohorts', { and: [{ tenant: { equals: t } }, { course: { equals: c.id } }] }, {
      tenant: t,
      course: c.id,
      title: 'ثبت‌نام آزاد',
      startDate: new Date().toISOString(),
      schedule: 'دسترسی آنلاین پس از پرداخت',
      mode: 'online',
      status: 'open',
    })
    for (const [order, title] of b.lessons.entries()) {
      await upsert(payload, 'lessons', { and: [{ course: { equals: c.id } }, { order: { equals: order + 1 } }] }, {
        tenant: t,
        course: c.id,
        title,
        order: order + 1,
      })
    }
  }

  // Real schedules from the site (both already started by Nov 2026).
  await upsert(payload, 'cohorts', { and: [{ tenant: { equals: t } }, { course: { equals: strategic.id } }] }, {
    tenant: t, course: strategic.id, title: 'دوره ۱۴۰۵', startDate: '2026-09-20T13:30:00.000Z', schedule: 'یکشنبه‌ها ۱۷ تا ۱۹', mode: 'online', status: 'running',
  })
  await upsert(payload, 'cohorts', { and: [{ tenant: { equals: t } }, { course: { equals: premium.id } }] }, {
    tenant: t, course: premium.id, title: 'دوره مرداد ۱۴۰۵', startDate: '2026-07-25T13:30:00.000Z', schedule: 'شنبه‌ها ۱۷ تا ۱۹', mode: 'online', status: 'running',
  })

  const testimonials = [
    { name: 'محمدناصر معتمدی', role: 'معاونت بازاریابی و فروش شرکت بی‌نی‌سی (قطعات خودرو)' },
    { name: 'میثم خداوردی', role: 'مدیرعامل فرش عمارت' },
    { name: 'نازنین بدری', role: 'طراح شرکت فرا راه پویان (سازه‌های نمایشگاهی)' },
    { name: 'سید ابراهیم خدام‌الحسینی', role: 'سرپرست کارخانه محتوای دیجی‌کالا' },
    { name: 'فرهاد فروغی', role: 'استاد دانشگاه و مشاور حوزه بازاریابی' },
  ]
  for (const tm of testimonials) {
    // Shown publicly on the current site already; re-confirm consent with the client before launch.
    await upsert(payload, 'testimonials', { and: [{ tenant: { equals: t } }, { name: { equals: tm.name } }] }, { tenant: t, ...tm, approvedForUse: true })
  }

  const posts = [
    { slug: 'foroughi-predicting-the-future', title: 'محمدعلی فروغی و پیش‌بینی آینده', author: 'نیما قبایی' },
    { slug: 'what-is-brand-positioning', title: 'جایگاه‌یابی برند چیست؟' },
    { slug: 'what-is-mini-mba', title: 'مینی MBA چیست؟' },
    { slug: 'do-we-need-mini-mba', title: 'مینی MBA چیست و آیا به آن نیاز داریم؟' },
    { slug: 'everything-about-mini-mba', title: 'همه‌چیز درباره مینی MBA', author: 'نیما قبایی' },
    { slug: 'ad-strategy-for-service-brands', title: 'کدام استراتژی تبلیغاتی برای برندهای خدماتی مناسب است؟', author: 'نیما قبایی' },
    { slug: 'second-brand-doctorate-cohort', title: 'دومین دوره دکترای حرفه‌ای برند برگزار شد' },
    { slug: 'brand-mba-cohort-16', title: 'آغاز شانزدهمین دوره Brand MBA' },
  ]
  for (const [i, p] of posts.entries()) {
    await upsert(payload, 'posts', { and: [{ tenant: { equals: t } }, { slug: { equals: p.slug } }] }, {
      tenant: t, ...p, publishedAt: new Date(Date.now() - i * 7 * DAY).toISOString(),
    })
  }
  return t
}

async function seedDemo(payload: Payload) {
  const tenant = await upsert(payload, 'tenants', { slug: { equals: 'demo' } }, {
    name: 'آکادمی نمونه ادورا',
    slug: 'demo',
    domains: [{ domain: 'demo.localhost' }],
    plan: 'growth',
    features: ['site', 'lms', 'payments', 'crm', 'certificates'],
    tagline: 'آکادمی آزمایشی برای توسعه و تست — داده‌های این آکادمی واقعی نیستند.',
    primaryColor: '#0F766E',
    accentColor: '#F97316',
    defaultTheme: 'light',
    certificatePrefix: 'ED',
    notice: { enabled: true, text: 'این یک آکادمی نمونه است. پرداخت‌ها آزمایشی‌اند.' },
    stats: [{ value: '3', label: 'دوره نمونه' }],
    // E-028: on, with the PRD defaults (leaderboard stays off). IBA keeps the defaults untouched.
    gamification: { enabled: true },
  })
  const t = tenant.id
  const course = await upsert(payload, 'courses', { and: [{ tenant: { equals: t } }, { slug: { equals: 'demo-program' } }] }, {
    tenant: t,
    slug: 'demo-program',
    title: 'دوره نمونه مدیریت',
    subtitle: 'برای تست مسیر ثبت‌نام، پرداخت قسطی و گواهی',
    kind: 'program',
    programCode: 'MGT',
    status: 'published',
    featured: true,
    requiresDefense: true,
    price: tomanToRial(12_000_000),
    maxInstalments: 4,
    durationLabel: '۳ ماه',
    outcomes: [{ text: 'یک پروژه واقعی' }, { text: 'گواهی با کد قابل استعلام' }],
    syllabus: [
      { title: 'ماژول ۱ — مبانی', hours: 6 },
      { title: 'ماژول ۲ — پروژه', hours: 8 },
    ],
    faq: [{ question: 'آیا پرداخت واقعی است؟', answer: rt('خیر، درگاه این آکادمی آزمایشی است.') }],
  })
  const cohort = await upsert(payload, 'cohorts', { and: [{ tenant: { equals: t } }, { course: { equals: course.id } }] }, {
    tenant: t, course: course.id, title: 'ورودی اول', startDate: new Date(Date.now() + 14 * DAY).toISOString(), schedule: 'دوشنبه‌ها ۱۸ تا ۲۰', seats: 30, mode: 'online', status: 'open',
  })
  // Lessons 3–5 exercise drip (E-026): 3 opens after lesson 2 (and its required quiz), 4 opens 14 days after
  // enrollment (locked for a fresh student), 5 is dripped with 0 days (already open).
  const lessonSpecs: { title: string; module: string; drip: { mode: string; days?: number } }[] = [
    { title: 'معرفی دوره', module: 'شروع', drip: { mode: 'none' } },
    { title: 'تحلیل بازار', module: 'ماژول ۱', drip: { mode: 'none' } },
    { title: 'طراحی پروژه', module: 'ماژول ۱', drip: { mode: 'afterPrevious' } },
    { title: 'جمع‌بندی و پروژهٔ نهایی', module: 'ماژول ۲', drip: { mode: 'afterEnrollment', days: 14 } },
    { title: 'منابع تکمیلی', module: 'ماژول ۲', drip: { mode: 'afterEnrollment', days: 0 } },
  ]
  const lessonIds: number[] = []
  for (const [i, spec] of lessonSpecs.entries()) {
    const lesson = await upsert(payload, 'lessons', { and: [{ course: { equals: course.id } }, { order: { equals: i + 1 } }] }, {
      tenant: t, course: course.id, title: spec.title, order: i + 1, module: spec.module, durationMinutes: 20 + i * 5, isFreePreview: i === 0,
      notes: rt('یادداشت نمونه جلسه.'), drip: { days: null, releaseAt: null, ...spec.drip },
    })
    lessonIds.push(lesson.id)
  }
  await seedDemoQuizAndAssignment(payload, t, course.id, lessonIds[1]!)
  await seedDemoPaymentMethods(payload, t)
  await upsert(payload, 'coupons', { and: [{ tenant: { equals: t } }, { code: { equals: 'TEST20' } }] }, {
    tenant: t, code: 'TEST20', kind: 'percent', value: 20, active: true, note: 'Test coupon',
  })
  await upsert(payload, 'certificates', { and: [{ tenant: { equals: t } }, { code: { equals: 'ED-MGT-001' } }] }, {
    tenant: t, code: 'ED-MGT-001', holderName: 'دانشجوی نمونه', course: course.id, cohort: cohort.id, finalProject: 'پروژه نمونه', issuedAt: new Date().toISOString(), status: 'valid',
  })
  return t
}

/**
 * E-026 demo data (demo tenant only): a question bank with every question type, a required quiz on lesson 2 and a
 * required course assignment. Questions are generic textbook items, not claims about any academy.
 */
async function seedDemoQuizAndAssignment(payload: Payload, t: number, courseId: number, lessonId: number) {
  const inCourse = (extra: Where[]): Where => ({ and: [{ tenant: { equals: t } }, { course: { equals: courseId } }, ...extra] })
  const questions: Record<string, unknown>[] = [
    {
      type: 'single',
      text: 'کدام مورد جزو چهار بخش تحلیل SWOT نیست؟',
      options: [{ text: 'نقاط قوت' }, { text: 'فرصت‌ها' }, { text: 'تهدیدها' }, { text: 'قیمت‌گذاری', isCorrect: true }],
      explanation: rt('SWOT از قوت‌ها، ضعف‌ها، فرصت‌ها و تهدیدها تشکیل می‌شود.'),
    },
    {
      type: 'single',
      text: '«بازار هدف» یعنی…',
      options: [{ text: 'گروهی از مشتریان که کسب‌وکار برای آن‌ها محصول یا خدمت ارائه می‌کند', isCorrect: true }, { text: 'همهٔ مردم یک کشور' }, { text: 'فهرست رقبای اصلی' }],
    },
    {
      type: 'multiple',
      text: 'کدام موارد در SWOT عوامل بیرونی‌اند؟',
      options: [{ text: 'فرصت‌ها', isCorrect: true }, { text: 'تهدیدها', isCorrect: true }, { text: 'نقاط قوت' }, { text: 'نقاط ضعف' }],
      explanation: rt('فرصت‌ها و تهدیدها از محیط بیرون می‌آیند؛ قوت‌ها و ضعف‌ها درونی‌اند.'),
    },
    {
      type: 'multiple',
      text: 'کدام‌ها روش جمع‌آوری داده از مشتری‌اند؟',
      options: [{ text: 'مصاحبه', isCorrect: true }, { text: 'پرسش‌نامه', isCorrect: true }, { text: 'حدس زدن بدون داده' }],
    },
    { type: 'trueFalse', text: 'تحلیل رقبا بخشی از تحلیل بازار است.', correctAnswer: 'true' },
    { type: 'trueFalse', text: 'تحلیل SWOT فقط برای شرکت‌های بزرگ کاربرد دارد.', correctAnswer: 'false' },
    { type: 'short', text: 'تحلیل SWOT چند بخش دارد؟ (عدد را بنویسید)', acceptedAnswers: [{ answer: '4' }, { answer: 'چهار' }] },
    { type: 'short', text: 'حرف S در SWOT نشانهٔ کدام کلمهٔ انگلیسی است؟', acceptedAnswers: [{ answer: 'Strengths' }, { answer: 'Strength' }] },
  ]
  const questionIds: number[] = []
  for (const q of questions) {
    const doc = await upsert(payload, 'questions', inCourse([{ text: { equals: q.text as string } }]), { tenant: t, course: courseId, points: 1, archived: false, ...q })
    questionIds.push(doc.id)
  }
  await upsert(payload, 'quizzes', inCourse([{ title: { equals: 'آزمون جلسهٔ تحلیل بازار' } }]), {
    tenant: t,
    course: courseId,
    lesson: lessonId,
    title: 'آزمون جلسهٔ تحلیل بازار',
    description: rt('برای تکمیل جلسهٔ «تحلیل بازار» و باز شدن جلسهٔ بعد، در این آزمون قبول شوید.'),
    status: 'published',
    required: true,
    passMark: 70,
    attemptsLimit: 3,
    timeLimitMin: 15,
    countedAttempt: 'best',
    review: 'full',
    fullReviewWhen: 'afterPass',
    partialCredit: false,
    allowRetakeAfterPass: false,
    shuffle: false,
    questions: questionIds.map((question) => ({ question })),
  })
  await upsert(payload, 'assignments', inCourse([{ title: { equals: 'تکلیف: تحلیل SWOT یک کسب‌وکار' } }]), {
    tenant: t,
    course: courseId,
    title: 'تکلیف: تحلیل SWOT یک کسب‌وکار',
    description: rt('یک کسب‌وکار واقعی یا فرضی انتخاب کنید و جدول SWOT آن را با دست‌کم دو مورد در هر بخش بنویسید. متن را همین‌جا بنویسید یا فایل PDF بفرستید.'),
    dueAt: new Date(Date.now() + 30 * DAY).toISOString(),
    maxScore: 20,
    passScore: 12,
    required: true,
    allowLate: false,
    status: 'published',
  })
}

/**
 * Demo-only people for E-026: an instructor (grades in /admin, no password login — the e2e grades through the local
 * API as this user) and an enrolled student for screenshots. Fake numbers; login is phone OTP with the mock SMS code.
 */
/**
 * E-045 (ADR 017): every method on the demo academy, all against mocks (PAYMENT_PROVIDER=mock, CHAIN_VERIFIER=mock).
 * Card number and wallets are fake test values nobody holds (card BIN 9999 is not an Iranian bank; wallets are
 * hashes with no private key). Tether is OFF by default for real academies; it is on here only as test data.
 */
async function seedDemoPaymentMethods(payload: Payload, t: number) {
  const fake = (label: string) => createHash('sha256').update(`edvora-demo-${label}`).digest('hex').slice(0, 40)
  const rows: Record<string, unknown>[] = [
    { method: 'zarinpal', enabled: true, position: 10, title: 'درگاه زرین‌پال (آزمایشی)', mode: 'sandbox' },
    { method: 'saman', enabled: true, position: 20, title: 'درگاه بانک سامان (آزمایشی)', mode: 'sandbox' },
    { method: 'mellat', enabled: false, position: 25, title: 'درگاه بانک ملت', mode: 'sandbox' },
    { method: 'zibal', enabled: false, position: 30, title: 'زیبال', mode: 'sandbox' },
    {
      method: 'card',
      enabled: true,
      position: 40,
      title: 'کارت‌به‌کارت',
      instructions: 'آزمایشی: این شمارهٔ کارت ساختگی است و پولی واریز نکنید.',
      cards: [{ number: '9999990000000006', holder: 'آکادمی نمونه (آزمایشی)', bank: 'بانک آزمایشی' }],
    },
    {
      method: 'usdt',
      enabled: true,
      position: 50,
      title: 'تتر (USDT) — آزمایشی',
      mode: 'sandbox',
      instructions: 'آزمایشی: آدرس‌ها ساختگی‌اند و کلید خصوصی ندارند. تتر واقعی نفرستید.',
      usdtLegalAck: true,
      // TODO(client): a test rate only. Each academy sets its own rate by hand.
      usdtRateToman: 100_000,
      wallets: [
        { network: 'trc20', address: tronHexToBase58(`41${fake('trc20')}`) },
        { network: 'bep20', address: `0x${fake('bep20')}` },
      ],
    },
    { method: 'manual', enabled: true, position: 90, title: 'ثبت دستی', manualChannels: ['cash', 'pos', 'transfer'] },
  ]
  for (const row of rows) {
    await upsert(payload, 'payment-methods', { and: [{ tenant: { equals: t } }, { method: { equals: row.method as string } }] }, { tenant: t, ...row })
  }
}

async function seedDemoPeople(payload: Payload, t: number) {
  const course = (await payload.find({ collection: 'courses', where: { and: [{ tenant: { equals: t } }, { slug: { equals: 'demo-program' } }] }, limit: 1, overrideAccess: true })).docs[0]
  const role = (await payload.find({ collection: 'roles', where: { and: [{ tenant: { equals: t } }, { key: { equals: 'instructor' } }] }, limit: 1, overrideAccess: true })).docs[0]
  if (!course || !role) return
  const ensureUser = async (email: string, data: Record<string, unknown>) => {
    const found = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })).docs[0]
    if (found) return payload.update({ collection: 'users', id: found.id, overrideAccess: true, data: data as never })
    return payload.create({ collection: 'users', overrideAccess: true, data: { email, password: randomBytes(24).toString('base64url'), ...data } as never })
  }
  const instructor = await ensureUser('instructor@demo.edvora.local', { name: 'مدرس نمونه', tenants: [{ tenant: t }] })
  await upsert(payload, 'memberships', { and: [{ tenant: { equals: t } }, { user: { equals: instructor.id } }] }, {
    tenant: t,
    user: instructor.id,
    roles: [role.id],
    scope: { courses: [course.id], cohorts: [], ownRecordsOnly: false },
    status: 'active',
    note: 'Demo instructor (E-026 test data)',
  })
  const student = await ensureUser('09129990001@phone.demo.edvora.local', { name: 'دانشجوی نمونه', phone: '09129990001', roles: ['student'], tenants: [{ tenant: t }] })
  const cohort = (await payload.find({ collection: 'cohorts', where: { and: [{ tenant: { equals: t } }, { course: { equals: course.id } }] }, limit: 1, overrideAccess: true })).docs[0]
  const existing = (await payload.find({ collection: 'enrollments', where: { and: [{ user: { equals: student.id } }, { course: { equals: course.id } }] }, limit: 1, overrideAccess: true })).docs[0]
  if (!existing) {
    await payload.create({ collection: 'enrollments', overrideAccess: true, data: { tenant: t, user: student.id, course: course.id, cohort: cohort?.id ?? null, status: 'active' } })
  }
}

const HOUR = 60 * 60 * 1000

/** Demo staff with a password from SEED_DEMO_STAFF_PASSWORD (local/test only); random = no password login. */
async function ensureStaff(payload: Payload, t: number, email: string, name: string, roleKey: string) {
  const role = (await payload.find({ collection: 'roles', where: { and: [{ tenant: { equals: t } }, { key: { equals: roleKey } }] }, limit: 1, overrideAccess: true })).docs[0]
  if (!role) throw new Error(`Missing role ${roleKey}`)
  const password = process.env.SEED_DEMO_STAFF_PASSWORD || randomBytes(24).toString('base64url')
  const found = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })).docs[0]
  const user = found
    ? await payload.update({ collection: 'users', id: found.id, overrideAccess: true, data: { name, tenants: [{ tenant: t }], ...(process.env.SEED_DEMO_STAFF_PASSWORD ? { password } : {}) } })
    : await payload.create({ collection: 'users', overrideAccess: true, data: { email, name, password, tenants: [{ tenant: t }] } })
  await upsert(payload, 'memberships', { and: [{ tenant: { equals: t } }, { user: { equals: user.id } }] }, { tenant: t, user: user.id, roles: [role.id], status: 'active', note: `Demo ${roleKey} (E-028 test data)` })
  return user
}

/**
 * E-028 demo data (demo tenant only, all fake): a second student whose last five weeks went through the REAL code
 * paths with a simulated clock (player beacons, a passed quiz, an on-time assignment, a grade), an advisor with
 * follow-ups over the last working days, and a finance user with one order in the inbox.
 * Idempotent: the student history is written once (ledger keys); leads and the order are upserted by natural key.
 */
async function seedDemoGamification(payload: Payload, t: number) {
  const ctx = { payload }
  const course = (await payload.find({ collection: 'courses', where: { and: [{ tenant: { equals: t } }, { slug: { equals: 'demo-program' } }] }, limit: 1, overrideAccess: true })).docs[0]
  const cohort = course && (await payload.find({ collection: 'cohorts', where: { and: [{ tenant: { equals: t } }, { course: { equals: course.id } }] }, limit: 1, overrideAccess: true })).docs[0]
  const tenant = await payload.findByID({ collection: 'tenants', id: t, overrideAccess: true })
  if (!course || !cohort) return

  // ---- Student with five weeks of history.
  const phone = '09129990002'
  const email = `${phone}@phone.demo.edvora.local`
  const existingUser = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })).docs[0]
  const student =
    existingUser ??
    (await payload.create({ collection: 'users', overrideAccess: true, data: { email, phone, name: 'دانشجوی نمونهٔ پیشرفت', roles: ['student'], password: randomBytes(24).toString('base64url'), tenants: [{ tenant: t }] } }))
  const today = tehranDayNumber(new Date())
  // Saturday (start of the Jalali week) four weeks before this week, 10:00 Tehran.
  const week0 = today - ((weekdayOf(today) - 6 + 7) % 7) - 28
  const at = (day: number, hour: number) => new Date(dayStartsAt(week0 + day).getTime() + hour * HOUR)
  let enrollment =
    (await payload.find({ collection: 'enrollments', where: { and: [{ user: { equals: student.id } }, { course: { equals: course.id } }] }, limit: 1, overrideAccess: true })).docs[0] ??
    (await payload.create({ collection: 'enrollments', overrideAccess: true, data: { tenant: t, user: student.id, course: course.id, cohort: cohort.id, status: 'active', enrolledAt: at(0, 9).toISOString() } }))
  const lessons = (await payload.find({ collection: 'lessons', where: { course: { equals: course.id } }, sort: 'order', limit: 10, overrideAccess: true })).docs
  const already = (await payload.find({ collection: 'learning-events', where: { and: [{ tenant: { equals: t } }, { idempotencyKey: { equals: xpKey.lesson(enrollment.id, lessons[0]!.id) } }] }, limit: 1, overrideAccess: true })).docs[0]

  if (!already && lessons.length >= 5) {
    const fresh = async () => (enrollment = await payload.findByID({ collection: 'enrollments', id: enrollment.id, depth: 0, overrideAccess: true }))
    /** Plays a lesson to the end with 60-second beacons starting at `start` (the real beacon path). */
    const watch = async (lesson: (typeof lessons)[number], start: Date) => {
      const beats = Math.ceil(((lesson.durationMinutes ?? 20) * 60 * 0.92) / 60)
      for (let i = 0; i <= beats; i++) {
        const now = new Date(start.getTime() + i * 60_000)
        const e = await fresh()
        const state = await loadCourseState(ctx, { tenantId: t, course, enrollment: e, now })
        await onLessonWatched(ctx, { tenant, enrollment: e, lesson, state, playedSeconds: 60, durationSeconds: null, now })
      }
    }
    // Week 1: lessons 1 and 5 (two learning days).
    await watch(lessons[0]!, at(0, 10))
    await watch(lessons[4]!, at(2, 18))
    // Week 2: the required quiz on lesson 2 (passed first try), lesson 2 marked complete, then lesson 3.
    const quiz = (await payload.find({ collection: 'quizzes', where: { and: [{ tenant: { equals: t } }, { lesson: { equals: lessons[1]!.id } }] }, limit: 1, overrideAccess: true })).docs[0]
    if (quiz) {
      const quizAt = at(7, 19)
      const attempt = await startAttempt(ctx, { tenantId: t, quiz, enrollment: await fresh(), attempts: [], extraAttempts: 0, now: quizAt })
      const snapshot = attempt.snapshot as { questions: { id: string; type: string; options: { id: string; correct: boolean }[]; acceptedAnswers: string[] }[] }
      const answers: Answers = Object.fromEntries(
        snapshot.questions.map((q) => [q.id, q.type === 'short' ? { text: q.acceptedAnswers[0] ?? '' } : { optionIds: q.options.filter((o) => o.correct).map((o) => o.id) }]),
      )
      await submitAttempt(ctx, attempt, quiz, answers, new Date(quizAt.getTime() + 8 * 60_000))
      const e = await fresh()
      const markAt = new Date(quizAt.getTime() + 10 * 60_000)
      const state = await loadCourseState(ctx, { tenantId: t, course, enrollment: e, now: markAt })
      const updated = await payload.update({ collection: 'enrollments', id: e.id, overrideAccess: true, data: { completedLessons: [...state.completed, lessons[1]!.id] } })
      await onLessonMarked(ctx, { tenant, enrollment: updated, lesson: lessons[1]!, state, now: markAt })
    }
    await watch(lessons[2]!, at(9, 20))
    // Week 3: lesson 4 and the assignment, submitted before the deadline.
    await watch(lessons[3]!, at(14, 11))
    const assignment = (await payload.find({ collection: 'assignments', where: { and: [{ tenant: { equals: t } }, { course: { equals: course.id } }] }, limit: 1, overrideAccess: true })).docs[0]
    if (assignment) {
      const sub = await payload.create({
        collection: 'submissions',
        overrideAccess: true,
        data: { assignment: assignment.id, user: student.id, enrollment: enrollment.id, text: 'نمونهٔ تحویل: جدول SWOT یک کافهٔ محلی با دو مورد در هر بخش.', submittedAt: at(16, 21).toISOString(), late: false },
      })
      // Graded by the academy (above the pass mark): only the final defense is left on the certificate path.
      await flushGamification()
      await payload.update({ collection: 'submissions', id: sub.id, overrideAccess: true, data: { scoreInput: '17', feedback: rt('تحلیل روشن و کامل.') } })
      await flushGamification()
    }
  }
  await refreshEnrollmentGamification(ctx, enrollment.id)

  // ---- Advisor with follow-ups (working days Sat–Wed; Thu/Fri are the default days off).
  const advisor = await ensureStaff(payload, t, 'advisor@demo.edvora.local', 'مشاور نمونه', 'advisor')
  await ensureStaff(payload, t, 'finance@demo.edvora.local', 'کارشناس مالی نمونه', 'finance')
  const followDays = Array.from({ length: 8 }, (_, i) => today - 8 + i).filter((d) => ![4, 5].includes(weekdayOf(d)))
  const nowMs = Date.now()
  const todayStart = dayStartsAt(today).getTime()
  const leadSpecs: { n: number; history: number[]; next: number | null; handledToday?: boolean }[] = [
    { n: 1, history: followDays.filter((_, i) => i % 2 === 0), next: today + 2, handledToday: true },
    { n: 2, history: followDays.filter((_, i) => i % 2 === 1), next: today + 3 },
    { n: 3, history: [], next: today, handledToday: true },
    { n: 4, history: [], next: today },
    { n: 5, history: [], next: today + 1 },
  ]
  for (const spec of leadSpecs) {
    const entries = spec.history.map((d, i) => ({
      at: new Date(dayStartsAt(d).getTime() + 11 * HOUR).toISOString(),
      outcome: i % 3 === 1 ? 'no_answer' : 'reached',
      by: advisor.id,
      dueAt: new Date(dayStartsAt(d).getTime() + 9 * HOUR).toISOString(),
      note: null,
    }))
    if (spec.handledToday) entries.push({ at: new Date(Math.max(todayStart + 60_000, nowMs - 30 * 60_000)).toISOString(), outcome: 'reached', by: advisor.id, dueAt: new Date(todayStart).toISOString(), note: null })
    const last = entries[entries.length - 1]
    const data = {
      tenant: t,
      name: `سرنخ نمونه ${['۱', '۲', '۳', '۴', '۵'][spec.n - 1]}`,
      phone: `0912999010${spec.n}`,
      course: course.id,
      status: spec.history.length || spec.handledToday ? 'follow_up' : 'contacted',
      advisor: advisor.id,
      message: 'داده آزمایشی آکادمی نمونه.',
      nextFollowUpAt: spec.next === null ? null : new Date(dayStartsAt(spec.next).getTime() + (spec.next === today ? 60_000 : 10 * HOUR)).toISOString(),
      followUps: entries,
      lastOutcome: last?.outcome ?? null,
      lastOutcomeAt: last?.at ?? null,
      lastOutcomeBy: last ? advisor.id : null,
    }
    const found = (await payload.find({ collection: 'leads', where: { and: [{ tenant: { equals: t } }, { phone: { equals: data.phone } }] }, limit: 1, overrideAccess: true })).docs[0]
    const context = { [FOLLOW_UP_CONTEXT]: true }
    if (found) await payload.update({ collection: 'leads', id: found.id, overrideAccess: true, context, data: data as never })
    else await payload.create({ collection: 'leads', overrideAccess: true, context, data: data as never })
  }

  // ---- One instalment order for the finance inbox: #1 paid, #2 overdue with a failed gateway attempt, #3 later.
  const part = tomanToRial(4_000_000)
  const orderData = {
    tenant: t,
    user: student.id,
    course: course.id,
    cohort: cohort.id,
    subtotal: part * 3,
    discount: 0,
    total: part * 3,
    status: 'partially_paid',
    instalments: [
      { index: 0, amount: part, dueDate: at(0, 9).toISOString(), status: 'paid', paidAt: at(0, 9).toISOString() },
      { index: 1, amount: part, dueDate: new Date(todayStart - 5 * DAY).toISOString(), status: 'pending' },
      { index: 2, amount: part, dueDate: new Date(todayStart + 25 * DAY).toISOString(), status: 'pending' },
    ],
    payments: [
      { instalmentIndex: 0, provider: 'mock', authority: 'DEMO-E028-0', amount: part, status: 'verified', refId: 'DEMO-REF-0' },
      { instalmentIndex: 1, provider: 'mock', authority: 'DEMO-E028-1', amount: part, status: 'failed', error: 'Demo: cancelled by payer' },
    ],
  }
  await upsert(payload, 'orders', { and: [{ tenant: { equals: t } }, { user: { equals: student.id } }, { course: { equals: course.id } }] }, orderData)
}

/**
 * E-032 test data, demo academy only (never iba): the WordPress import connection the committed fixture bundles are
 * signed with (`packages/integrations/src/wordpress/fixtures/*.edvora-bundle`, secret `edvora-fixture-secret`).
 * Fixture-only secret, published in the repo on purpose; valid 30 days from each seed so e2e runs can upload the bundle.
 */
/** Demo-only image used by the rich-text e2e (QA-E032-12): a 1×1 PNG, created once. */
async function seedDemoMedia(payload: Payload, t: number) {
  const found = await payload.find({ collection: 'media', where: { and: [{ tenant: { equals: t } }, { alt: { equals: 'نمونه تصویر demo' } }] }, limit: 1, overrideAccess: true })
  if (found.docs[0]) return
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await payload.create({ collection: 'media', data: { tenant: t, alt: 'نمونه تصویر demo' }, file: { data: png, mimetype: 'image/png', name: 'demo.png', size: png.length }, overrideAccess: true })
}

async function seedDemoImportConnection(payload: Payload, t: number) {
  const connectionId = 'cnx_fixture'
  const found = (await payload.find({ collection: 'import-connections', where: { connectionId: { equals: connectionId } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (found && found.tenant !== t && (typeof found.tenant !== 'object' || found.tenant?.id !== t)) throw new Error('cnx_fixture exists in another academy')
  const data = {
    tenant: t,
    label: 'نمونهٔ آزمایشی (fixture)',
    connectionId,
    ...sealConnectionSecret('edvora-fixture-secret'),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    revokedAt: null,
  }
  if (found) await payload.update({ collection: 'import-connections', id: found.id, data, overrideAccess: true })
  else await payload.create({ collection: 'import-connections', data, overrideAccess: true })
}

/** Role templates (ADR 006 §4) for one academy. Re-running resets the templates to the code definition. */
async function seedRoleTemplates(payload: Payload, tenantId: number) {
  for (const t of ROLE_TEMPLATES) {
    await upsert(payload, 'roles', { and: [{ tenant: { equals: tenantId } }, { key: { equals: t.key } }] }, {
      tenant: tenantId,
      key: t.key,
      template: t.key,
      name: t.name.fa,
      description: t.description,
      permissions: [...t.permissions],
      archived: false,
    })
  }
}

async function seedAdmin(payload: Payload, tenantIds: number[]) {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password) {
    console.warn('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user')
    return
  }
  const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
  const data = { email, name: 'Edvora Admin', roles: ['super-admin'] as const, tenants: tenantIds.map((tenant) => ({ tenant })) }
  if (found.docs[0]) await payload.update({ collection: 'users', id: found.docs[0].id, data: { ...data, roles: [...data.roles] }, overrideAccess: true })
  else await payload.create({ collection: 'users', data: { ...data, roles: [...data.roles], password }, overrideAccess: true })
  console.info(`Super admin: ${email} (password from SEED_ADMIN_PASSWORD)`)
}

/** SEED_TENANTS=demo seeds only the test academy (public demo environments must not show unconfirmed client content). */
function tenantsToSeed(): Set<string> {
  const raw = process.env.SEED_TENANTS?.trim()
  const wanted = new Set((raw ? raw : 'iba,demo').split(',').map((s) => s.trim()).filter(Boolean))
  for (const slug of wanted) if (slug !== 'iba' && slug !== 'demo') throw new Error(`Unknown tenant in SEED_TENANTS: ${slug}`)
  return wanted
}

async function main() {
  const wanted = tenantsToSeed()
  const payload = await getPayload({ config })
  const ids: number[] = []
  if (wanted.has('iba')) ids.push(await seedIba(payload))
  if (wanted.has('demo')) ids.push(await seedDemo(payload))
  for (const t of ids) await seedRoleTemplates(payload, t)
  if (wanted.has('demo')) {
    const demo = ids[ids.length - 1]!
    await seedDemoPeople(payload, demo)
    await seedDemoImportConnection(payload, demo)
    await seedDemoMedia(payload, demo)
    await seedDemoGamification(payload, demo)
  }
  await seedAdmin(payload, ids)
  await flushGamification()
  console.info(`Seed complete: tenants ${[...wanted].join(' + ')}, role templates`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
