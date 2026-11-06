import { cx, focusRing } from '@edvora/ui'
import Link from 'next/link'
import { BRANDS, OPTIONS, OPTION_IDS, SCREENS, type BrandId, type OptionId, type ScreenId } from '../_lib/options'

const pill = (active: boolean) =>
  cx(
    'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium',
    focusRing,
    active ? 'border-ink bg-ink text-bg' : 'border-line-strong hover:bg-sunken',
  )

export function PreviewBar({ option, screen, brand }: { option: OptionId; screen: ScreenId; brand: BrandId }) {
  const href = (o: OptionId, s: ScreenId, b: BrandId) => `/design-preview/e027/${o}/${s}${b === 'tenant' ? '' : `?brand=${b}`}`
  return (
    <div className="border-b border-line bg-sunken">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:px-8">
        <p className="text-sm">
          <Link href="/design-preview/e027" className="font-bold underline underline-offset-4">E-027 · پیش‌نمایش طراحی</Link>
          <span className="text-muted"> — فقط برای توسعه. همهٔ داده‌ها نمونه‌اند.</span>
        </p>
        <nav aria-label="گزینه‌ها" className="flex flex-wrap gap-2">
          {OPTION_IDS.map((o) => (
            <Link key={o} href={href(o, screen, brand)} aria-current={o === option ? 'page' : undefined} className={pill(o === option)}>
              {OPTIONS[o].nameFa} · {OPTIONS[o].nameEn}
            </Link>
          ))}
        </nav>
        <nav aria-label="صفحه‌ها" className="flex flex-wrap gap-2">
          {SCREENS.map((s) => (
            <Link key={s.id} href={href(option, s.id, brand)} aria-current={s.id === screen ? 'page' : undefined} className={pill(s.id === screen)}>
              {s.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="رنگ تنانت" className="flex flex-wrap gap-2">
          {(Object.keys(BRANDS) as BrandId[]).map((b) => (
            <Link key={b} href={href(option, screen, b)} aria-current={b === brand ? 'page' : undefined} className={pill(b === brand)}>
              {BRANDS[b].label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
