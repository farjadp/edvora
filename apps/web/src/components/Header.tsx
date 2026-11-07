import { ThemeToggle } from '@edvora/ui'
import Link from 'next/link'
import type { Media, Tenant } from '../payload-types'
import { getNavPages } from '../lib/queries'
import { getCurrentUser } from '../lib/session'

export async function Header({ tenant }: { tenant: Tenant }) {
  const [user, pages] = await Promise.all([getCurrentUser(), getNavPages(tenant.id)])
  const logo = typeof tenant.logo === 'object' ? (tenant.logo as Media | null) : null

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-8">
        <Link href="/" className="flex items-center gap-3 font-black tracking-tight">
          {logo?.url ? (
            <img src={logo.url} alt={logo.alt} className="h-9 w-auto" />
          ) : (
            <span className="grid size-9 place-items-center rounded-lg bg-brand text-sm text-brand-ink">{tenant.name.slice(0, 1)}</span>
          )}
          <span className="hidden text-lg sm:inline">{tenant.name}</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          <Link href="/#programs" className="hover:text-ink">دوره‌ها</Link>
          <Link href="/faculty" className="hover:text-ink">اساتید</Link>
          <Link href="/journal" className="hover:text-ink">مجله</Link>
          {pages.map((p) => (
            <Link key={p.id} href={`/${p.slug}`} className="hover:text-ink">
              {p.title}
            </Link>
          ))}
          <Link href="/verify" className="hover:text-ink">استعلام گواهی</Link>
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Link href="/dashboard" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg hover:opacity-90">
              پنل من
            </Link>
          ) : (
            <Link href="/login" className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg hover:opacity-90">
              ورود / ثبت‌نام
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
