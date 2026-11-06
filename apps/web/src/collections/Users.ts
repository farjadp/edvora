import { accessWhere, can, checkGrant, isPlatformAdmin, normalizeIranMobile, type AccessContext } from '@edvora/core'
import type { Access, CollectionBeforeChangeHook, CollectionConfig, FieldAccess, PayloadRequest, Where } from 'payload'
import { APIError } from 'payload'
import { assertManagersRemain } from '../access/managers'
import { allowCreate, getAccess, isStaffRequest, isSystemWrite, nobody } from '../access/permissions'
import { ROLES, ROLE_LABELS, isSuperAdmin } from '../access/roles'
import { twoFactorEndpoints } from '../endpoints/twoFactor'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'

export const USER_STATUSES = [
  { value: 'active', label: { fa: 'فعال', en: 'Active' } },
  { value: 'suspended', label: { fa: 'معلق (ورود ممنوع، داده حفظ می‌شود)', en: 'Suspended' } },
  { value: 'archived', label: { fa: 'بایگانی (خروج از مجموعه)', en: 'Archived' } },
] as const

const tenantIds = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((t) => idOf((t as { tenant?: unknown })?.tenant)).filter((x): x is number => x !== null) : []

const TENANTS_FIELD = 'tenants.tenant'

/** Users visible to the actor: themselves, plus people in academies where they hold `permission`. */
const selfOr =
  (permission: string): Access =>
  async ({ req }) => {
    if (!req.user) return false
    const ctx = await getAccess(req)
    const where = ctx ? accessWhere(ctx, permission, { tenant: TENANTS_FIELD }) : false
    if (where === true) return true
    const self: Where = { id: { equals: req.user.id } }
    return where ? { or: [self, where as Where] } : self
  }

/** Sensitive profile fields (national code, internal notes): the person themselves or `users.view_sensitive`. */
const sensitive =
  (allowSelf: boolean): FieldAccess =>
  async ({ req, doc }) => {
    if (!req.user) return false
    if (allowSelf && doc?.id === req.user.id) return true
    const ctx = await getAccess(req)
    if (!ctx) return false
    if (isPlatformAdmin(ctx)) return true
    return tenantIds(doc?.tenants).some((t) => can(ctx, t, 'users.view_sensitive'))
  }

const staffOnly: FieldAccess = ({ req }) => isStaffRequest(req)
const platformOnly: FieldAccess = ({ req }) => isSuperAdmin(req.user)

function denyUnless(ok: boolean, message: string): void {
  if (!ok) throw new APIError(message, 403)
}

/**
 * Nobody edits an account whose access is above their own (password or email of an admin = account takeover):
 * the actor must be able to grant every membership the target holds, and platform admins are off limits.
 */
async function assertCovers(req: PayloadRequest, ctx: AccessContext, target: { id: number; roles?: string[] | null; status?: string | null }) {
  denyUnless(!isSuperAdmin(target), 'Only Edvora can edit a platform admin')
  const res = await req.payload.find({ collection: 'memberships', where: { user: { equals: target.id } }, depth: 1, limit: 500, pagination: false, overrideAccess: true, req })
  for (const m of res.docs) {
    const tenant = idOf(m.tenant)
    if (!tenant) continue
    const permissions = (m.roles ?? []).flatMap((r) => (typeof r === 'object' && r && !r.archived ? (r.permissions ?? []) : []))
    if (permissions.length === 0) continue
    const scope = { courses: (m.scope?.courses ?? []).map(idOf).filter((x): x is number => x !== null), cohorts: (m.scope?.cohorts ?? []).map(idOf).filter((x): x is number => x !== null), ownRecordsOnly: Boolean(m.scope?.ownRecordsOnly) }
    denyUnless(checkGrant(ctx, tenant, { permissions, scope }, target.id).ok, 'This person has access you do not hold; ask someone above them')
  }
}

