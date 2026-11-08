import { sectionShown } from '@edvora/core/role-settings'
import { deskDef, meets, type DeskKey, type Requirement, type StaffPerms } from '@edvora/core/staff'
import type { ConsoleIconName, ShellNavGroup } from '@edvora/ui/console'

/**
 * The operator console's module map (E-035), one table for /staff and /admin.
 *  - `read` mirrors the collection's STAFF read rule (apps/web/src/collections/*, `access.read`), without the
 *    "own records" branch every signed-in user has on orders/enrolments/submissions. Keep the two in step.
 *  - /staff: a module goes to its desk page when it has one (shown when the desk's STAFF_DESKS access holds), else
 *    to the Payload list (marked external), shown when `read` holds. Default deny.
 *  - /admin: shown when Payload's `permissions.collections[slug].read` is true AND `read` holds for the person's
 *    memberships, so nobody gets a link to a list of nothing but their own purchases.
 * Both filters are cosmetic: access rules in the collections still decide what a request may do.
 *  - E-039 (ADR 016): a role may also hide whole groups (`experience.menuSections`, keys = group keys below). The
 *    person's own security / account link always stays.
 */
type Mod = {
  key: string
  label: string
  icon: ConsoleIconName
  /** Payload collection slug (the /admin list). */
  slug?: string
  /** Staff desk page that replaces the Payload list inside /staff. */
  desk?: DeskKey
  /** Staff read rule of the collection (see above). Required whenever `slug` is set. */
  read?: Requirement
  /** A custom staff page (not a desk) that both consoles link to instead of the Payload list, e.g. /staff/import. */
  page?: string
}
type Group = { key: string; label: string; items: Mod[] }

const any = (...k: string[]): Requirement => ({ any: k })

export const CONSOLE_GROUPS: Group[] = [
  { key: 'dashboard', label: 'داشبورد', items: [{ key: 'overview', label: 'نمای کلی', icon: 'dashboard', desk: 'overview' }] },
  {
    key: 'crm',
    label: 'مشتریان',
    items: [
      { key: 'leads', label: 'مشتریان بالقوه', icon: 'leads', slug: 'leads', desk: 'leads', read: any('leads.view') },
      { key: 'support', label: 'پشتیبانی', icon: 'support', desk: 'support' },
    ],
  },
  {
    key: 'sales',
    label: 'فروش',
    items: [
      { key: 'orders', label: 'سفارش‌ها و اقساط', icon: 'orders', slug: 'orders', desk: 'finance', read: any('orders.view') },
      { key: 'coupons', label: 'کدهای تخفیف', icon: 'coupon', slug: 'coupons', read: any('coupons.manage') },
      // E-045 (ADR 017). Payments: desk for the daily queue; the Payload list is read-only history.
      { key: 'payments', label: 'پرداخت‌ها', icon: 'card', slug: 'payments', read: any('orders.view') },
      { key: 'payment-methods', label: 'روش‌های پرداخت', icon: 'settings', slug: 'payment-methods', read: any('payments.settings') },
    ],
  },
  {
    key: 'learning',
    label: 'آموزش',
    items: [
      { key: 'courses', label: 'دوره‌ها', icon: 'course', slug: 'courses', read: any('courses.view', 'courses.edit', 'courses.publish', 'pricing.edit') },
      { key: 'lessons', label: 'جلسات', icon: 'lesson', slug: 'lessons', read: any('lessons.edit', 'courses.view') },
      { key: 'cohorts', label: 'دوره‌های برگزاری', icon: 'cohort', slug: 'cohorts', read: any('cohorts.manage', 'courses.view') },
      { key: 'quizzes', label: 'آزمون‌ها', icon: 'quiz', slug: 'quizzes', read: any('quizzes.manage', 'courses.view', 'enrollments.view') },
      { key: 'questions', label: 'بانک سؤال', icon: 'question', slug: 'questions', read: any('quizzes.manage', 'courses.view') },
      { key: 'assignments', label: 'تکالیف', icon: 'assignment', slug: 'assignments', read: any('assignments.manage', 'submissions.grade', 'courses.view') },
      { key: 'submissions', label: 'تحویل تکالیف و نمره‌دهی', icon: 'grading', slug: 'submissions', desk: 'teaching', read: any('submissions.grade') },
      { key: 'quiz-attempts', label: 'نتایج آزمون‌ها', icon: 'chart', slug: 'quiz-attempts', read: any('enrollments.view', 'quizzes.manage') },
      { key: 'live-sessions', label: 'کلاس‌های زنده', icon: 'live', slug: 'live-sessions', read: any('live.host', 'cohorts.manage', 'enrollments.view') },
      { key: 'attendance', label: 'حضور و غیاب', icon: 'check', slug: 'attendance', read: any('live.host', 'enrollments.view') },
    ],
  },
  {
    key: 'students',
    label: 'دانشجویان',
    items: [
      { key: 'users', label: 'دانشجویان و کاربران', icon: 'users', slug: 'users', desk: 'students', read: any('users.view') },
      { key: 'enrollments', label: 'ثبت‌نام‌ها', icon: 'enrol', slug: 'enrollments', read: any('enrollments.view', 'enrollments.manage') },
      { key: 'certificates', label: 'گواهی‌ها', icon: 'certificate', slug: 'certificates', read: any('certificates.view', 'certificates.issue', 'certificates.revoke') },
      { key: 'learning-events', label: 'دفتر امتیازها', icon: 'trophy', slug: 'learning-events', read: any('enrollments.view') },
    ],
  },
  {
    key: 'content',
    label: 'محتوا',
    items: [
      { key: 'posts', label: 'مجله', icon: 'post', slug: 'posts', desk: 'content', read: any('content.edit', 'content.publish') },
      { key: 'testimonials', label: 'روایت دانش‌آموختگان', icon: 'star', slug: 'testimonials', read: any('content.edit', 'content.publish') },
      { key: 'pages', label: 'صفحه‌ها', icon: 'site', slug: 'pages', read: any('content.edit') },
      { key: 'redirects', label: 'تغییر مسیر نشانی‌ها', icon: 'external', slug: 'redirects', read: any('content.edit') },
      { key: 'media', label: 'رسانه', icon: 'media', slug: 'media', read: any('media.upload', 'content.edit') },
    ],
  },
  {
    key: 'settings',
    label: 'تنظیمات',
    items: [
      { key: 'tenants', label: 'آکادمی‌ها', icon: 'building', slug: 'tenants', read: any('settings.edit') },
      { key: 'roles', label: 'نقش‌ها', icon: 'roles', slug: 'roles', read: any('roles.view', 'roles.assign', 'roles.manage') },
      { key: 'memberships', label: 'عضویت‌ها و دسترسی‌ها', icon: 'membership', slug: 'memberships', read: any('roles.view', 'roles.assign', 'users.view') },
      { key: 'audit-logs', label: 'گزارش ممیزی', icon: 'audit', slug: 'audit-logs', read: any('audit.view') },
      { key: 'import', label: 'انتقال از وردپرس', icon: 'download', slug: 'import-jobs', read: any('import.view'), page: '/staff/import' },
    ],
  },
]

