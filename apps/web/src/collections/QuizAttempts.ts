import type { CollectionConfig } from 'payload'
import { allow, anyOf, fieldAllow, nobody, ownRecords } from '../access/permissions'

const SCOPE = { course: 'course', cohort: 'cohort' }

/**
 * One student attempt at a quiz (phase-2 §Q3–Q7). Written only by server code (start / autosave / submit actions,
 * which check tenant, enrollment and drip); never through the API. The snapshot holds correct answers, so only
 * staff with `enrollments.view` may read it.
 */
export const QuizAttempts: CollectionConfig = {
  slug: 'quiz-attempts',
  labels: { singular: { fa: 'تلاش آزمون', en: 'Quiz attempt' }, plural: { fa: 'نتایج آزمون‌ها', en: 'Quiz attempts' } },
  admin: {
    defaultColumns: ['user', 'quiz', 'attemptNo', 'status', 'score', 'maxScore', 'passed', 'submittedAt'],
    group: { fa: 'آزمون و تکلیف', en: 'Quizzes & assignments' },
    listSearchableFields: ['id'],
  },
  defaultSort: '-startedAt',
  access: {
    read: anyOf(ownRecords('user'), allow('enrollments.view', SCOPE), allow('quizzes.manage', SCOPE)),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  indexes: [{ fields: ['quiz', 'user', 'attemptNo'], unique: true }],
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'quiz', type: 'relationship', relationTo: 'quizzes', required: true, index: true },
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
        { name: 'attemptNo', type: 'number', required: true, min: 1 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'enrollment', type: 'relationship', relationTo: 'enrollments', required: true },
        { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true },
        { name: 'cohort', type: 'relationship', relationTo: 'cohorts', index: true },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'in_progress',
          index: true,
          options: [
            { value: 'in_progress', label: { fa: 'در حال پاسخ', en: 'In progress' } },
            { value: 'submitted', label: { fa: 'ارسال شده', en: 'Submitted' } },
            { value: 'auto_submitted', label: { fa: 'پایان زمان', en: 'Time up' } },
          ],
        },
        { name: 'score', type: 'number' },
        { name: 'maxScore', type: 'number' },
        { name: 'passed', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'startedAt', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'deadlineAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'submittedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    { name: 'answers', type: 'json', admin: { description: 'Last saved answers, by question id.' } },
    { name: 'snapshot', type: 'json', access: { read: fieldAllow('enrollments.view') }, admin: { description: 'Questions, options, points and accepted answers as they were when the attempt started.' } },
  ],
}
