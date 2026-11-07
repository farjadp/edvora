/** Persian copy for live classes (phase-2 §D). Server and client safe: no imports from @edvora/core root. */

export const LIVE_MESSAGE: Record<string, { text: string; tone: 'info' | 'ok' | 'warn' }> = {
  early: { text: 'هنوز زمان ورود به این کلاس نرسیده است. دکمهٔ ورود از چند دقیقه پیش از شروع فعال می‌شود.', tone: 'info' },
  'not-started': { text: 'مدرس هنوز کلاس را شروع نکرده است. چند دقیقهٔ دیگر دوباره امتحان کنید.', tone: 'info' },
  ended: { text: 'این کلاس به پایان رسیده است. ضبط کلاس پس از آماده شدن در همین صفحه قرار می‌گیرد.', tone: 'info' },
  cancelled: { text: 'این کلاس لغو شده است.', tone: 'warn' },
  'provider-down': {
    text: 'اتصال به سرویس کلاس برقرار نشد. چند لحظهٔ دیگر دوباره امتحان کنید؛ اگر مشکل ادامه داشت با پشتیبانی آکادمی تماس بگیرید.',
    tone: 'warn',
  },
  'ended-ok': { text: 'کلاس برای همه پایان یافت.', tone: 'ok' },
  left: { text: 'از کلاس خارج شدید. حضور شما ثبت شد.', tone: 'ok' },
  'copy-started': { text: 'کپی ضبط شروع شد. چند دقیقهٔ دیگر این صفحه را دوباره باز کنید.', tone: 'info' },
}

export const RECORDING_STATUS: Record<string, string> = {
  ready: 'گزارش شد',
  waiting: 'در انتظار فایل MP4',
  copying: 'در حال کپی',
  copied: 'آماده تماشا',
  failed: 'خطا در کپی',
}

export const STATUS_LABEL: Record<string, string> = {
  scheduled: 'زمان‌بندی‌شده',
  live: 'در حال برگزاری',
  ended: 'پایان یافته',
  cancelled: 'لغو شده',
}
