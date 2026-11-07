import { validateQuestion, type QuestionDraft } from '@edvora/core'
import type { CollectionConfig } from 'payload'
import { allow, allowCreate, anyOf, guard, nobody } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { throwFieldErrors } from '../lib/validation'
import { richTextField } from '../lib/richText'

const SCOPE = { course: 'course' }

export const QUESTION_TYPE_OPTIONS = [
  { value: 'single', label: { fa: 'تک‌گزینه‌ای', en: 'Single choice' } },
  { value: 'multiple', label: { fa: 'چندگزینه‌ای', en: 'Multiple choice' } },
  { value: 'trueFalse', label: { fa: 'درست / نادرست', en: 'True / false' } },
  { value: 'short', label: { fa: 'پاسخ کوتاه', en: 'Short answer' } },
]

/**
 * Question bank per course (phase-2 §Q1). Never public: students only receive questions through the quiz
 * attempt, with correct answers stripped. Archived questions stay for past attempts but cannot be added to quizzes.
 */
export const Questions: CollectionConfig = {
  slug: 'questions',
  labels: { singular: { fa: 'سؤال', en: 'Question' }, plural: { fa: 'بانک سؤال', en: 'Question bank' } },
  admin: {
    useAsTitle: 'text',
    defaultColumns: ['text', 'course', 'type', 'points', 'archived'],
    group: { fa: 'آزمون و تکلیف', en: 'Quizzes & assignments' },
    description: 'Editing a question changes only attempts started afterwards; past attempts keep their copy.',
  },
  access: {
    read: anyOf(allow('quizzes.manage', SCOPE), allow('courses.view', SCOPE)),
    create: allowCreate('quizzes.manage'),
    update: allow('quizzes.manage', SCOPE),
    delete: nobody,
  },
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as QuestionDraft
        throwFieldErrors('questions', validateQuestion({ ...merged, type: merged.type ?? 'single' }))
        return data
      },
    ],
    beforeChange: [guard({ create: ['quizzes.manage'], update: ['quizzes.manage'], fields: SCOPE })],
    afterChange: [auditChange('questions')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true, label: { fa: 'دوره', en: 'Course' } },
        { name: 'type', type: 'select', required: true, defaultValue: 'single', options: QUESTION_TYPE_OPTIONS, label: { fa: 'نوع', en: 'Type' } },
        { name: 'points', type: 'number', required: true, defaultValue: 1, min: 0, label: { fa: 'امتیاز', en: 'Points' } },
      ],
    },
    { name: 'text', type: 'textarea', required: true, label: { fa: 'متن سؤال', en: 'Question' } },
    {
      name: 'options',
      type: 'array',
      label: { fa: 'گزینه‌ها', en: 'Options' },
      admin: { condition: (_, s) => s?.type === 'single' || s?.type === 'multiple' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'text', type: 'text', required: true, label: { fa: 'متن گزینه', en: 'Option' } },
            { name: 'isCorrect', type: 'checkbox', label: { fa: 'درست', en: 'Correct' } },
          ],
        },
      ],
    },
    {
      name: 'correctAnswer',
      type: 'radio',
      label: { fa: 'پاسخ درست', en: 'Correct answer' },
      options: [
        { value: 'true', label: { fa: 'درست', en: 'True' } },
        { value: 'false', label: { fa: 'نادرست', en: 'False' } },
      ],
      admin: { condition: (_, s) => s?.type === 'trueFalse' },
    },
    {
      name: 'acceptedAnswers',
      type: 'array',
      label: { fa: 'پاسخ‌های پذیرفته', en: 'Accepted answers' },
      admin: {
        condition: (_, s) => s?.type === 'short',
        description: 'Exact match after normalising Persian/Arabic digits, ي/ك, نیم‌فاصله, spaces and letter case. No fuzzy matching.',
      },
      fields: [{ name: 'answer', type: 'text', required: true }],
    },
    richTextField({ name: 'explanation', label: { fa: 'توضیح پاسخ', en: 'Explanation' }, admin: { description: 'Shown only when the quiz review setting is "full".' } }),
    { name: 'archived', type: 'checkbox', defaultValue: false, index: true, label: { fa: 'بایگانی', en: 'Archived' }, admin: { position: 'sidebar' } },
  ],
}
