import type { CollectionConfig } from 'payload'
import { normalizeIranMobile } from '@edvora/core'
import { ROLES, ROLE_LABELS, adminsField, hasRole, isStaff, isSuperAdmin } from '../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: { fa: 'کاربر', en: 'User' }, plural: { fa: 'کاربران', en: 'Users' } },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'phone', 'roles', 'email'], group: { fa: 'ادورا', en: 'Edvora' } },
  // Staff log in to /admin with email + password. Students log in on the site with phone + SMS code.
  auth: { tokenExpiration: 60 * 60 * 8 },
  access: {
    admin: ({ req }) => isStaff(req.user),
    read: ({ req }) => {
      if (!req.user) return false
      if (hasRole(req.user, 'super-admin', 'admin', 'advisor', 'instructor')) return true
      return { id: { equals: req.user.id } }
    },
    create: ({ req }) => hasRole(req.user, 'super-admin', 'admin'),
    update: ({ req }) => {
      if (!req.user) return false
      if (hasRole(req.user, 'super-admin', 'admin')) return true
      return { id: { equals: req.user.id } }
    },
    delete: ({ req }) => hasRole(req.user, 'super-admin', 'admin'),
  },
  fields: [
    { name: 'name', type: 'text', label: { fa: 'نام و نام خانوادگی', en: 'Full name' } },
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
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      saveToJWT: true,
      defaultValue: ['student'],
      access: {
        create: adminsField,
        update: ({ req }) => hasRole(req.user, 'super-admin', 'admin'),
      },
      options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
      validate: (value: unknown, { req }: { req: { user?: unknown } }) => {
        // Only Edvora staff can create super admins.
        if (Array.isArray(value) && value.includes('super-admin') && req.user && !isSuperAdmin(req.user as never)) {
          return 'Only an Edvora super admin can grant this role'
        }
        return true
      },
    },
  ],
}
