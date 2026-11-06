/**
 * Permission catalog (ADR 006, Notion 11 §3.1). Defined in code, never by users.
 * Keys are `module.action[.own|.all]`. Holding `x.all` implies `x.own`.
 * The catalog grows when a module is built; access checks only ever read these keys.
 */

export const PERMISSION_GROUPS = {
  users: ['users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export'],
  roles: ['roles.view', 'roles.manage', 'roles.assign'],
  catalog: ['courses.view', 'courses.edit', 'courses.publish', 'cohorts.manage', 'lessons.edit', 'pricing.edit'],
  sales: ['leads.view.own', 'leads.view.all', 'leads.create', 'leads.assign', 'leads.export', 'orders.create_for_lead', 'discount.give'],
  finance: [
    'orders.view',
    'orders.edit',
    'payments.manual.record',
    'payments.manual.approve',
    'refunds.request',
    'refunds.approve',
    'coupons.manage',
    'finance.export',
  ],
  learning: ['enrollments.view', 'enrollments.manage', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score'],
  certificates: ['certificates.view', 'certificates.issue', 'certificates.revoke'],
  content: ['content.edit', 'content.publish', 'media.upload'],
  support: ['tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign'],
  messaging: ['sms.send_single', 'sms.broadcast', 'templates.edit'],
  reports: ['reports.sales', 'reports.finance', 'reports.learning'],
  academy: ['settings.edit', 'audit.view'],
  /** Edvora staff only. Never grantable inside an academy. */
  platform: ['tenants.manage', 'tenants.credentials', 'impersonate'],
} as const

type Groups = typeof PERMISSION_GROUPS
export type PermissionGroup = keyof Groups
export type Permission = Groups[PermissionGroup][number]
export type PlatformPermission = Groups['platform'][number]
export type AcademyPermission = Exclude<Permission, PlatformPermission>

export const PERMISSIONS: readonly Permission[] = Object.values(PERMISSION_GROUPS).flat()
export const PLATFORM_PERMISSIONS: readonly PlatformPermission[] = PERMISSION_GROUPS.platform
export const ACADEMY_PERMISSIONS: readonly AcademyPermission[] = PERMISSIONS.filter(
  (p): p is AcademyPermission => !(PLATFORM_PERMISSIONS as readonly string[]).includes(p),
)

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS)
const PLATFORM_SET: ReadonlySet<string> = new Set(PLATFORM_PERMISSIONS)

export const isPermission = (value: unknown): value is Permission => typeof value === 'string' && PERMISSION_SET.has(value)
export const isPlatformPermission = (value: string): value is PlatformPermission => PLATFORM_SET.has(value)

/** Strips `.own` / `.all`, so `leads.view.own` → `leads.view`. */
export function permissionBase(p: string): string {
  return p.replace(/\.(own|all)$/, '')
}

/** `x.own` and `x.all` are scoped variants of the same base permission. */
export const isScopedPermission = (p: string) => /\.(own|all)$/.test(p)

/** Does a granted key satisfy a requested key? `leads.view` (base) is satisfied by `.own` or `.all`. */
export function satisfies(granted: string, requested: string): boolean {
  if (granted === requested) return true
  const base = permissionBase(granted)
  if (requested === base && isScopedPermission(granted)) return true
  // .all implies .own
  return requested.endsWith('.own') && granted === `${permissionBase(requested)}.all`
}

/** Validates a role's permission list: only catalog keys, never platform keys, no duplicates. */
export function validateRolePermissions(values: readonly unknown[]): { ok: true; permissions: AcademyPermission[] } | { ok: false; reason: string } {
  const out = new Set<AcademyPermission>()
  for (const v of values) {
    if (!isPermission(v)) return { ok: false, reason: `Unknown permission: ${String(v)}` }
    if (isPlatformPermission(v)) return { ok: false, reason: `Platform permission cannot be granted in an academy: ${v}` }
    out.add(v)
  }
  return { ok: true, permissions: [...out] }
}

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, { fa: string; en: string }> = {
  users: { fa: 'کاربران', en: 'Users' },
  roles: { fa: 'نقش‌ها', en: 'Roles' },
  catalog: { fa: 'دوره‌ها', en: 'Catalog' },
  sales: { fa: 'فروش و CRM', en: 'Sales / CRM' },
  finance: { fa: 'مالی', en: 'Finance' },
  learning: { fa: 'آموزش', en: 'Learning' },
  certificates: { fa: 'گواهی‌ها', en: 'Certificates' },
  content: { fa: 'محتوا', en: 'Content' },
  support: { fa: 'پشتیبانی', en: 'Support' },
  messaging: { fa: 'پیامک', en: 'Messaging' },
  reports: { fa: 'گزارش‌ها', en: 'Reports' },
  academy: { fa: 'آکادمی', en: 'Academy' },
  platform: { fa: 'پلتفرم ادورا', en: 'Platform' },
}

// ---------------------------------------------------------------- Role templates

export type RoleTemplateKey = 'academy-admin' | 'advisor' | 'instructor' | 'finance' | 'support' | 'content-editor' | 'student'

export type RoleTemplate = {
  key: RoleTemplateKey
  name: { fa: string; en: string }
  description: string
  permissions: readonly AcademyPermission[]
}

const g = PERMISSION_GROUPS

/** Seeded into every academy (Notion 11 §3.2). Admins copy and edit them; custom roles are added beside them. */
export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'academy-admin',
    name: { fa: 'مدیر آکادمی', en: 'Academy admin' },
    description: 'Everything inside the academy except Edvora platform permissions.',
    permissions: ACADEMY_PERMISSIONS,
  },
  {
    key: 'advisor',
    name: { fa: 'مشاور فروش', en: 'Advisor' },
    description: 'Works own leads, creates orders and payment links, records manual payments.',
    permissions: [
      'leads.view.own',
      'leads.create',
      'orders.create_for_lead',
      'discount.give',
      'refunds.request',
      'payments.manual.record',
      'sms.send_single',
      'courses.view',
      'users.view',
      'enrollments.view',
    ],
  },
  {
    key: 'instructor',
    name: { fa: 'مدرس', en: 'Instructor' },
    description: 'Own courses and cohorts only — set the scope on the membership.',
    permissions: ['lessons.edit', 'live.host', 'assignments.grade', 'qa.answer', 'defense.score', 'courses.view', 'enrollments.view', 'certificates.view'],
  },
  {
    key: 'finance',
    name: { fa: 'مالی', en: 'Finance' },
    description: 'Payments, instalments, manual receipts, refunds, exports.',
    permissions: [...g.finance, 'reports.finance', 'users.view', 'courses.view', 'enrollments.view'],
  },
  {
    key: 'support',
    name: { fa: 'پشتیبانی', en: 'Support' },
    description: 'Tickets and student lookup. No money actions.',
    permissions: [...g.support, 'users.view', 'refunds.request', 'sms.send_single', 'courses.view', 'enrollments.view', 'certificates.view'],
  },
  {
    key: 'content-editor',
    name: { fa: 'اپراتور محتوا', en: 'Content editor' },
    description: 'Website content and course text, no publishing of courses.',
    permissions: [...g.content, 'courses.view', 'courses.edit'],
  },
  {
    key: 'student',
    name: { fa: 'دانشجو', en: 'Student' },
    description: 'No admin permissions — student panel only.',
    permissions: [],
  },
]

/** Legacy global roles (users.roles) → template used when migrating them to memberships. */
export const LEGACY_ROLE_TEMPLATE: Partial<Record<string, RoleTemplateKey>> = {
  admin: 'academy-admin',
  advisor: 'advisor',
  instructor: 'instructor',
}
