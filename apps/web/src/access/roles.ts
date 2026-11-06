/**
 * Legacy global roles on `users.roles`. Since E-021 (ADR 006) staff access comes from per-academy memberships and
 * the permission catalog (`./permissions.ts`). This field now only carries the platform flag `super-admin` (Edvora
 * staff) and the `student` marker; the other values are migrated to memberships and no longer grant anything.
 */
export const ROLES = ['super-admin', 'admin', 'advisor', 'instructor', 'company-manager', 'student'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, { fa: string; en: string }> = {
  'super-admin': { fa: 'مدیر ادورا', en: 'Edvora super admin' },
  admin: { fa: 'مدیر آکادمی (قدیمی)', en: 'Academy admin (legacy)' },
  advisor: { fa: 'مشاور فروش (قدیمی)', en: 'Advisor (legacy)' },
  instructor: { fa: 'مدرس (قدیمی)', en: 'Instructor (legacy)' },
  'company-manager': { fa: 'مدیر سازمان', en: 'Company manager' },
  student: { fa: 'دانشجو', en: 'Student' },
}

type MaybeUser = { roles?: (Role | string)[] | null; status?: string | null } | null | undefined

export const hasRole = (user: MaybeUser, ...roles: Role[]): boolean => Boolean(user?.roles?.some((r) => roles.includes(r as Role)))

/** Edvora platform admin. Suspended/archived accounts are never platform admins. */
export const isSuperAdmin = (user: MaybeUser) => hasRole(user, 'super-admin') && (user?.status ?? 'active') === 'active'
