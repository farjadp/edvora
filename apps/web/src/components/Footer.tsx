import { toPersianDigits } from '@edvora/core'
import { SOCIAL_PLATFORMS } from '@edvora/core/settings'
import Link from 'next/link'
import type { Tenant } from '../payload-types'
import { getNavPages } from '../lib/queries'
import { siteSectionOn } from '../lib/tenant'

type PageRef = { slug?: string | null; title?: string | null } | number | null | undefined
const LEGAL = [
  ['terms', 'قوانین و مقررات'],
  ['privacy', 'حریم خصوصی'],
  ['refund', 'شرایط بازپرداخت'],
] as const

export async function Footer({ tenant }: { tenant: Tenant }) {
  const pages = await getNavPages(tenant.id)
  // E-047: legal pages and social links from the settings hub. Only https links are ever stored.
  const legal: { label: string; slug: string }[] = []
  for (const [k, label] of LEGAL) {
    const page = tenant.legal?.[k] as PageRef
    if (page && typeof page === 'object' && page.slug) legal.push({ label, slug: page.slug })
  }
  const social = (tenant.contact?.social ?? []).filter((s) => s.url.startsWith('https://'))
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-3 md:px-8">
        <div>
          <p className="text-xl font-black">{tenant.name}</p>
          {tenant.tagline ? <p className="mt-2 max-w-sm text-sm leading-7 text-muted">{tenant.tagline}</p> : null}
        </div>
        <div className="text-sm leading-8 text-muted">
          <p className="mb-2 font-bold text-ink">دسترسی سریع</p>
          <Link href="/#programs" className="block hover:text-ink">دوره‌ها</Link>
          {siteSectionOn(tenant, 'faculty') ? <Link href="/faculty" className="block hover:text-ink">اساتید</Link> : null}
          {siteSectionOn(tenant, 'journal') ? <Link href="/journal" className="block hover:text-ink">مجله</Link> : null}
          {pages.map((p) => (
            <Link key={p.id} href={`/${p.slug}`} className="block hover:text-ink">
              {p.title}
            </Link>
          ))}
          {siteSectionOn(tenant, 'verify') ? <Link href="/verify" className="block hover:text-ink">استعلام گواهی</Link> : null}
          <Link href="/login" className="block hover:text-ink">ورود دانشجویان</Link>
          {legal.map((l) => (
            <Link key={l.label} href={`/${l.slug}`} className="block hover:text-ink">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="text-sm leading-8 text-muted">
          <p className="mb-2 font-bold text-ink">تماس</p>
          {tenant.contact?.phone ? <p dir="ltr" className="text-end font-latin">{toPersianDigits(tenant.contact.phone)}</p> : null}
          {tenant.contact?.email ? <p dir="ltr" className="text-end font-latin">{tenant.contact.email}</p> : null}
          {tenant.contact?.address ? <p className="leading-7">{tenant.contact.address}</p> : null}
          {social.length ? (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="شبکه‌های اجتماعی">
              {social.map((s) => (
                <li key={s.id ?? s.url}>
                  <a href={s.url} rel="noopener noreferrer me" target="_blank" className="hover:text-ink">
                    {SOCIAL_PLATFORMS.find((p) => p.value === s.platform)?.fa ?? s.platform}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <p className="border-t border-line py-5 text-center text-xs text-muted">
        ساخته‌شده با <span className="font-latin font-bold">Edvora</span> · محصولی از <span className="font-latin">AshaVid</span>
      </p>
    </footer>
  )
}
