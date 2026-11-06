import { formatJalali } from '@edvora/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { Media } from '../../../payload-types'
import { getPosts } from '../../../lib/queries'
import { getCurrentTenant } from '../../../lib/tenant'

export const metadata: Metadata = { title: 'مجله' }

export default async function JournalPage() {
  const tenant = await getCurrentTenant()
  const posts = await getPosts(tenant.id, 100)

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 md:px-8">
      <h1 className="text-3xl font-black md:text-4xl">مجله</h1>
      <p className="mt-3 max-w-2xl leading-8 text-muted">نوشته‌ها، اخبار و یادداشت‌های {tenant.name}</p>
      {posts.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-line bg-surface p-8 text-muted">هنوز نوشته‌ای منتشر نشده است.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => {
            const cover = typeof p.cover === 'object' ? (p.cover as Media | null) : null
            const src = cover?.sizes?.card?.url ?? cover?.url
            return (
              <Link key={p.id} href={`/journal/${encodeURIComponent(p.slug)}`} className="group overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="aspect-video overflow-hidden bg-sunken">
                  {src ? <img src={src} alt={cover?.alt ?? ''} className="size-full object-cover motion-safe:transition-transform motion-safe:group-hover:scale-105" /> : null}
                </div>
                <div className="p-5">
                  <h2 className="font-bold leading-7 group-hover:text-brand">{p.title}</h2>
                  {p.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{p.excerpt}</p> : null}
                  <p className="mt-4 text-xs text-muted">
                    {[p.author, p.publishedAt ? formatJalali(p.publishedAt) : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
