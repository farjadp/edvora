import { normalizeIranMobile } from './phone'

/*
 * How the login screens read the responses the server already gives (E-034). Pure and client-safe: no auth logic,
 * nothing here decides who may sign in. Import from '@edvora/core/login' in client components.
 */

export type StaffLoginOutcome = 'ok' | 'invalid' | 'inactive' | 'locked' | 'error'

/**
 * Payload's `error:userLocked` text (en + fa, @payloadcms/translations 3.93). LockedAuth is a 401 like wrong credentials
 * and its body carries only `{ errors: [{ message }] }`, so the message is the only signal (spec §7.6).
 */
export const PAYLOAD_LOCKED_MESSAGES = [
  'This user is locked due to having too many failed login attempts.',
  'این حساب به دلیل تلاش‌های ناموفق متعدد برای ورود، قفل شده است.',
] as const

function errorEntries(body: unknown): Array<{ name?: unknown; message?: unknown }> {
  if (!body || typeof body !== 'object' || !('errors' in body)) return []
  const errors = (body as { errors: unknown }).errors
  return Array.isArray(errors) ? errors.filter((e): e is { name?: unknown; message?: unknown } => Boolean(e) && typeof e === 'object') : []
}

/** Maps POST /api/users/login (status + JSON body) to a screen state. Unknown email, wrong password and student accounts stay one state. */
export function classifyStaffLogin(status: number, body: unknown): StaffLoginOutcome {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 423 || status === 429) return 'locked'
  if (status >= 500) return 'error'
  const locked = errorEntries(body).some(
    (e) => e.name === 'LockedAuth' || (typeof e.message === 'string' && (PAYLOAD_LOCKED_MESSAGES as readonly string[]).includes(e.message)),
  )
  if (locked) return 'locked'
  if (status === 403) return 'inactive'
  return 'invalid'
}

export type StudentOtpReason =
  | 'sent'
  | 'already-sent'
  | 'signed-in'
  | 'invalid-phone'
  | 'sms-failed'
  | 'server'
  | 'expired'
  | 'too-many'
  | 'wrong-code'
  | 'inactive'
  | 'unknown'

/** Messages returned by requestOtp / verifyOtp in apps/web actions.ts today. Keep in sync (test covers the table). */
const OTP_MESSAGES: Record<string, StudentOtpReason> = {
  'کد ورود پیامک شد.': 'sent',
  'کد قبلاً ارسال شده است. یک دقیقه صبر کنید.': 'already-sent',
  'وارد شدید.': 'signed-in',
  'شماره موبایل معتبر نیست.': 'invalid-phone',
  'ارسال پیامک انجام نشد. دوباره تلاش کنید.': 'sms-failed',
  'خطایی رخ داد. دوباره تلاش کنید.': 'server',
  'کد منقضی شده است. دوباره درخواست دهید.': 'expired',
  'تعداد تلاش‌ها زیاد بود. کد جدید بگیرید.': 'too-many',
  'کد وارد شده درست نیست.': 'wrong-code',
  'این حساب غیرفعال است. با پشتیبانی آکادمی تماس بگیرید.': 'inactive',
}

/** Reads the student OTP action result. The actions return only text today (no reason code); see E-034 open issues. */
export function studentOtpReason(state: { ok: boolean; message: string }): StudentOtpReason {
  return OTP_MESSAGES[state.message] ?? 'unknown'
}

/** True when a value typed into the staff email field is an Iranian mobile number (the «دانشجو هستید؟» hint). */
export function looksLikePhone(value: string): boolean {
  return !value.includes('@') && normalizeIranMobile(value) !== null
}
