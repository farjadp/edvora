/**
 * Permission catalog (ADR 006, Notion 11 §3.1). Defined in code, never by users.
 * Keys are `module.action[.own|.all]`. Holding `x.all` implies `x.own`.
 * The catalog grows when a module is built; access checks only ever read these keys.
 */
import type { LandingKey } from './roleSettings'

export const PERMISSION_GROUPS = {
  users: ['users.view', 'users.create', 'users.edit', 'users.deactivate', 'users.view_sensitive', 'users.import', 'users.export', 'users.2fa.reset'],
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
  learning: [
    'enrollments.view',
    'enrollments.manage',
    'live.host',
    'assignments.grade',
    'qa.answer',
    'defense.score',
    // E-026: quizzes, assignments, grading (append-only).
    'quizzes.manage',
    'assignments.manage',
    'submissions.grade',
  ],
  certificates: ['certificates.view', 'certificates.issue', 'certificates.revoke'],
  content: ['content.edit', 'content.publish', 'media.upload'],
  support: ['tickets.view.own', 'tickets.view.all', 'tickets.reply', 'tickets.assign'],
  messaging: ['sms.send_single', 'sms.broadcast', 'templates.edit'],
  reports: ['reports.sales', 'reports.finance', 'reports.learning'],
  academy: ['settings.edit', 'audit.view'],
  /** E-032 (ADR 011): WordPress import. Academy-grantable; `import.run` writes data, `import.view` reads reports. */
  migration: ['import.view', 'import.run'],
  /** E-046 (ADR 018): the staff AI assistant. `ai.use` = chat with it; `ai.manage` = settings, key, knowledge base, memory. */
  ai: ['ai.use', 'ai.manage'],
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
  migration: { fa: 'انتقال از وردپرس', en: 'WordPress import' },
  ai: { fa: 'دستیار هوشمند', en: 'AI assistant' },
  platform: { fa: 'پلتفرم ادورا', en: 'Platform' },
}

/** Human labels for keys whose meaning is not obvious from the key itself (role editor). */
export const PERMISSION_LABELS: Partial<Record<Permission, { fa: string; en: string }>> = {
  'users.2fa.reset': { fa: 'بازنشانی تأیید دومرحله‌ای', en: 'Reset two-factor authentication' },
  'import.view': { fa: 'دیدن گزارش‌های انتقال از وردپرس', en: 'View WordPress import reports' },
  'import.run': { fa: 'اجرای انتقال از وردپرس', en: 'Run WordPress imports' },
}

/**
 * What each academy permission lets its holder do (E-039, role editor and compare view). Typed over every academy
 * key, so adding a permission without a description fails the build.
 */