const adminHref = (m: Mod) => (m.slug ? `/admin/collections/${m.slug}` : '/admin')

/** /staff: permission-filtered groups; the last group always ends with the person's own security page. */
export function staffConsoleNav(who: StaffPerms): ShellNavGroup[] {
  const groups: ShellNavGroup[] = []
  for (const g of CONSOLE_GROUPS) {
    if (!sectionShown(who.experience, g.key)) continue
    const items = g.items
      .filter((m) => (m.desk ? meets(who, deskDef(m.desk).access) : m.read ? meets(who, m.read) : false))
      .map((m) => ({ key: m.key, label: m.label, icon: m.icon, href: m.desk ? deskDef(m.desk).href : (m.page ?? adminHref(m)), external: !m.desk && !m.page }))
    if (g.key === 'settings') items.push({ key: 'security', label: 'امنیت حساب', icon: 'shield', href: '/staff/security', external: false })
    if (items.length) groups.push({ key: g.key, label: g.label, items })
  }
  if (!sectionShown(who.experience, 'settings')) groups.push({ key: 'account', label: 'حساب', items: [{ key: 'security', label: 'امنیت حساب', icon: 'shield', href: '/staff/security', external: false }] })
  return groups
}

/** /admin: Payload's `read` permission AND the person's staff read rule. Desk-only modules (no list) are left out. */
export function adminConsoleNav(canRead: (slug: string) => boolean, who: StaffPerms): ShellNavGroup[] {
  const groups: ShellNavGroup[] = []
  for (const g of CONSOLE_GROUPS) {
    if (!sectionShown(who.experience, g.key)) continue
    const items = g.items
      .filter((m) => Boolean(m.slug && m.read && canRead(m.slug) && meets(who, m.read)))
      .map((m) => ({ key: m.key, label: m.label, icon: m.icon, href: m.page ?? adminHref(m), external: Boolean(m.page) }))
    if (g.key === 'dashboard') {
      items.unshift({ key: 'overview', label: 'داشبورد', icon: 'dashboard', href: '/admin', external: false })
      items.push({ key: 'desk', label: 'میز کار کارکنان', icon: 'desk', href: '/staff', external: true })
    }
    if (g.key === 'settings') items.push({ key: 'account', label: 'حساب من و امنیت', icon: 'shield', href: '/admin/account', external: false })
    if (items.length) groups.push({ key: g.key, label: g.label, items })
  }
  if (!sectionShown(who.experience, 'settings')) groups.push({ key: 'account', label: 'حساب', items: [{ key: 'account', label: 'حساب من و امنیت', icon: 'shield', href: '/admin/account', external: false }] })
  return groups
}

/**
 * Payload's sanitized permission for one collection operation. An access function that returned a Where query
 * arrives as `{ permission: true, where }` (not `true`), so an `=== true` check hides every scoped collection from
 * academy staff. Same truthiness Payload's own nav uses; the where query still filters the list itself.
 */
export function payloadAllows(permissions: unknown, slug: string, op: 'read' | 'create' | 'update' | 'delete' = 'read'): boolean {
  const v = (permissions as { collections?: Record<string, Record<string, unknown> | undefined> } | null | undefined)?.collections?.[slug]?.[op]
  if (v === true) return true
  return typeof v === 'object' && v !== null && (v as { permission?: unknown }).permission === true
}
