import { formatJalali } from '@edvora/core'

/**
 * Fake, hard-coded data for the E-027 preview. Names are samples; no IBA fees, dates or claims.
 * (Server-only module: formatJalali lives in the @edvora/core root.)
 */

export const student = { name: 'سارا مرادی', first: 'سارا' }

export const course = {
  title: 'MBA برند',
  cohort: 'دورهٔ نمونه',
  progress: 40,
  done: 12,
  total: 30,
  nextLessonNo: 13,
  nextLessonTitle: 'جایگاه‌یابی برند در بازار',
  module: 'ماژول ۳ · استراتژی برند',
  nextLessonMinutes: 18,
}

export const week = {
  goalDays: 2,
  doneDays: 1,
  streakWeeks: 3,
  /** Saturday → Friday. `today` is Monday. */
  days: [
    { short: 'ش', full: 'شنبه', done: true, today: false },
    { short: 'ی', full: 'یکشنبه', done: false, today: false },
    { short: 'د', full: 'دوشنبه', done: false, today: true },
    { short: 'س', full: 'سه‌شنبه', done: false, today: false },
    { short: 'چ', full: 'چهارشنبه', done: false, today: false },
    { short: 'پ', full: 'پنجشنبه', done: false, today: false },
    { short: 'ج', full: 'جمعه', done: false, today: false },
  ],
  pendingLessons: 2,
}

export const level = { name: 'کوشا', next: 'حرفه‌ای', toNext: 120, pct: 85 }

export const lastBadge = { name: 'قدم اول', date: formatJalali(new Date('2026-11-05T09:00:00Z')) }

export type PathState = 'done' | 'current' | 'todo' | 'sealed'
export const certPath: { label: string; detail: string; state: PathState }[] = [
  { label: 'درس‌ها', detail: '۱۲ از ۳۰', state: 'current' },
  { label: 'تکلیف‌ها', detail: '۱ از ۳', state: 'todo' },
  { label: 'آزمون‌ها', detail: '۲ از ۴', state: 'todo' },
  { label: 'دفاع نهایی', detail: 'پس از تکلیف‌ها', state: 'todo' },
  { label: 'گواهی', detail: 'مهر می‌شود', state: 'sealed' },
]
export const certRemaining = '۱۸ جلسه، ۲ تکلیف، ۲ آزمون و دفاع نهایی باقی مانده است.'

export const releasedThisWeek = [
  { no: 13, title: 'جایگاه‌یابی برند در بازار', state: 'next' as const },
  { no: 14, title: 'شخصیت برند و لحن گفتار', state: 'todo' as const },
]

export const lessonList = [
  { no: 11, title: 'تحلیل رقبا', done: true },
  { no: 12, title: 'مخاطب هدف', done: true },
  { no: 13, title: 'جایگاه‌یابی برند در بازار', done: false, current: true },
  { no: 14, title: 'شخصیت برند و لحن گفتار', done: false },
  { no: 15, title: 'معماری برند', done: false },
]

export const quiz = {
  title: 'آزمون ماژول ۳',
  passMark: 60,
  pass: { correct: 8, total: 10, pct: 80, strength: 'در بخش «جایگاه‌یابی» عملکرد شما از میانگین دوره بالاتر بود.' },
  fail: {
    correct: 4,
    total: 10,
    pct: 40,
    weak: 'تحلیل مخاطب',
    lessons: ['جلسهٔ ۱۲ — مخاطب هدف', 'جلسهٔ ۱۰ — پژوهش بازار'],
    attempt: 1,
    maxAttempts: 3,
  },
}

export const advisor = {
  name: 'نرگس',
  dueToday: 8,
  done: 5,
  streakDays: 4,
  team: { done: 26, total: 40 },
  next: 'علی رضایی',
  leads: [
    { name: 'علی رضایی', interest: 'MBA برند', phone: '0912 000 0001', when: '۱۰:۳۰', overdue: true },
    { name: 'مینا کاظمی', interest: 'کارگاه رهبری', phone: '0912 000 0002', when: '۱۱:۰۰', overdue: false },
    { name: 'حسین نادری', interest: 'MBA برند', phone: '0912 000 0003', when: '۱۴:۰۰', overdue: false },
    { name: 'لیلا صفوی', interest: 'DBA', phone: '0912 000 0004', when: '۱۵:۳۰', overdue: false },
  ],
  win: 'پیمان توکلی ثبت‌نام کرد. دست شما درد نکند.',
  outcomes: ['دسترسی شد', 'پاسخ نداد', 'زمان بعدی تعیین شد', 'ثبت‌نام کرد'],
}
