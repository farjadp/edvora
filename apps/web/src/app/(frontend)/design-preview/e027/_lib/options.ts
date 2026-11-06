import { notFound } from 'next/navigation'

/** The preview is a dev tool. Pages and layout call this first. */
export function assertDev(): void {
  if (process.env.NODE_ENV === 'production') notFound()
}

export type OptionId = 'seal' | 'girih' | 'block'
export type ScreenId = 'dashboard' | 'dashboard-off' | 'lesson' | 'quiz' | 'advisor'
export type BrandId = 'tenant' | 'blue' | 'teal' | 'wine'

export const OPTION_IDS: readonly OptionId[] = ['seal', 'girih', 'block']

/** Decision (Farjad, 2026-11-06): A · Seal, with B's girih star as the certificate seal. */
export const CHOSEN_OPTION: OptionId = 'seal'

export const SCREENS: readonly { id: ScreenId; label: string; wireframe: string }[] = [
  { id: 'dashboard', label: 'داشبورد دانشجو', wireframe: '۲٫۱' },
  { id: 'dashboard-off', label: 'داشبورد · گیمیفیکیشن خاموش', wireframe: '۲٫۱ (OFF)' },
  { id: 'lesson', label: 'پایان جلسه', wireframe: '۲٫۲' },
  { id: 'quiz', label: 'نتیجهٔ آزمون', wireframe: '۲٫۳' },
  { id: 'advisor', label: 'میز مشاور', wireframe: '۲٫۴' },
]

export type OptionMeta = {
  id: OptionId
  nameFa: string
  nameEn: string
  idea: string
  displayFace: string
  motion: string
  bestFor: string
  risk: string
}

export const OPTIONS: Record<OptionId, OptionMeta> = {
  seal: {
    id: 'seal',
    nameFa: 'مُهر',
    nameEn: 'Seal',
    idea: 'دفترچهٔ ممتاز یک مدیر: کاغذ و مرکب، خط‌های ظریف، و فقط یک مُهر طلایی برای لحظه‌های ماندگار.',
    displayFace: 'مُرَبّا (Morabba)',
    motion: 'کم‌حرکت: حلقه با کمان نرم پر می‌شود، مُهر یک بار «می‌نشیند» و برق می‌زند.',
    bestFor: 'مدیران ۴۵ به بالا، برند لوکس و رسمی (IBA)',
    risk: 'اگر محتوا کم باشد خشک و خالی می‌نماید؛ فاصله‌ها و تایپ باید دقیق اجرا شوند.',
  },
  girih: {
    id: 'girih',
    nameFa: 'گره',
    nameEn: 'Girih',
    idea: 'صنعت دست ایرانی: الگوی گره‌چینی هشت‌پر به‌جای حلقه، بافت گرم روی رنگ آکادمی.',
    displayFace: 'کلمه (Kalameh) — حذف شد؛ اینجا وزیرمتن',
    motion: 'پرها یکی‌یکی و آرام پر می‌شوند؛ چیزی نمی‌پرد و نمی‌لرزد.',
    bestFor: 'آکادمی‌هایی که هویت ایرانی و گرما می‌خواهند',
    risk: 'الگو می‌تواند شلوغ شود؛ باید فقط در ناحیه‌های بدون متن بنشیند. هزینهٔ نگهداری ایکون‌ها بیشتر است.',
  },
  block: {
    id: 'block',
    nameFa: 'پیشران',
    nameEn: 'Drive',
    idea: 'بلوک‌های رنگیِ جسور و عددهای بزرگ: پیشرفت را از دور می‌شود دید.',
    displayFace: 'پیدا (Peyda) — حذف شد؛ اینجا وزیرمتن',
    motion: 'بلوک‌ها با کشیدن سریع (۲۵۰–۴۰۰ms) باز می‌شوند؛ ستون‌های هفتگی از پایین رشد می‌کنند.',
    bestFor: 'آکادمی‌های کارگاهی و پرانرژی، کاربران جوان‌تر',
    risk: 'کمتر «رسمی» است و به رنگ تنانت وابسته‌تر؛ رنگ‌های روشن به متن تیره روی بلوک نیاز دارند.',
  },
}

export const BRANDS: Record<BrandId, { label: string; brand?: `#${string}`; accent?: `#${string}` }> = {
  tenant: { label: 'رنگ تنانت (پیش‌فرض)' },
  blue: { label: 'آبی IBA', brand: '#1A56DB', accent: '#F59E0B' },
  teal: { label: 'سبزآبی دمو', brand: '#0F766E', accent: '#F97316' },
  wine: { label: 'عنابی', brand: '#8B1E3F', accent: '#E8B04A' },
}

export function isOption(v: string): v is OptionId {
  return (OPTION_IDS as readonly string[]).includes(v)
}
export function isScreen(v: string): v is ScreenId {
  return SCREENS.some((s) => s.id === v)
}
export function parseBrand(v: string | string[] | undefined): BrandId {
  const s = Array.isArray(v) ? v[0] : v
  return s && s in BRANDS ? (s as BrandId) : 'tenant'
}