export const PERMISSION_DESCRIPTIONS: Record<AcademyPermission, { fa: string; en: string }> = {
  'users.view': { fa: 'دیدن فهرست کاربران و پروفایل دانشجویان', en: 'View users and student profiles' },
  'users.create': { fa: 'افزودن کاربر تازه', en: 'Create users' },
  'users.edit': { fa: 'ویرایش اطلاعات کاربران', en: 'Edit users' },
  'users.deactivate': { fa: 'تعلیق یا بایگانی حساب کاربران', en: 'Suspend or archive accounts' },
  'users.view_sensitive': { fa: 'دیدن اطلاعات حساس (کد ملی، نشانی)', en: 'View sensitive personal data' },
  'users.import': { fa: 'ورود گروهی کاربران از فایل', en: 'Bulk-import users' },
  'users.export': { fa: 'خروجی گرفتن از فهرست کاربران', en: 'Export users' },
  'users.2fa.reset': { fa: 'بازنشانی تأیید دومرحله‌ای همکاران', en: 'Reset a colleague\'s two-factor authentication' },
  'roles.view': { fa: 'دیدن نقش‌ها و دسترسی‌هایشان', en: 'View roles and their permissions' },
  'roles.manage': { fa: 'ساختن و ویرایش نقش‌ها', en: 'Create and edit roles' },
  'roles.assign': { fa: 'دادن نقش به همکاران (عضویت)', en: 'Assign roles to people (memberships)' },
  'courses.view': { fa: 'دیدن دوره‌ها در پنل', en: 'View courses in the panel' },
  'courses.edit': { fa: 'ویرایش متن و ساختار دوره‌ها', en: 'Edit courses' },
  'courses.publish': { fa: 'انتشار یا برداشتن دوره از سایت', en: 'Publish or unpublish courses' },
  'cohorts.manage': { fa: 'ساختن و مدیریت دوره‌های برگزاری و کلاس‌های زنده', en: 'Manage cohorts and live sessions' },
  'lessons.edit': { fa: 'ویرایش جلسه‌ها و محتوای درسی', en: 'Edit lessons' },
  'pricing.edit': { fa: 'تغییر قیمت و شرایط اقساط', en: 'Change prices and instalment plans' },
  'leads.view.own': { fa: 'دیدن و پیگیری مشتریان بالقوهٔ خودش', en: 'View and work own leads' },
  'leads.view.all': { fa: 'دیدن و پیگیری همهٔ مشتریان بالقوهٔ آکادمی', en: 'View and work all leads' },
  'leads.create': { fa: 'ثبت مشتری بالقوهٔ تازه', en: 'Create leads' },
  'leads.assign': { fa: 'سپردن مشتری بالقوه به مشاور دیگر', en: 'Reassign leads to another advisor' },
  'leads.export': { fa: 'خروجی گرفتن از مشتریان بالقوه', en: 'Export leads' },
  'orders.create_for_lead': { fa: 'ساختن سفارش و لینک پرداخت برای مشتری', en: 'Create orders and payment links for a lead' },
  'discount.give': { fa: 'دادن تخفیف در سقف مجاز', en: 'Give discounts within the limit' },
  'orders.view': { fa: 'دیدن سفارش‌ها و اقساط', en: 'View orders and instalments' },
  'orders.edit': { fa: 'ویرایش سفارش‌ها و اقساط', en: 'Edit orders and instalments' },
  'payments.manual.record': { fa: 'ثبت پرداخت دستی (فیش، کارت‌به‌کارت)', en: 'Record a manual payment' },
  'payments.manual.approve': { fa: 'تأیید پرداخت دستی ثبت‌شده توسط دیگری', en: 'Approve someone else\'s manual payment' },
  'refunds.request': { fa: 'درخواست بازپرداخت', en: 'Request a refund' },
  'refunds.approve': { fa: 'تأیید بازپرداخت درخواست‌شده توسط دیگری', en: 'Approve someone else\'s refund' },
  'coupons.manage': { fa: 'ساختن و مدیریت کدهای تخفیف', en: 'Manage coupon codes' },
  'finance.export': { fa: 'خروجی گرفتن از داده‌های مالی', en: 'Export finance data' },
  'enrollments.view': { fa: 'دیدن ثبت‌نام‌ها و پیشرفت دانشجویان', en: 'View enrolments and progress' },
  'enrollments.manage': { fa: 'ثبت‌نام، انتقال یا لغو ثبت‌نام دانشجو', en: 'Enrol, move or cancel students' },
  'live.host': { fa: 'برگزاری کلاس زنده', en: 'Host live classes' },
  'assignments.grade': { fa: 'نمره‌دادن به تکلیف‌ها', en: 'Grade assignments' },
  'qa.answer': { fa: 'پاسخ به پرسش‌های دانشجویان', en: 'Answer student questions' },
  'defense.score': { fa: 'ثبت نمرهٔ دفاع پایانی', en: 'Score final defences' },
  'quizzes.manage': { fa: 'ساختن آزمون و بانک سؤال', en: 'Manage quizzes and the question bank' },
  'assignments.manage': { fa: 'ساختن و ویرایش تکلیف‌ها', en: 'Manage assignments' },
  'submissions.grade': { fa: 'بررسی و نمره‌دهی تحویل تکلیف‌ها', en: 'Review and grade submissions' },
  'certificates.view': { fa: 'دیدن گواهی‌های صادرشده', en: 'View issued certificates' },
  'certificates.issue': { fa: 'صدور گواهی', en: 'Issue certificates' },
  'certificates.revoke': { fa: 'ابطال گواهی', en: 'Revoke certificates' },
  'content.edit': { fa: 'نوشتن و ویرایش محتوای سایت و مجله', en: 'Write and edit site content' },
  'content.publish': { fa: 'انتشار محتوای سایت و مجله', en: 'Publish site content' },
  'media.upload': { fa: 'بارگذاری تصویر و فایل', en: 'Upload media' },
  'tickets.view.own': { fa: 'دیدن تیکت‌های سپرده‌شده به خودش', en: 'View own tickets' },
  'tickets.view.all': { fa: 'دیدن همهٔ تیکت‌های آکادمی', en: 'View all tickets' },
  'tickets.reply': { fa: 'پاسخ به تیکت‌ها', en: 'Reply to tickets' },
  'tickets.assign': { fa: 'سپردن تیکت به همکار دیگر', en: 'Assign tickets' },
  'sms.send_single': { fa: 'فرستادن پیامک به یک نفر', en: 'Send an SMS to one person' },
  'sms.broadcast': { fa: 'فرستادن پیامک گروهی', en: 'Send bulk SMS' },
  'templates.edit': { fa: 'ویرایش قالب پیامک و ایمیل', en: 'Edit SMS and email templates' },
  'reports.sales': { fa: 'دیدن گزارش‌های فروش و عملکرد مشاوران', en: 'View sales and advisor reports' },
  'reports.finance': { fa: 'دیدن گزارش‌های مالی', en: 'View finance reports' },
  'reports.learning': { fa: 'دیدن گزارش‌های آموزشی', en: 'View learning reports' },
  'settings.edit': { fa: 'تغییر تنظیمات آکادمی (نام، رنگ، دامنه)', en: 'Edit academy settings' },
  'audit.view': { fa: 'دیدن گزارش ممیزی (چه کسی چه کرد)', en: 'View the audit log' },
  'import.view': { fa: 'دیدن گزارش‌های انتقال از وردپرس', en: 'View WordPress import reports' },
  'import.run': { fa: 'اجرای انتقال از وردپرس', en: 'Run WordPress imports' },
  'ai.use': { fa: 'گفت‌وگو با دستیار هوشمند (در حد دسترسی‌های خود شخص)', en: 'Use the AI assistant (within the person\'s own permissions)' },
  'ai.manage': { fa: 'تنظیم دستیار هوشمند: کلید، مدل، اسناد و یادداشت‌های حافظه', en: 'Manage the AI assistant: key, model, documents, memory' },
}

