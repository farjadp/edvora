import { cx, focusRing } from '@edvora/ui'
import Link from 'next/link'
import { GROUP_LABEL, SCREENS, type ScreenGroup } from '../_lib/data'
import { BRANDS, OPTIONS, OPTION_IDS, type BrandId, type OptionId } from '../_lib/options'

const pill = (active: boolean) =>
  cx('inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium', focusRing, active ? 'border-ink bg-ink text-bg' : 'border-line-strong bg-surface hover:bg-sunken')

/** Floating switcher (bottom start corner). Hidden in screenshots with ?chrome=0. */
export function PreviewBar({ option, screen, brand, qs }: { option: OptionId; screen: string; brand: BrandId; qs: (b?: BrandId) => string }) {
  const href = (o: OptionId, s: string, b: BrandId) => `/design-preview/e034/${o}/${s}${qs(b)}`
  const groups: ScreenGroup[] = ['student', 'staff', 'admin', 'shared']
  return (
    <details className="fixed bottom-3 start-3 z-50 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line-strong bg-surface text-ink shadow-lg">
      <summary className={cx('flex min-h-11 cursor-pointer items-center px-4 text-sm font-bold', focusRing)}>E-034 · پیش‌نمایش</summary>
      <div className="grid max-h-[70dvh] w-[min(34rem,calc(100vw-1.5rem))] gap-3 overflow-auto border-t border-line p-4">
        <p className="text-sm text-muted">فقط توسعه. همهٔ داده‌ها نمونه‌اند. <Link href="/design-preview/e034" className="font-bold text-ink underline underline-offset-4">فهرست</Link></p>
        <nav aria-label="گزینه‌ها" className="flex flex-wrap gap-2">
          {OPTION_IDS.map((o) => (
            <Link key={o} href={href(o, screen, brand)} aria-current={o === option ? 'page' : undefined} className={pill(o === option)}>
              {o.toUpperCase()} · {OPTIONS[o].nameFa}
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
        {groups.map((g) => (
          <nav key={g} aria-label={GROUP_LABEL[g]} className="grid gap-2">
            <p className="text-xs font-bold text-muted">{GROUP_LABEL[g]}</p>
            <ul className="flex flex-wrap gap-2">
              {SCREENS.filter((s) => s.group === g).map((s) => (
                <li key={s.id}>
                  <Link href={href(option, s.id, brand)} aria-current={s.id === screen ? 'page' : undefined} className={pill(s.id === screen)}>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </details>
  )
}
