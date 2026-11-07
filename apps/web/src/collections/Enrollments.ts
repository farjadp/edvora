import type { CollectionConfig } from 'payload'
import { allow, allowCreate, anyOf, guard, isSystemWrite, nobody, ownRecords, requireForFields } from '../access/permissions'
import { GAMIFICATION_CONTEXT, refreshAfterEnrollmentChange } from '../lib/gamification'
import { auditChange } from '../hooks/audit'

const SCOPE = { course: 'course', cohort: 'cohort' }

export const Enrollments: CollectionConfig = {
  slug: 'enrollments',
  labels: { singular: { fa: 'ثبت‌نام', en: 'Enrollment' }, plural: { fa: 'ثبت‌نام‌ها', en: 'Enrollments' } },
  admin: {
    components: { beforeListTable: ['/components/admin/ListKpis#ListKpis'] }, defaultColumns: ['user', 'course', 'cohort', 'status', 'enrolledAt'], group: { fa: 'آموزش', en: 'Learning' } },
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
      // The gamification cache and watch data are server-written only (E-028).
      ({ data, originalDoc, operation, req }) => {
        if (!data || !req.user || isSystemWrite(req) || req.context[GAMIFICATION_CONTEXT] === true) return data
        for (const f of ['gamification', 'lessonWatch'] as const) {
          if (operation === 'create') delete data[f]
          else data[f] = originalDoc?.[f]
        }
        return data
      },
    ],
    afterChange: [auditChange('enrollments'), refreshAfterEnrollmentChange],
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
    {
      // E-028: a cache of totals rebuilt from the `learning-events` ledger (lib/gamification.ts), plus the student's
      // own preferences. Written only by server code; nobody edits it in /admin.
      name: 'gamification',
      type: 'group',
      label: { fa: 'امتیاز و پیشرفت', en: 'Gamification' },
      admin: { readOnly: true, description: 'Cache of the learning ledger. Rebuilt automatically.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'xp', type: 'number', defaultValue: 0, index: true, label: { fa: 'امتیاز', en: 'XP' } },
            { name: 'level', type: 'number', defaultValue: 1, label: { fa: 'سطح', en: 'Level' } },
            { name: 'streakWeeks', type: 'number', defaultValue: 0, label: { fa: 'هفته‌های پیاپی', en: 'Streak weeks' } },
            { name: 'computedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
          ],
        },
        { name: 'summary', type: 'json', admin: { description: 'Derived summary (levels, rhythm, badges).' } },
        {
          type: 'row',
          fields: [
            { name: 'leaderboardOptIn', type: 'checkbox', defaultValue: false, label: { fa: 'حضور در جدول ورودی', en: 'Leaderboard opt-in' } },
            { name: 'nickname', type: 'text', maxLength: 40, label: { fa: 'نام مستعار', en: 'Nickname' } },
          ],
        },
      ],
    },
    // E-028 T3: genuinely played seconds per lesson from the player beacon (server-clock capped).
    { name: 'lessonWatch', type: 'json', admin: { hidden: true } },
  ],
}
