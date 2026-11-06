import type { CollectionConfig } from 'payload'
import { admins, hasRole } from '../access/roles'

export const Enrollments: CollectionConfig = {
  slug: 'enrollments',
  labels: { singular: { fa: 'ثبت‌نام', en: 'Enrollment' }, plural: { fa: 'ثبت‌نام‌ها', en: 'Enrollments' } },
  admin: { defaultColumns: ['user', 'course', 'cohort', 'status'], group: { fa: 'آموزش', en: 'Learning' } },
  access: {
    read: ({ req }) => {
      if (!req.user) return false
      if (hasRole(req.user, 'super-admin', 'admin', 'instructor', 'advisor')) return true
      return { user: { equals: req.user.id } }
    },
    create: admins,
    update: ({ req }) => hasRole(req.user, 'super-admin', 'admin', 'instructor'),
    delete: admins,
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true },
    { name: 'cohort', type: 'relationship', relationTo: 'cohorts' },
    { name: 'order', type: 'relationship', relationTo: 'orders' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { value: 'active', label: { fa: 'فعال', en: 'Active' } },
        { value: 'completed', label: { fa: 'تکمیل شده', en: 'Completed' } },
        { value: 'cancelled', label: { fa: 'لغو شده', en: 'Cancelled' } },
      ],
    },
    { name: 'completedLessons', type: 'relationship', relationTo: 'lessons', hasMany: true },
    { name: 'defensePassed', type: 'checkbox', label: { fa: 'دفاع نهایی قبول', en: 'Final defense passed' } },
  ],
}
