import type { Access, FieldAccess } from 'payload'

export const ROLES = ['super-admin', 'admin', 'advisor', 'instructor', 'company-manager', 'student'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, { fa: string; en: string }> = {
  'super-admin': { fa: 'مدیر ادورا', en: 'Edvora super admin' },
  admin: { fa: 'مدیر آکادمی', en: 'Academy admin' },
  advisor: { fa: 'مشاور فروش', en: 'Advisor' },
  instructor: { fa: 'مدرس', en: 'Instructor' },
  'company-manager': { fa: 'مدیر سازمان', en: 'Company manager' },
  student: { fa: 'دانشجو', en: 'Student' },
}

type MaybeUser = { roles?: (Role | string)[] | null } | null | undefined

export const hasRole = (user: MaybeUser, ...roles: Role[]): boolean =>
  Boolean(user?.roles?.some((r) => roles.includes(r as Role)))

export const isSuperAdmin = (user: MaybeUser) => hasRole(user, 'super-admin')
export const isStaff = (user: MaybeUser) => hasRole(user, 'super-admin', 'admin', 'advisor', 'instructor')

// Default is deny. Each collection opts into exactly what it needs.
export const nobody: Access = () => false
export const anyone: Access = () => true
export const superAdminOnly: Access = ({ req }) => isSuperAdmin(req.user)
export const admins: Access = ({ req }) => hasRole(req.user, 'super-admin', 'admin')
export const adminsOrAdvisors: Access = ({ req }) => hasRole(req.user, 'super-admin', 'admin', 'advisor')
export const adminsOrInstructors: Access = ({ req }) => hasRole(req.user, 'super-admin', 'admin', 'instructor')
export const staff: Access = ({ req }) => isStaff(req.user)

export const adminsField: FieldAccess = ({ req }) => hasRole(req.user, 'super-admin', 'admin')
export const superAdminField: FieldAccess = ({ req }) => isSuperAdmin(req.user)