/** Who may set academies, status and profile of whom (no hard delete, no self-promotion). */
const guardUsers: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (!req.user || isSystemWrite(req) || !data) return data
  const ctx: AccessContext | null = await getAccess(req)
  if (!ctx) throw new APIError('Forbidden', 403)

  const before = tenantIds(originalDoc?.tenants)
  const statusChange = operation === 'update' && 'status' in data && data.status !== (originalDoc?.status ?? 'active')
  // Applies to everyone, platform admins included: an academy is never left without a role manager.
  if (statusChange && data.status !== 'active' && originalDoc) {
    for (const t of before) await assertManagersRemain(req, t, { kind: 'user', id: originalDoc.id, status: data.status })
  }
  if (isPlatformAdmin(ctx)) return data

  const after = 'tenants' in data ? tenantIds(data.tenants) : before

  if (operation === 'create') {
    denyUnless(after.length > 0, 'Choose the academy for the new user')
    for (const t of after) denyUnless(can(ctx, t, 'users.create'), 'You cannot create users in this academy')
    return data
  }

  const self = originalDoc?.id === req.user.id
  const added = after.filter((t) => !before.includes(t))
  const removed = before.filter((t) => !after.includes(t))
  if (added.length || removed.length) {
    denyUnless(!self, 'You cannot change your own academies')
    for (const t of [...added, ...removed]) denyUnless(can(ctx, t, 'users.edit'), 'You cannot change membership of this academy')
  }
  if (!self && originalDoc) {
    denyUnless(before.some((t) => can(ctx, t, 'users.edit')), 'You cannot edit this user')
    await assertCovers(req, ctx, originalDoc as { id: number; roles?: string[] | null; status?: string | null })
  }

  if (statusChange) {
    denyUnless(!self, 'You cannot change your own account status')
    denyUnless(before.some((t) => can(ctx, t, 'users.deactivate')), 'You cannot change the status of this user')
  }
  return data
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: { fa: 'کاربر', en: 'User' }, plural: { fa: 'کاربران', en: 'Users' } },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'phone', 'email', 'status'], group: { fa: 'اعضا و دسترسی', en: 'People & access' } },
  // Staff log in to /admin with email + password (+ TOTP when enabled). Students log in on the site with phone + SMS code.
  auth: { tokenExpiration: 60 * 60 * 8 },
  endpoints: twoFactorEndpoints,
  access: {
    admin: ({ req }) => isStaffRequest(req),
    read: selfOr('users.view'),
    create: allowCreate('users.create'),
    update: selfOr('users.edit'),
    // No hard delete (ADR 006, AGENTS.md): suspend or archive instead. Legal erasure is a platform task with approval.
    delete: nobody,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && !data.name && (data.firstName || data.lastName)) data.name = [data.firstName, data.lastName].filter(Boolean).join(' ')
        return data
      },
    ],
    beforeChange: [guardUsers],
    beforeLogin: [
      ({ user }) => {
        if ((user.status ?? 'active') !== 'active') throw new APIError('This account is not active', 403)
        return user
      },
    ],
    afterChange: [auditChange('users')],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: { fa: 'هویت', en: 'Identity' },
          fields: [
            { name: 'name', type: 'text', label: { fa: 'نام نمایشی', en: 'Display name' }, admin: { description: 'Filled from first + last name when empty.' } },
            {
              type: 'row',
              fields: [
                { name: 'firstName', type: 'text', label: { fa: 'نام', en: 'First name (fa)' } },
                { name: 'lastName', type: 'text', label: { fa: 'نام خانوادگی', en: 'Last name (fa)' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'firstNameLatin', type: 'text', label: { fa: 'نام لاتین (برای گواهی)', en: 'First name (latin)' } },
                { name: 'lastNameLatin', type: 'text', label: { fa: 'نام خانوادگی لاتین', en: 'Last name (latin)' } },
              ],
            },
            {
              name: 'phone',
              type: 'text',
              unique: true,
              index: true,
              label: { fa: 'موبایل', en: 'Mobile' },
              hooks: {
                beforeValidate: [({ value }) => (typeof value === 'string' && value ? (normalizeIranMobile(value) ?? value) : value)],
              },
              validate: (v: unknown) => !v || (typeof v === 'string' && /^09\d{9}$/.test(v)) || 'شماره موبایل معتبر نیست',
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'nationalCode',
                  type: 'text',
                  label: { fa: 'کد ملی', en: 'National code' },
                  access: { read: sensitive(true) },
                  validate: (v: unknown) => !v || (typeof v === 'string' && /^\d{10}$/.test(v)) || 'کد ملی ۱۰ رقم است',
                },
                { name: 'birthDate', type: 'date', label: { fa: 'تاریخ تولد', en: 'Birth date' }, admin: { date: { pickerAppearance: 'dayOnly' } } },
                { name: 'city', type: 'text', label: { fa: 'شهر', en: 'City' } },
              ],
            },
          ],
        },
        {
          label: { fa: 'پروفایل', en: 'Profile' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'jobTitle', type: 'text', label: { fa: 'سمت', en: 'Job title' } },
                { name: 'company', type: 'text', label: { fa: 'شرکت', en: 'Company' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'education', type: 'text', label: { fa: 'تحصیلات', en: 'Education' } },
                {
                  name: 'linkedin',
                  type: 'text',
                  label: 'LinkedIn',
                  validate: (v: unknown) => !v || (typeof v === 'string' && /^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(v)) || 'https://linkedin.com/…',
                },
              ],
            },
            {
              name: 'publicProfile',
              type: 'group',
              label: { fa: 'پروفایل عمومی (مدرسان)', en: 'Public profile (instructors)' },
              fields: [
                { name: 'showOnSite', type: 'checkbox', defaultValue: false, label: { fa: 'نمایش در سایت', en: 'Show on site' } },
                { name: 'title', type: 'text', label: { fa: 'عنوان در صفحه دوره', en: 'Title on course pages' } },
                { name: 'bio', type: 'textarea', label: { fa: 'معرفی', en: 'Bio' } },
              ],
            },
          ],
        },
        {
          label: { fa: 'وضعیت و دسترسی', en: 'Status & access' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'status', type: 'select', defaultValue: 'active', index: true, label: { fa: 'وضعیت حساب', en: 'Account status' }, options: [...USER_STATUSES] },
                { name: 'statusReason', type: 'text', label: { fa: 'دلیل تغییر وضعیت', en: 'Status reason' } },
              ],
            },
            {
              name: 'roles',
              type: 'select',
              hasMany: true,
              defaultValue: ['student'],
              label: { fa: 'نقش پلتفرم (قدیمی)', en: 'Platform role (legacy)' },
              admin: { description: 'Only "super-admin" (Edvora staff) still grants access. Academy access is set in Memberships.' },
              access: { create: platformOnly, update: platformOnly },
              options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
            },
            {
              name: 'twoFactorEnabled',
              type: 'checkbox',
              defaultValue: false,
              label: { fa: 'ورود دومرحله‌ای (TOTP)', en: 'Two-factor (TOTP) on' },
              admin: { readOnly: true, description: 'Turned on by the person via /api/users/2fa/setup + enable.' },
              access: { create: () => false, update: () => false },
            },
            {
              name: 'twoFactor',
              type: 'group',
              hidden: true,
              access: { read: () => false, create: () => false, update: () => false },
              fields: [
                { name: 'secret', type: 'text' },
                { name: 'pendingSecret', type: 'text' },
                { name: 'lastUsedStep', type: 'number' },
                { name: 'failedAttempts', type: 'number' },
                { name: 'lockedUntil', type: 'date' },
                { name: 'verifiedSessions', type: 'array', fields: [{ name: 'sid', type: 'text', required: true }, { name: 'at', type: 'date' }] },
              ],
            },
          ],
        },
        {
          label: { fa: 'داخلی', en: 'Internal' },
          fields: [
            { name: 'tags', type: 'text', hasMany: true, label: { fa: 'برچسب‌ها', en: 'Tags' }, access: { read: staffOnly } },
            {
              name: 'source',
              type: 'select',
              label: { fa: 'منبع', en: 'Source' },
              access: { read: staffOnly },
              options: [
                { value: 'self-signup', label: { fa: 'ثبت‌نام در سایت', en: 'Self sign-up' } },
                { value: 'lead', label: { fa: 'از سرنخ', en: 'From a lead' } },
                { value: 'import', label: { fa: 'ورود از فایل', en: 'Import' } },
                { value: 'manual', label: { fa: 'ایجاد دستی', en: 'Manual' } },
              ],
            },
            { name: 'internalNotes', type: 'textarea', label: { fa: 'یادداشت داخلی', en: 'Internal notes' }, access: { read: sensitive(false) } },
          ],
        },
      ],
    },
  ],
}
