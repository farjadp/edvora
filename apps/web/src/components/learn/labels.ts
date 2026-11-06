import { toPersianDigits } from '@edvora/core/digits'
import { formatJalali } from '@edvora/core/jalali'
import type { LessonLock, Requirement } from '@edvora/core'

/** Jalali date in Tehran time; adds the time unless it is the start of the day. */
export function jalaliDateTime(date: Date | string): string {
  const d = new Date(date)
  const time = formatJalali(d, 'HH:mm')
  return time === '۰۰:۰۰' ? formatJalali(d, 'd MMMM yyyy') : `${formatJalali(d, 'd MMMM yyyy')}، ساعت ${time}`
}

/** "باز می‌شود ..." line for a locked lesson (R2). */
export function lockText(lock: LessonLock, titleOf: (lessonId: string) => string, blockerOf?: (lessonId: string) => Requirement[]): string {
  if (lock.state === 'open') return ''
  if (lock.reason === 'date') return `باز می‌شود ${jalaliDateTime(lock.unlockAt)}`
  const blockers = blockerOf?.(lock.previousLessonId) ?? []
  const quiz = blockers.find((b) => b.kind === 'quiz')
  const base = `پس از تکمیل جلسهٔ «${titleOf(lock.previousLessonId)}»`
  return quiz ? `${base} و قبولی در «${quiz.title}»` : base
}

export const REQUIREMENT_STATE: Record<Requirement['state'], string> = {
  done: 'انجام شد',
  pending: 'انجام نشده',
  failed: 'قبول نشده',
  unreleased: 'هنوز منتشر نشده',
}

export const ELIGIBILITY_REASON: Record<'progress' | 'quiz' | 'assignment' | 'defense', string> = {
  progress: 'همهٔ جلسات تکمیل نشده‌اند',
  quiz: 'آزمون الزامی قبول نشده',
  assignment: 'تکلیف الزامی هنوز قبول نشده',
  defense: 'دفاع نهایی انجام نشده',
}

export const fa = (n: number | string) => toPersianDigits(n)

/** 18.5 → ۱۸٫۵ */
export const faScore = (n: number) => toPersianDigits(String(Math.round(n * 100) / 100)).replace('.', '٫')
