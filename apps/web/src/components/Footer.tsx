import { toPersianDigits } from '@edvora/core'
import Link from 'next/link'
import type { Tenant } from '../payload-types'

export function Footer({ tenant }: { tenant: Tenant }) {
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
          <Link href="/verify" className="block hover:text-ink">استعلام گواهی</Link>
          <Link href="/login" className="block hover:text-ink">ورود دانشجویان</Link>
        </div>
        <div className="text-sm leading-8 text-muted">
          <p className="mb-2 font-bold text-ink">تماس</p>
          {tenant.contact?.phone ? <p dir="ltr" className="text-end font-latin">{toPersianDigits(tenant.contact.phone)}</p> : null}
          {tenant.contact?.email ? <p dir="ltr" className="text-end font-latin">{tenant.contact.email}</p> : null}
        </div>
      </div>
      <p className="border-t border-line py-5 text-center text-xs text-muted">
        ساخته‌شده با <span className="font-latin font-bold">Edvora</span> · محصولی از <span className="font-latin">AshaVid</span>
      </p>
    </footer>
  )
}
