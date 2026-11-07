import type { KpiCardProps } from '@edvora/ui/console'
import type { CollectionSlug, ServerProps, Where } from 'payload'
import { meets, type Requirement } from '@edvora/core/staff'
import { getAdminConsoleContext } from '../../lib/adminTenant'
import { count, deltaOf, fa, sparkLabel, trend, type DataCtx } from '../../lib/consoleData'
import { Kpis } from './console'

/**
 * KPI strip above key lists (E-035, Payload `beforeListTable`). Counts are real and scoped to the academy picked in
 * the nav (else the scope from `getAdminConsoleContext`); they run as the signed-in user, so access rules apply. A
 * count the user may not read is simply left out.
 */
type Spec = {
  slug: 'courses' | 'leads' | 'orders' | 'enrollments' | 'submissions'
  total: string
  counts: { label: string; icon: KpiCardProps['icon']; where: Where }[]
  trend?: { label: string; collection?: 'leads' | 'orders' | 'enrollments' | 'submissions' }
}

const SPECS: Record<Spec['slug'], Spec> = {
  courses: { slug: 'courses', total: 'همهٔ دوره‌ها', counts: [{ label: 'منتشرشده', icon: 'check', where: { status: { equals: 'published' } } }, { label: 'پیش‌نویس', icon: 'lesson', where: { status: { equals: 'draft' } } }] },
  leads: {
    slug: 'leads',
    total: 'همهٔ سرنخ‌ها',
    counts: [
      { label: 'جدید', icon: 'star', where: { status: { equals: 'new' } } },
      { label: 'ثبت‌نام‌شده', icon: 'check', where: { status: { equals: 'enrolled' } } },
    ],
    trend: { label: 'سرنخ تازه' },
  },
  orders: {
    slug: 'orders',
    total: 'همهٔ سفارش‌ها',
    counts: [
      { label: 'پرداخت‌شده', icon: 'check', where: { status: { equals: 'paid' } } },
      { label: 'در انتظار یا اقساط', icon: 'clock', where: { status: { in: ['pending', 'partially_paid'] } } },
    ],
    trend: { label: 'سفارش تازه' },
  },
  enrollments: {
    slug: 'enrollments',
    total: 'همهٔ ثبت‌نام‌ها',
    counts: [
      { label: 'فعال', icon: 'student', where: { status: { equals: 'active' } } },
      { label: 'تکمیل‌شده', icon: 'check', where: { status: { equals: 'completed' } } },
    ],
    trend: { label: 'ثبت‌نام تازه' },
  },
  submissions: {
    slug: 'submissions',
    total: 'همهٔ تحویل‌ها',
    counts: [
      { label: 'در انتظار نمره', icon: 'grading', where: { status: { equals: 'submitted' } } },
      { label: 'نمره‌داده‌شده', icon: 'check', where: { status: { equals: 'graded' } } },
    ],
    trend: { label: 'تحویل تازه' },
  },
}

const STRIP_NEEDS: Record<Spec['slug'], Requirement> = {
  courses: { any: ['courses.view', 'courses.edit', 'courses.publish', 'pricing.edit'] },
  leads: { any: ['leads.view'] },
  orders: { any: ['orders.view'] },
  enrollments: { any: ['enrollments.view', 'enrollments.manage'] },
  submissions: { any: ['submissions.grade'] },
}

const ICON: Record<Spec['slug'], KpiCardProps['icon']> = { courses: 'course', leads: 'leads', orders: 'orders', enrollments: 'enrol', submissions: 'assignment' }

export async function ListKpis({ payload, collectionSlug }: ServerProps & { collectionSlug?: string }) {
  const spec = collectionSlug ? SPECS[collectionSlug as Spec['slug']] : undefined
  if (!spec) return null
  const ctx = await getAdminConsoleContext(payload)
  if (!ctx) return null
  // Lists Payload also opens for one's OWN records (orders, enrolments, submissions): no strip without the staff
  // permission, so it never reads as academy numbers.
  if (!meets(ctx.who, STRIP_NEEDS[spec.slug])) return null
  const c: DataCtx = { payload, user: ctx.user, scope: ctx.scope, req: ctx.req }
  const slug = spec.slug as CollectionSlug
  const tc = spec.trend && spec.slug !== 'courses' ? spec.slug : null
  const [total, ...rest] = await Promise.all([count(c, slug), ...spec.counts.map((x) => count(c, slug, x.where)), tc ? trend(c, tc) : null])
  if (total === null) return null
  const tr = rest[rest.length - 1] as Awaited<ReturnType<typeof trend>>
  const items: KpiCardProps[] = [{ label: spec.total, value: fa(total), icon: ICON[spec.slug] }]
  spec.counts.forEach((x, i) => {
    const n = rest[i] as number | null
    if (n !== null) items.push({ label: x.label, value: fa(n), icon: x.icon, progress: total ? { pct: (n / total) * 100, text: `${fa(Math.round((n / total) * 100))}٪ از همه`, tone: 'brand' } : undefined })
  })
  if (spec.trend && tr && spec.slug !== 'courses') {
    items.push({ label: `${spec.trend.label} (۳۰ روز)`, value: fa(tr.current), icon: 'trendUp', delta: deltaOf(tr.current, tr.previous), spark: { values: tr.spark, label: sparkLabel(spec.trend.label) } })
  }
  return <Kpis items={items} />
}
