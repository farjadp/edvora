import { notFound } from 'next/navigation'

/** The preview is a dev tool. Pages and layout call this first. */
export function assertDev(): void {
  if (process.env.NODE_ENV === 'production') notFound()
}

export type OptionId = 'a' | 'b' | 'c'
export type BrandId = 'tenant' | 'blue' | 'teal' | 'wine'

export const OPTION_IDS: readonly OptionId[] = ['a', 'b', 'c']

export type OptionMeta = { id: OptionId; nameFa: string; nameEn: string; idea: string; risk: string }

export const OPTIONS: Record<OptionId, OptionMeta> = {
  a: {
    id: 'a',
    nameFa: 'صفحهٔ دوپاره',
    nameEn: 'Split screen',
    idea: 'نیمی از صفحه صدای آکادمی است (رنگ تنانت، الگوی گره، نام و جملهٔ خوش‌آمد و سه عدد)، نیمی فرم. روی موبایل پاره‌ی آکادمی به یک نوار فشرده تبدیل می‌شود.',
    risk: 'رنگ‌های روشن تنانت به متن تیره روی پانل نیاز دارند (برند-اینک محاسبه‌شده این را حل می‌کند). پانل نباید فرم را روی ۳۶۰×۶۴۰ پایین ببرد؛ روی موبایل فقط نوار است.',
  },
  b: {
    id: 'b',
    nameFa: 'کارت مُهر',
    nameEn: 'Seal card',
    idea: 'کارت میانی روی کاغذ، با گیوشهٔ بزرگ (نقش اسکناس) پشتش، قاب دوخطی مثل گواهی و مُهر آکادمی که لبهٔ بالای کارت را می‌شکافد.',
    risk: 'واترمارک باید ایستا و سبک بماند (یک SVG)؛ قاب و مُهر روی نام‌های بلند آکادمی باید بشکنند و برش نخورند.',
  },
  c: {
    id: 'c',
    nameFa: 'صفحهٔ مرکب',
    nameEn: 'Ink page',
    idea: 'بی‌کارت: جملهٔ خوش‌آمد با مرَبّای درشت، یک خط مرکب و فرم با زیرخط‌های مو، روی کاغذ و با فاصلهٔ زیاد.',
    risk: 'نام‌های بلند آکادمی خط‌شکنی می‌شوند (محدود به دو خط)؛ بدون کارت، پیام‌ها فقط با تایپ و خط جدا می‌شوند و باید دقیق اجرا شوند.',
  },
}

export const BRANDS: Record<BrandId, { label: string; brand?: `#${string}`; accent?: `#${string}` }> = {
  tenant: { label: 'رنگ تنانت (پیش‌فرض)' },
  blue: { label: 'آبی', brand: '#1A56DB', accent: '#F59E0B' },
  teal: { label: 'سبزآبی دمو', brand: '#0F766E', accent: '#F97316' },
  wine: { label: 'عنابی', brand: '#8B1E3F', accent: '#E8B04A' },
}

export function isOption(v: string): v is OptionId {
  return (OPTION_IDS as readonly string[]).includes(v)
}
export function parseBrand(v: string | string[] | undefined): BrandId {
  const s = Array.isArray(v) ? v[0] : v
  return s && s in BRANDS ? (s as BrandId) : 'tenant'
}
