import type { CollectionConfig } from 'payload'
import { allow, allowCreate, anyOf, guard, nobody, ownRecords, requireForFields } from '../access/permissions'
import { auditChange } from '../hooks/audit'

const SCOPE = { course: 'course', cohort: 'cohort' }

export const Enrollments: CollectionConfig = {
  slug: 'enrollments',
  labels: { singular: { fa: 'ثبت‌نام', en: 'Enrollment' }, plural: { fa: 'ثبت‌نام‌ها', en: 'Enrollments' } },
  admin: { defaultColumns: ['user', 'course', 'cohort', 'status'], group: { fa: 'آموزش', en: 'Learning' } },
  access: {
    read: anyOf(ownRecords('user'), allow('enrollments.view', SCOPE), allow('enrollments.manage', SCOPE)),
    create: allowCreate('enrollments.manage'),
    update: anyOf(allow('enrollments.manage', SCOPE), allow('defense.score', SCOPE)),
    delete: nobody,
  },
  hooks: {
    beforeChange: [
      guard({ create: ['enrollments.manage'], update: ['enrollments.manage', 'defense.score'], fields: SCOPE }),
      // An instructor scoring the defense may only touch progress fields.
      requireForFields(['user', 'course', 'cohort', 'order', 'status'], 'enrollments.manage', (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null) && !(a === undefined && b === 'active')),
    ],
    afterChange: [auditChange('enrollments')],
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
