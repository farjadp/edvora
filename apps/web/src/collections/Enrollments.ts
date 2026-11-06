import type { CollectionConfig } from 'payload'
import { allow, allowCreate, anyOf, guard, nobody, ownRecords, requireForFields } from '../access/permissions'
import { auditChange } from '../hooks/audit'

const SCOPE = { course: 'course', cohort: 'cohort' }

export const Enrollments: CollectionConfig = {
  slug: 'enrollments',
  labels: { singular: { fa: 'ثبت‌نام', en: 'Enrollment' }, plural: { fa: 'ثبت‌نام‌ها', en: 'Enrollments' } },
  admin: { defaultColumns: ['user', 'course', 'cohort', 'status', 'enrolledAt'], group: { fa: 'آموزش', en: 'Learning' } },
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
      // Drip start date and extra quiz attempts (Q6) are enrollment management too.
      async ({ data, operation }) => {
        if (operation === 'create' && data && !data.enrolledAt) data.enrolledAt = new Date().toISOString()
        return data
      },
      requireForFields(['user', 'course', 'cohort', 'order', 'status', 'enrolledAt', 'quizExtraAttempts', 'openedLessons'], 'enrollments.manage', (a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null) && !(a === undefined && b === 'active')),
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
    {
      name: 'enrolledAt',
      type: 'date',
      index: true,
      label: { fa: 'تاریخ ثبت‌نام', en: 'Enrolled at' },
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Drip "days after enrollment" counts from here. Set when the enrollment is created; kept when it is re-activated.',
      },
    },
    { name: 'completedLessons', type: 'relationship', relationTo: 'lessons', hasMany: true },
    {
      name: 'openedLessons',
      type: 'relationship',
      relationTo: 'lessons',
      hasMany: true,
      label: { fa: 'جلسات بازشده', en: 'Opened lessons' },
      admin: { readOnly: true, description: 'Lessons the student has opened. They are never locked again when dates change.' },
    },
    {
      name: 'quizExtraAttempts',
      type: 'array',
      label: { fa: 'فرصت اضافهٔ آزمون', en: 'Extra quiz attempts' },
      admin: { description: 'Give this student more attempts on one quiz (audited).' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'quiz', type: 'relationship', relationTo: 'quizzes', required: true },
            { name: 'extra', type: 'number', required: true, min: 1, max: 20, defaultValue: 1, label: { fa: 'تعداد', en: 'Extra attempts' } },
          ],
        },
      ],
    },
    { name: 'defensePassed', type: 'checkbox', label: { fa: 'دفاع نهایی قبول', en: 'Final defense passed' } },
  ],
}
