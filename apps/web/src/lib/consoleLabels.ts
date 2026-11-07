import type { Tone } from '@edvora/ui/console'

/** Persian labels and pill tones for the statuses the console shows. */
type L = { label: string; tone: Tone }

export const ORDER_STATUS: Record<string, L> = {
  pending: { label: 'در انتظار پرداخت', tone: 'warn' },
  partially_paid: { label: 'اقساط در جریان', tone: 'info' },
  paid: { label: 'پرداخت‌شده', tone: 'ok' },
  failed: { label: 'ناموفق', tone: 'danger' },
  refunded: { label: 'بازگشت‌شده', tone: 'neutral' },
  cancelled: { label: 'لغوشده', tone: 'neutral' },
}

export const LEAD_STATUS: Record<string, L> = {
  new: { label: 'جدید', tone: 'brand' },
  contacted: { label: 'تماس گرفته شد', tone: 'info' },
  follow_up: { label: 'در حال پیگیری', tone: 'warn' },
  enrolled: { label: 'ثبت‌نام شد', tone: 'ok' },
  lost: { label: 'از دست رفته', tone: 'neutral' },
}

export const ENROLLMENT_STATUS: Record<string, L> = {
  active: { label: 'فعال', tone: 'ok' },
  completed: { label: 'تکمیل‌شده', tone: 'brand' },
  cancelled: { label: 'لغوشده', tone: 'neutral' },
}

export const SUBMISSION_STATUS: Record<string, L> = {
  submitted: { label: 'در انتظار نمره', tone: 'warn' },
  graded: { label: 'نمره‌داده‌شده', tone: 'ok' },
  missing: { label: 'تحویل‌نشده', tone: 'neutral' },
}

export const pill = (map: Record<string, L>, key: string | null | undefined): L => map[key ?? ''] ?? { label: key ?? '—', tone: 'neutral' }
