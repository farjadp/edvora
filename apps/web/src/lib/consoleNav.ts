import { deskDef, meets, type DeskKey, type Requirement, type StaffPerms } from '@edvora/core/staff'
import type { ConsoleIconName, ShellNavGroup } from '@edvora/ui/console'

/**
 * The operator console's module map (E-035), one table for /staff and /admin.
 *  - /staff: a module goes to its desk page when it has one, else to the Payload list (marked external). It is shown
 *    when the person holds the desk's permission (STAFF_DESKS) or the module's own `needs` (default deny).
 *  - /admin: a module is shown when Payload's permission data says `read` is allowed for its collection.
 * Both filters are cosmetic: access rules in the collections still decide what a request may do.
 */
type Mod = {
  key: string
  label: string
  icon: ConsoleIconName
  /** Payload collection slug (the /admin list). */
  slug?: string
  /** Staff desk page that replaces the Payload list inside /staff. */
  desk?: DeskKey
  /** Staff visibility when there is no desk. */
  needs?: Requirement
}
type Group = { key: string; label: string; items: Mod[] }

const any = (...k: string[]): Requirement => ({ any: k })

export const CONSOLE_GROUPS: Group[] = [
  { key: 'dashboard', label: 'داشبورد', items: [{ key: 'overview', label: 'نمای کلی', icon: 'dashboard', desk: 'overview' }] },
  {
    key: 'crm',
    label: 'مشتریان',
    items: [
      { key: 'leads', label: 'مشتریان بالقوه', icon: 'leads', slug: 'leads', desk: 'leads' },
      { key: 'support', label: 'پشتیبانی', icon: 'support', desk: 'support' },
    ],
  },
  {
    key: 'sales',
    label: 'فروش',
    items: [
      { key: 'orders', label: 'سفارش‌ها و اقساط', icon: 'orders', slug: 'orders', desk: 'finance' },
      { key: 'coupons', label: 'کدهای تخفیف', icon: 'coupon', slug: 'coupons', needs: any('coupons.manage') },
    ],
  },
  {
    key: 'learning',
    label: 'آموزش',
    items: [
      { key: 'courses', label: 'دوره‌ها', icon: 'course', slug: 'courses', needs: any('courses.view', 'courses.edit', 'courses.publish') },
      { key: 'lessons', label: 'جلسات', icon: 'lesson', slug: 'lessons', needs: any('lessons.edit', 'courses.view') },
      { key: 'cohorts', label: 'دوره‌های برگزاری', icon: 'cohort', slug: 'cohorts', needs: any('cohorts.manage', 'courses.view') },
      { key: 'quizzes', label: 'آزمون‌ها', icon: 'quiz', slug: 'quizzes', needs: any('quizzes.manage', 'courses.view') },
      { key: 'questions', label: 'بانک سؤال', icon: 'question', slug: 'questions', needs: any('quizzes.manage', 'courses.view') },
      { key: 'assignments', label: 'تکالیف', icon: 'assignment', slug: 'assignments', needs: any('assignments.manage', 'submissions.grade') },
      { key: 'submissions', label: 'تحویل تکالیف و نمره‌دهی', icon: 'grading', slug: 'submissions', desk: 'teaching' },
      { key: 'quiz-attempts', label: 'نتایج آزمون‌ها', icon: 'chart', slug: 'quiz-attempts', needs: any('enrollments.view', 'quizzes.manage') },
    ],
  },
  {
    key: 'students',
    label: 'دانشجویان',
    items: [
      { key: 'users', label: 'دانشجویان و کاربران', icon: 'users', slug: 'users', desk: 'students' },
      { key: 'enrollments', label: 'ثبت‌نام‌ها', icon: 'enrol', slug: 'enrollments', needs: any('enrollments.view', 'enrollments.manage') },
      { key: 'certificates', label: 'گواهی‌ها', icon: 'certificate', slug: 'certificates', needs: any('certificates.view', 'certificates.issue', 'certificates.revoke') },
      { key: 'learning-events', label: 'دفتر امتیازها', icon: 'trophy', slug: 'learning-events', needs: any('enrollments.view') },
    ],
  },
  {
    key: 'content',
    label: 'محتوا',
    items: [
      { key: 'posts', label: 'مجله', icon: 'post', slug: 'posts', desk: 'content' },
      { key: 'testimonials', label: 'روایت دانش‌آموختگان', icon: 'star', slug: 'testimonials', needs: any('content.edit') },
      { key: 'media', label: 'رسانه', icon: 'media', slug: 'media', needs: any('media.upload') },
    ],
  },
  {
    key: 'settings',
    label: 'تنظیمات',
    items: [
      { key: 'tenants', label: 'آکادمی‌ها', icon: 'building', slug: 'tenants', needs: any('settings.edit') },
      { key: 'roles', label: 'نقش‌ها', icon: 'roles', slug: 'roles', needs: any('roles.view', 'roles.assign', 'roles.manage') },
      { key: 'memberships', label: 'عضویت‌ها و دسترسی‌ها', icon: 'membership', slug: 'memberships', needs: any('roles.view', 'roles.assign', 'users.view') },
      { key: 'audit-logs', label: 'گزارش ممیزی', icon: 'audit', slug: 'audit-logs', needs: any('audit.view') },
    ],
  },
]

const adminHref = (m: Mod) => (m.slug ? `/admin/collections/${m.slug}` : '/admin')

/** /staff: permission-filtered groups; the last group always ends with the person's own security page. */
export function staffConsoleNav(who: StaffPerms): ShellNavGroup[] {
  const groups: ShellNavGroup[] = []
  for (const g of CONSOLE_GROUPS) {
    const items = g.items
      .filter((m) => (m.desk ? meets(who, deskDef(m.desk).access) : m.needs ? meets(who, m.needs) : false))
      .map((m) => ({ key: m.key, label: m.label, icon: m.icon, href: m.desk ? deskDef(m.desk).href : adminHref(m), external: !m.desk }))
    if (g.key === 'settings') items.push({ key: 'security', label: 'امنیت حساب', icon: 'shield', href: '/staff/security', external: false })
    if (items.length) groups.push({ key: g.key, label: g.label, items })
  }
  return groups
}

/** /admin: Payload's `permissions.collections[slug].read` decides. Desk-only modules link to /staff. */
export function adminConsoleNav(canRead: (slug: string) => boolean): ShellNavGroup[] {
  const groups: ShellNavGroup[] = []
  for (const g of CONSOLE_GROUPS) {
    const items = g.items
      .filter((m) => (m.slug ? canRead(m.slug) : false))
      .map((m) => ({ key: m.key, label: m.label, icon: m.icon, href: adminHref(m), external: false }))
    if (g.key === 'dashboard') {
      items.unshift({ key: 'overview', label: 'داشبورد', icon: 'dashboard', href: '/admin', external: false })
      items.push({ key: 'desk', label: 'میز کار کارکنان', icon: 'desk', href: '/staff', external: true })
    }
    if (g.key === 'settings') items.push({ key: 'account', label: 'حساب من و امنیت', icon: 'shield', href: '/admin/account', external: false })
    if (items.length) groups.push({ key: g.key, label: g.label, items })
  }
  return groups
}
