import type { Metadata } from 'next'
import Link from 'next/link'
import type { Media } from '../../../payload-types'
import { getPublishedCourses } from '../../../lib/queries'
import { getCurrentTenant } from '../../../lib/tenant'

export const metadata: Metadata = { title: 'اساتید' }

/** Faculty = everyone listed on a published course, merged by name (no separate collection yet). */
export default async function FacultyPage() {
  const tenant = await getCurrentTenant()
  const courses = await getPublishedCourses(tenant.id)
  const people = new Map<string, { name: string; role: string | null; photo: Media | null; courses: { slug: string; title: string }[] }>()
  for (const c of courses) {
    for (const f of c.faculty ?? []) {
      const key = f.name.replace(/[\s‌]/g, '')
      const photo = typeof f.photo === 'object' ? (f.photo as Media | null) : null
      const p = people.get(key) ?? { name: f.name, role: f.role ?? null, photo, courses: [] }
      if (!p.photo && photo) p.photo = photo
      if (!p.role && f.role) p.role = f.role
      p.courses.push({ slug: c.slug, title: c.title })
      people.set(key, p)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 md:px-8">
      <h1 className="text-3xl font-black md:text-4xl">اساتید</h1>
      <p className="mt-3 max-w-2xl leading-8 text-muted">اساتید و مدرسان دوره‌های {tenant.name}</p>
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[...people.values()].map((p) => {
          const src = p.photo?.sizes?.card?.url ?? p.photo?.url
          return (
            <div key={p.name} className="rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-center gap-4">
                {src ? (
                  <img src={p.photo?.url ?? src} alt={p.photo?.alt ?? p.name} className="size-20 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid size-20 shrink-0 place-items-center rounded-full bg-sunken text-2xl font-black text-brand">{p.name.slice(0, 1)}</span>
                )}
                <h2 className="text-lg font-bold">{p.name}</h2>
              </div>
              {p.role ? <p className="mt-4 text-sm leading-7 text-muted">{p.role}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {p.courses.map((c) => (
                  <Link key={c.slug} href={`/courses/${c.slug}`} className="rounded-full bg-sunken px-3 py-1 text-xs font-medium hover:text-brand">
                    {c.title}
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
