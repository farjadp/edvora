import { cx, focusRing } from '@edvora/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Emblem, Ring } from './_components/art'
import { ctaClass, disp } from './_components/kit'
import { BRANDS, OPTIONS, OPTION_IDS, SCREENS, assertDev, type BrandId, type OptionId } from './_lib/options'

export const metadata: Metadata = { title: 'E-027 · گزینه‌های بصری', robots: { index: false, follow: false } }

const ACCENTS: Record<OptionId, { accents: string; icons: string }> = {
  seal: {
    accents: 'رنگ تنانت فقط برای حلقه و دکمه؛ طلایی (--milestone) فقط برای نشان، سطح و مُهر؛ خط‌های مو و فاصلهٔ زیاد.',
    icons: 'خط نازک ۱٫۵ با سر گرد؛ مُهر دندانه‌دار، حلقه‌های هم‌مرکز (گیوشه) به‌عنوان واترمارک.',
  },
  girih: {
    accents: 'زمینهٔ گرم شنی، سطح رنگ‌گرفته از تنانت (٪۷)، طلایی (--milestone) برای نشان؛ الگوی گره فقط بدون متن.',
    icons: 'خط ۱٫۹ زاویه‌دار؛ ستارهٔ هشت‌پر (دو مربع) برای حلقه، نقطه‌های هفته، گره‌های مسیر و نشان.',
  },
  block: {
    accents: 'بلوک پر از رنگ تنانت و رنگ تأکید، بلوک طلایی برای سطح، سبز/مرکب برای نتیجهٔ آزمون؛ متن با رنگ «ink» محاسبه‌شده.',
    icons: 'خط ضخیم ۳ با سر چهارگوش؛ شش‌ضلعی طلایی، نوارهای هفتگی و ۳۰ خانهٔ درس.',
  },
}

function Specimen({ option, brand }: { option: OptionId; brand: BrandId }) {
  return (
    <div
      data-e027-option={option}
      data-e027-brand={brand === 'tenant' ? undefined : brand}
      className="flex min-w-0 flex-wrap items-center gap-4 rounded-xl border border-line bg-[var(--e-ground)] p-4"
    >
      <Ring option={option} value={40} label="۴۰ درصد" className="size-14">
        <span className={cx(disp, 'text-sm font-black')}>۴۰٪</span>
      </Ring>
      <Emblem option={option} icon="check" label="نمونهٔ نشان" className="size-12" />
      <span className={cx(ctaClass(option), 'min-h-11 px-4 text-sm')}>ادامه</span>
      <span className="rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-ink">رنگ تأکید</span>
      <span className="w-full text-xs text-muted">{BRANDS[brand].label}</span>
    </div>
  )
}

export default function PreviewIndex() {
  assertDev()
  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-10 md:px-8">
      <p className="text-sm font-bold text-muted">E-027 · مرحلهٔ ۳ از ۳ · فقط توسعه</p>
      <h1 className="mt-1 text-4xl font-black md:text-5xl">سه جهت بصری برای «پنل با روح»</h1>
      <p className="mt-3 max-w-prose leading-8 text-muted">
        هر گزینه روی رنگ تنانت سوار است (برند و تأکید از تنانت می‌آید). هر گزینه ۵ صفحه دارد و هر صفحه با پارامتر <span dir="ltr" className="font-latin">?brand=teal</span> یا{' '}
        <span dir="ltr" className="font-latin">wine</span> روی رنگ دیگری هم دیده می‌شود. حالت تیره از دکمهٔ تم هدر.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-10">
        {OPTION_IDS.map((id) => {
          const o = OPTIONS[id]
          return (
            <section key={id} data-e027-option={id} aria-labelledby={`o-${id}`} className="rounded-2xl border border-line bg-surface p-6 md:p-8">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-5">
                  <p className="font-latin text-sm font-bold uppercase tracking-widest text-muted">{o.nameEn}</p>
                  <h2 id={`o-${id}`} className={cx(disp, 'mt-1 text-5xl font-black')}>{o.nameFa}</h2>
                  <p className="mt-4 leading-8">{o.idea}</p>
                  <p className={cx(disp, 'mt-6 text-3xl font-black')}>۴۰٪ · ۱۲ از ۳۰ جلسه</p>
                  <p className="mt-1 text-sm text-muted">تیتر و عددها: {o.displayFace} · متن: وزیرمتن</p>
                </div>
                <dl className="grid min-w-0 grid-cols-1 gap-4 text-sm leading-7 lg:col-span-7">
                  <div><dt className="font-bold">رنگ‌ها روی تنانت</dt><dd className="text-muted">{ACCENTS[id].accents}</dd></div>
                  <div><dt className="font-bold">آیکن و تصویرسازی</dt><dd className="text-muted">{ACCENTS[id].icons}</dd></div>
                  <div><dt className="font-bold">حرکت</dt><dd className="text-muted">{o.motion}</dd></div>
                  <div><dt className="font-bold">مناسب برای</dt><dd className="text-muted">{o.bestFor}</dd></div>
                  <div><dt className="font-bold">ریسک</dt><dd className="text-muted">{o.risk}</dd></div>
                </dl>
              </div>

              <h3 className="mb-3 mt-8 text-sm font-bold text-muted">روی سه رنگ تنانت</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {(['blue', 'teal', 'wine'] as const).map((b) => (
                  <Specimen key={b} option={id} brand={b} />
                ))}
              </div>

              <h3 className="mb-3 mt-8 text-sm font-bold text-muted">صفحه‌ها</h3>
              <ul className="flex flex-wrap gap-2">
                {SCREENS.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/design-preview/e027/${id}/${s.id}`}
                      className={cx('inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 text-sm font-medium hover:bg-sunken', focusRing)}
                    >
                      {s.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={`/design-preview/e027/${id}/dashboard?brand=teal`}
                    className={cx('inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 text-sm font-medium hover:bg-sunken', focusRing)}
                  >
                    داشبورد روی سبزآبی
                  </Link>
                </li>
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
