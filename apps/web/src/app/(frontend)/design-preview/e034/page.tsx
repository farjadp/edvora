import { ThemeToggle, cx, focusRing } from '@edvora/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
import { GROUP_LABEL, SCREENS, type ScreenGroup } from './_lib/data'
import { OPTIONS, OPTION_IDS, assertDev } from './_lib/options'

export const metadata: Metadata = { title: 'E-034 · گزینه‌های ورود', robots: { index: false, follow: false } }

const chip = cx('inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 text-sm font-medium hover:bg-sunken', focusRing)

export default function PreviewIndex() {
  assertDev()
  const groups: ScreenGroup[] = ['student', 'staff', 'admin', 'shared']
  return (
    <div data-e034 className="mx-auto min-h-dvh max-w-7xl bg-bg px-4 pb-20 pt-8 text-ink md:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted">E-034 · ورود در جهت مُهر · فقط توسعه</p>
          <h1 className="mt-1 font-[family-name:var(--e-display)] text-4xl font-black md:text-5xl">سه گزینه برای صفحهٔ ورود</h1>
        </div>
        <ThemeToggle />
      </div>
      <p className="mt-4 max-w-prose leading-8 text-muted">
        همهٔ حالت‌های مشخصات (<span dir="ltr" className="font-latin">docs/ux/E-034-login.md</span>) برای هر گزینه ساخته شده‌اند. داده‌ها نمونه‌اند و هیچ‌چیز ذخیره نمی‌شود. روی هر صفحه می‌شود با{' '}
        <span dir="ltr" className="font-latin">?brand=teal</span> یا <span dir="ltr" className="font-latin">wine</span> رنگ تنانت را عوض کرد، با <span dir="ltr" className="font-latin">?name=</span> نام بلند آکادمی را آزمود و با{' '}
        <span dir="ltr" className="font-latin">?live=0</span> زمان‌سنج‌ها را ثابت کرد.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-8">
        {OPTION_IDS.map((id) => {
          const o = OPTIONS[id]
          return (
            <section key={id} aria-labelledby={`o-${id}`} className="border-t-2 border-ink pt-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="min-w-0">
                  <p className="font-latin text-sm font-bold uppercase tracking-widest text-muted">{id.toUpperCase()} · {o.nameEn}</p>
                  <h2 id={`o-${id}`} className="mt-1 font-[family-name:var(--e-display)] text-4xl font-black">{o.nameFa}</h2>
                  <p className="mt-3 leading-8">{o.idea}</p>
                  <p className="mt-3 text-sm leading-7 text-muted">ریسک: {o.risk}</p>
                  <p className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/design-preview/e034/${id}/s-phone`} className={chip}>ورود دانشجو</Link>
                    <Link href={`/design-preview/e034/${id}/t-empty`} className={chip}>ورود کارکنان</Link>
                    <Link href={`/design-preview/e034/${id}/s-phone?brand=teal`} className={chip}>سبزآبی</Link>
                    <Link href={`/design-preview/e034/${id}/s-phone?brand=wine`} className={chip}>عنابی</Link>
                  </p>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-4">
                  {groups.map((g) => (
                    <div key={g}>
                      <h3 className="mb-2 text-sm font-bold text-muted">{GROUP_LABEL[g]}</h3>
                      <ul className="flex flex-wrap gap-2">
                        {SCREENS.filter((s) => s.group === g).map((s) => (
                          <li key={s.id}>
                            <Link href={`/design-preview/e034/${id}/${s.id}`} className={chip}>
                              {s.label}
                              <span dir="ltr" className="ms-2 font-latin text-xs text-muted">{s.spec}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