/**
 * Keys that only read. Used by the read-only reporting template (test) and the compare view legend.
 * `leads.view.*` is NOT here: holding it also allows updating the lead (advisors edit their own leads).
 */
export const READ_ONLY_PERMISSIONS: readonly AcademyPermission[] = [
  'users.view',
  'roles.view',
  'courses.view',
  'orders.view',
  'enrollments.view',
  'certificates.view',
  'reports.sales',
  'reports.finance',
  'reports.learning',
  'audit.view',
  'import.view',
]

// ---------------------------------------------------------------- Role templates

export type RoleTemplateKey =
  | 'academy-admin'
  | 'advisor'
  | 'instructor'
  | 'finance'
  | 'support'
  | 'content-editor'
  | 'student'
  // E-039 (ADR 016)
  | 'teaching-assistant'
  | 'reporting'
  | 'sales-manager'

export type RoleTemplate = {
  key: RoleTemplateKey
  name: { fa: string; en: string }
  description: string
  permissions: readonly AcademyPermission[]
  /** Default experience seeded with the template (ADR 016). Security rules are never on by default. */
  experience?: { landing: LandingKey }
}

const g = PERMISSION_GROUPS

const ADVISOR: readonly AcademyPermission[] = [
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
]

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
    permissions: ADVISOR,
    experience: { landing: 'leads' },
  },
  {
    key: 'instructor',
    name: { fa: 'مدرس', en: 'Instructor' },
    description: 'Own courses and cohorts only — set the scope on the membership.',
    permissions: [
      'lessons.edit',
      'live.host',
      'assignments.grade',
      'qa.answer',
      'defense.score',
      'courses.view',
      'enrollments.view',
      'certificates.view',
      // E-026
      'quizzes.manage',
      'assignments.manage',
      'submissions.grade',
    ],
    experience: { landing: 'teaching' },
  },
  {
    key: 'finance',
    name: { fa: 'مالی', en: 'Finance' },
    description: 'Payments, instalments, manual receipts, refunds, exports.',
    permissions: [...g.finance, 'reports.finance', 'users.view', 'courses.view', 'enrollments.view'],
    experience: { landing: 'finance' },
  },
  {
    key: 'support',
    name: { fa: 'پشتیبانی', en: 'Support' },
    description: 'Tickets and student lookup. No money actions.',
    permissions: [...g.support, 'users.view', 'refunds.request', 'sms.send_single', 'courses.view', 'enrollments.view', 'certificates.view'],
    experience: { landing: 'support' },
  },
  {
    key: 'content-editor',
    name: { fa: 'اپراتور محتوا', en: 'Content editor' },
    description: 'Website content and course text, no publishing of courses.',
    permissions: [...g.content, 'courses.view', 'courses.edit'],
    experience: { landing: 'content' },
  },
  {
    key: 'student',
    name: { fa: 'دانشجو', en: 'Student' },
    description: 'No admin permissions — student panel only.',
    permissions: [],
  },
  // ---- E-039 (ADR 016)
  {
    key: 'teaching-assistant',
    name: { fa: 'دستیار آموزشی', en: 'Teaching assistant' },
    description: 'Helps an instructor: grading and student questions only. No lesson editing, live hosting or money. Scope it to the instructor\'s courses on the membership.',
    permissions: ['courses.view', 'enrollments.view', 'assignments.grade', 'submissions.grade', 'qa.answer'],
    experience: { landing: 'teaching' },
  },
  {
    key: 'reporting',
    name: { fa: 'گزارش‌گیر (فقط خواندن)', en: 'Reporting (read-only)' },
    description: 'Sees reports and lists, changes nothing. Leads are excluded because seeing a lead also allows editing it.',
    permissions: ['reports.sales', 'reports.finance', 'reports.learning', 'courses.view', 'enrollments.view', 'orders.view', 'users.view', 'certificates.view', 'audit.view'],
    experience: { landing: 'overview' },
  },
  {
    key: 'sales-manager',
    name: { fa: 'سرپرست فروش', en: 'Sales manager' },
    description: 'Advisor team lead: everything an advisor does, plus all leads of the academy, reassigning them and the advisor reports.',
    permissions: [...ADVISOR.filter((p) => p !== 'leads.view.own'), 'leads.view.all', 'leads.assign', 'reports.sales'],
    experience: { landing: 'leads' },
  },
]

/** Legacy global roles (users.roles) → template used when migrating them to memberships. */
export const LEGACY_ROLE_TEMPLATE: Partial<Record<string, RoleTemplateKey>> = {
  admin: 'academy-admin',
  advisor: 'advisor',
  instructor: 'instructor',
}
