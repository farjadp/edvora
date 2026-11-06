import { toPersianDigits } from '@edvora/core/digits'
import Link from 'next/link'
import type { CollectionSlug, ServerProps, Where } from 'payload'
import { getAdminTenantContext } from '../../lib/adminTenant'

/**
 * Admin landing (E-031): a greeting, a few counts and quick links, above Payload's own collection directory.
 * Everything is permission-driven and read-only: a count or link appears only when Payload's permission data
 * for this user says `read` (resp. `create`) is allowed, and counts run with `overrideAccess: false` so the
 * collection's own access rules apply. Counts are scoped to the academy selected in the nav, if any.
 */

type Lang = 'fa' | 'en'
type Text = Record<Lang, string>

const T = {
  hello: { fa: 'سلام', en: 'Hello' },
  scopeAll: { fa: 'همهٔ آکادمی‌هایی که به آن‌ها دسترسی دارید', en: 'All academies you can access' },
  today: { fa: 'یک نگاه سریع', en: 'At a glance' },
  quick: { fa: 'میان‌بُرها', en: 'Quick links' },
  all: { fa: 'همهٔ بخش‌ها', en: 'Everything' },
  empty: { fa: 'برای حساب شما هنوز بخشی فعال نشده است. با مدیر آکادمی تماس بگیرید.', en: 'No sections are enabled for your account yet. Ask your academy admin.' },
} as const satisfies Record<string, Text>

type Stat = { slug: CollectionSlug; label: Text; where?: Where; filter?: string }
const STATS: Stat[] = [
  { slug: 'courses', label: { fa: 'دورهٔ منتشرشده', en: 'Published courses' }, where: { status: { equals: 'published' } }, filter: 'where[status][equals]=published' },
  { slug: 'leads', label: { fa: 'سرنخ جدید', en: 'New leads' }, where: { status: { equals: 'new' } }, filter: 'where[status][equals]=new' },
  { slug: 'enrollments', label: { fa: 'ثبت‌نام فعال', en: 'Active enrolments' }, where: { status: { equals: 'active' } }, filter: 'where[status][equals]=active' },
  { slug: 'submissions', label: { fa: 'تکلیف در انتظار نمره', en: 'Submissions to grade' }, where: { status: { equals: 'submitted' } }, filter: 'where[status][equals]=submitted' },
]

type Link_ = { slug: CollectionSlug; label: Text; create?: Text }
const LINKS: Link_[] = [
  { slug: 'courses', label: { fa: 'دوره‌ها', en: 'Courses' }, create: { fa: 'دورهٔ تازه', en: 'New course' } },
  { slug: 'leads', label: { fa: 'سرنخ‌ها', en: 'Leads' } },
  { slug: 'orders', label: { fa: 'سفارش‌ها', en: 'Orders' } },
  { slug: 'submissions', label: { fa: 'تحویل تکالیف', en: 'Submissions' } },
  { slug: 'posts', label: { fa: 'مجله', en: 'Posts' }, create: { fa: 'مقالهٔ تازه', en: 'New post' } },
  { slug: 'users', label: { fa: 'کاربران', en: 'Users' }, create: { fa: 'کاربر تازه', en: 'New user' } },
  { slug: 'memberships', label: { fa: 'عضویت‌ها', en: 'Memberships' } },
  { slug: 'tenants', label: { fa: 'آکادمی‌ها', en: 'Academies' } },
]

export async function DashboardHome({ payload, permissions, i18n }: ServerProps) {
  const lang: Lang = i18n?.language === 'en' ? 'en' : 'fa'
  const fa = lang === 'fa'
  const { user, tenant } = await getAdminTenantContext(payload)
  if (!user) return null

  const adminRoute = payload.config.routes.admin
  const can = (slug: string, action: 'read' | 'create') => permissions?.collections?.[slug]?.[action] === true
  const num = (n: number) => (fa ? toPersianDigits(String(n)) : String(n))

  const counted = await Promise.all(
    STATS.filter((s) => can(s.slug, 'read')).map(async (s) => {
      // Tenants are not counted here; every stat collection is tenant-owned, so scope by the selected academy.
      const where: Where = { and: [...(s.where ? [s.where] : []), ...(tenant ? [{ tenant: { equals: tenant.id } }] : [])] }
      try {
        const { totalDocs } = await payload.count({ collection: s.slug, where, user, overrideAccess: false })
        return { ...s, total: totalDocs }
      } catch {
        return null
      }
    }),
  )
  const stats = counted.filter((s): s is NonNullable<typeof s> => s !== null)
  const links = LINKS.filter((l) => can(l.slug, 'read'))
  const name = (user as { name?: string | null }).name?.trim() || user.email

  return (
    <section className="ed-dash" aria-labelledby="ed-dash-title">
      <header className="ed-dash__head">
        <p className="ed-dash__eyebrow">{tenant ? tenant.name : T.scopeAll[lang]}</p>
        <h1 id="ed-dash-title" className="ed-dash__title">
          {T.hello[lang]}، {name}
        </h1>
      </header>

      {stats.length > 0 && (
        <div className="ed-dash__block">
          <h2 className="ed-dash__label">{T.today[lang]}</h2>
          <ul className="ed-dash__stats">
            {stats.map((s) => (
              <li key={s.slug} className="ed-dash__stat">
                <Link className="ed-dash__stat-link" href={`${adminRoute}/collections/${s.slug}${s.filter ? `?${s.filter}` : ''}`}>
                  <span className="ed-dash__num">{num(s.total)}</span>
                  <span className="ed-dash__stat-label">{s.label[lang]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ed-dash__block">
        <h2 className="ed-dash__label">{T.quick[lang]}</h2>
        {links.length === 0 ? (
          <p className="ed-dash__empty">{T.empty[lang]}</p>
        ) : (
          <ul className="ed-dash__links">
            {links.map((l) => (
              <li key={l.slug} className="ed-dash__link-row">
                <Link className="ed-dash__link" href={`${adminRoute}/collections/${l.slug}`}>
                  {l.label[lang]}
                </Link>
                {l.create && can(l.slug, 'create') && (
                  <Link className="ed-dash__create" href={`${adminRoute}/collections/${l.slug}/create`}>
                    <span aria-hidden="true">+</span> {l.create[lang]}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="ed-dash__label ed-dash__label--all">{T.all[lang]}</h2>
    </section>
  )
}
