/** Persian labels for the import screens (client-safe, no Node imports). */
export const COLLECTION_LABELS: Record<string, string> = {
  users: 'کاربران',
  media: 'رسانه‌ها',
  courses: 'دوره‌ها',
  lessons: 'جلسه‌ها',
  questions: 'سؤال‌ها',
  quizzes: 'آزمون‌ها',
  coupons: 'کدهای تخفیف',
  orders: 'سفارش‌ها',
  enrollments: 'ثبت‌نام‌ها و پیشرفت',
  certificates: 'گواهی‌ها',
  posts: 'مقاله‌ها',
  pages: 'صفحه‌ها',
  redirects: 'تغییر مسیرها',
}

export const ACTION_LABELS: Record<string, string> = {
  create: 'جدید',
  update: 'به‌روزرسانی',
  attach: 'عضویت افزوده',
  unchanged: 'بدون تغییر',
  conflict: 'تعارض',
  held: 'نگه‌داشته',
  skipped: 'ردشده',
  failed: 'خطا',
}

export const ACTIONS = ['create', 'update', 'unchanged', 'conflict', 'held', 'skipped'] as const

export const MAPPER_LABELS: Record<string, string> = {
  'wp-core': 'وردپرس (کاربران، نوشته‌ها، رسانه‌ها)',
  woocommerce: 'ووکامرس (محصول، سفارش، کد تخفیف)',
  lifterlms: 'LifterLMS',
  tutor: 'Tutor LMS',
}

export const SEVERITY_LABELS: Record<string, string> = { blocking: 'مسدودکننده', warn: 'هشدار', info: 'برای اطلاع' }

export const STATUS_LABELS: Record<string, string> = {
  draft: 'در انتظار داده از وردپرس',
  ingesting: 'در حال دریافت داده',
  ready: 'دریافت کامل، در صف بررسی',
  'dry-run': 'در حال بررسی',
  'awaiting-confirm': 'گزارش آماده؛ منتظر تأیید',
  media: 'در حال دریافت رسانه‌ها',
  committing: 'در حال ورود داده',
  done: 'پایان یافته',
  failed: 'ناموفق',
  rejected: 'رد شده',
  cancelled: 'لغو شده',
}

export const MODE_LABELS: Record<string, string> = { push: 'افزونه (ارسال مستقیم)', bundle: 'فایل خروجی افزونه', rest: 'REST', wxr: 'WXR' }

export const HELD_REASON_LABELS: Record<string, string> = { no_phone: 'شماره ندارد', duplicate_phone: 'شمارهٔ تکراری' }
