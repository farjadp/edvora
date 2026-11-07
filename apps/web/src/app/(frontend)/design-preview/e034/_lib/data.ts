/**
 * Sample tenant for the E-034 preview. All values are fake and neutral: nothing here is an IBA fact.
 * In the real build these come from `tenants` (name, logo, loginWelcome → tagline, stats, contact.phone).
 */
export type DemoTenant = {
  name: string
  /** `tenants.loginWelcome`, falling back to `tagline`, then to «خوش آمدید به {name}». */
  welcome: string
  tagline: string
  stats: readonly { value: string; label: string }[]
  /** `tenants.contact.phone` (sample, not a real number). */
  phone: string
  logoUrl: string | null
}

export const DEMO_TENANT: DemoTenant = {
  name: 'آکادمی نمونه',
  welcome: 'مسیر یادگیری شما از همین‌جا ادامه پیدا می‌کند.',
  tagline: 'آموزش حرفه‌ای، قدم به قدم.',
  stats: [
    { value: '۱۲', label: 'دورهٔ آموزشی' },
    { value: '۳۶۰', label: 'ساعت محتوا' },
    { value: '۲۴', label: 'جلسهٔ زنده' },
  ],
  phone: '۰۲۱-۱۲۳۴۵۶۷۸',
  logoUrl: null,
}

export const SAMPLE_PHONE_LATIN = '09123456789'
export const SAMPLE_EMAIL = 'name@example.com'

export type ScreenGroup = 'student' | 'staff' | 'admin' | 'shared'

export const GROUP_LABEL: Record<ScreenGroup, string> = {
  student: 'دانشجو · /login',
  staff: 'کارکنان · /staff/login',
  admin: 'مدیریت · /admin/login',
  shared: 'مشترک',
}

export type ScreenDef = { id: string; group: ScreenGroup; label: string; spec: string; backend?: boolean }

/** Screen id → spec state (docs/ux/E-034-login.md). `backend` = designed for behaviour that does not exist yet. */
export const SCREENS: readonly ScreenDef[] = [
  { id: 's-phone', group: 'student', label: 'شماره · خالی', spec: 'S1 · S2' },
  { id: 's-phone-error', group: 'student', label: 'شمارهٔ نادرست', spec: 'S3' },
  { id: 's-submitting', group: 'student', label: 'در حال ارسال', spec: 'S4' },
  { id: 's-code', group: 'student', label: 'کد + زمان‌سنج', spec: 'S10 · S11' },
  { id: 's-code-new', group: 'student', label: 'کد · کاربر تازه', spec: 'S10 (نام)' },
  { id: 's-code-wrong', group: 'student', label: 'کد نادرست', spec: 'S12' },
  { id: 's-code-expired', group: 'student', label: 'کد منقضی', spec: 'S13' },
  { id: 's-locked', group: 'student', label: 'چند کد اشتباه', spec: 'S14' },
  { id: 's-ratelimit', group: 'student', label: 'درخواست زیاد (قفل)', spec: 'S9', backend: true },
  { id: 's-suspended', group: 'student', label: 'حساب غیرفعال', spec: 'S15' },
  { id: 's-session', group: 'student', label: 'برای ادامه وارد شوید', spec: 'S18' },
  { id: 't-empty', group: 'staff', label: 'ایمیل و رمز · خالی', spec: 'T1 · T2' },
  { id: 't-validation', group: 'staff', label: 'اعتبارسنجی فیلد', spec: 'T3' },
  { id: 't-wrong', group: 'staff', label: 'اطلاعات نادرست', spec: 'T4' },
  { id: 't-phone-hint', group: 'staff', label: 'شماره به‌جای ایمیل', spec: 'staff.phoneInEmail' },
  { id: 't-suspended', group: 'staff', label: 'حساب غیرفعال', spec: 'T5' },
  { id: 't-locked', group: 'staff', label: 'قفل با شمارش معکوس', spec: 'T6', backend: true },
  { id: 't-submitting', group: 'staff', label: 'در حال ورود', spec: 'T7' },
  { id: 't-expired', group: 'staff', label: 'نشست تمام شده', spec: 'T11' },
  { id: 't-out', group: 'staff', label: 'خارج شدید', spec: 'T12' },
  { id: 't-2fa', group: 'staff', label: 'تأیید دومرحله‌ای', spec: 'V1' },
  { id: 't-2fa-wrong', group: 'staff', label: 'کد دومرحله‌ای نادرست', spec: 'V3' },
  { id: 't-2fa-locked', group: 'staff', label: 'دومرحله‌ای قفل', spec: 'V4' },
  { id: 't-enrol', group: 'staff', label: 'فعال‌سازی (QR)', spec: 'N2 · N5' },
  { id: 'a-skin', group: 'admin', label: 'پوستهٔ ورود مدیریت', spec: 'A1' },
  { id: 'a-error', group: 'admin', label: 'خطای Payload (toast)', spec: 'A2 · A8' },
  { id: 'a-suspended', group: 'admin', label: 'حساب غیرفعال (toast)', spec: 'A4' },
  { id: 'a-moved', group: 'admin', label: 'در جابه‌جا شده', spec: 'A1 فاز ۲' },
  { id: 'forgot', group: 'shared', label: 'فراموشی رمز', spec: 'T13 · A7' },
  { id: 'tenant-unknown', group: 'shared', label: 'آکادمی نامشخص', spec: 'S20 · T14', backend: true },
  { id: 'maintenance', group: 'shared', label: 'به‌روزرسانی', spec: 'S21 · T14', backend: true },
  { id: 'error-server', group: 'shared', label: 'خطای سرور', spec: 'S6 · T9' },
  { id: 'error-network', group: 'shared', label: 'قطع اتصال', spec: 'S7 · T8' },
]

export function isScreen(v: string): boolean {
  return SCREENS.some((s) => s.id === v)
}
