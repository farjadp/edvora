import { validateAssignment, type FieldError } from '@edvora/core'
import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { allow, allowCreate, anyOf, guard, nobody } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'
import { throwFieldErrors } from '../lib/validation'
import { richTextField } from '../lib/richText'

const SCOPE = { course: 'course', cohort: 'cohort' }

type AssignmentData = { course?: unknown; cohort?: unknown; lesson?: unknown; dueAt?: string | null; maxScore?: number | null; passScore?: number | null }

/** C1: deadline not in the past, 0 < max, pass ≤ max, cohort/lesson of the same course. */
const validate: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const before = originalDoc as AssignmentData | undefined
  const merged = { ...(before ?? {}), ...(data ?? {}) } as AssignmentData
  const dueAtChanged = !before || (data?.dueAt !== undefined && new Date(data.dueAt).getTime() !== new Date(before.dueAt ?? 0).getTime())
  const errors: FieldError[] = validateAssignment({ dueAt: merged.dueAt, maxScore: merged.maxScore, passScore: merged.passScore, dueAtChanged, now: new Date() })
  const courseId = idOf(merged.course)
  for (const [field, collection, message] of [
    ['cohort', 'cohorts', 'این ورودی متعلق به همین دوره نیست.'],
    ['lesson', 'lessons', 'این جلسه متعلق به همین دوره نیست.'],
  ] as const) {
    const id = idOf(merged[field])
    if (!id || !courseId) continue
    const doc = await req.payload.findByID({ collection, id, depth: 0, overrideAccess: true, req, disableErrors: true })
    if (!doc || idOf(doc.course) !== courseId) errors.push({ path: field, message })
  }
  throwFieldErrors('assignments', errors)
  return data
}

/** Assignments for a whole course or one cohort (phase-2 §C1). Students see them only through the learn pages. */
export const Assignments: CollectionConfig = {
  slug: 'assignments',
  labels: { singular: { fa: 'تکلیف', en: 'Assignment' }, plural: { fa: 'تکالیف', en: 'Assignments' } },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'course', 'cohort', 'dueAt', 'required', 'status'],
    group: { fa: 'آزمون و تکلیف', en: 'Quizzes & assignments' },
  },
  access: {
    read: anyOf(allow('assignments.manage', SCOPE), allow('submissions.grade', SCOPE), allow('courses.view', { course: 'course' })),
    create: allowCreate('assignments.manage'),
    update: allow('assignments.manage', SCOPE),
    delete: nobody,
  },
  hooks: {
    beforeValidate: [validate],
    beforeChange: [guard({ create: ['assignments.manage'], update: ['assignments.manage'], fields: SCOPE })],
    afterChange: [auditChange('assignments')],
  },
  fields: [
    { name: 'title', type: 'text', required: true, label: { fa: 'عنوان', en: 'Title' } },
    {
      type: 'row',
      fields: [
        { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true, label: { fa: 'دوره', en: 'Course' } },
        {
          name: 'cohort',
          type: 'relationship',
          relationTo: 'cohorts',
          index: true,
          label: { fa: 'ورودی', en: 'Cohort' },
          admin: { description: 'Empty = every cohort of the course.' },
          filterOptions: ({ data }) => (idOf((data as AssignmentData | undefined)?.course) ? { course: { equals: idOf((data as AssignmentData).course) } } : true),
        },
        {
          name: 'lesson',
          type: 'relationship',
          relationTo: 'lessons',
          index: true,
          label: { fa: 'جلسه', en: 'Lesson' },
          admin: { description: 'Optional. A required assignment on a lesson also blocks that lesson’s completion and is locked with it.' },
          filterOptions: ({ data }) => (idOf((data as AssignmentData | undefined)?.course) ? { course: { equals: idOf((data as AssignmentData).course) } } : true),
        },
      ],
    },
    richTextField({ name: 'description', label: { fa: 'شرح تکلیف', en: 'Description' } }),
    {
      type: 'row',
      fields: [
        {
          name: 'dueAt',
          type: 'date',
          required: true,
          timezone: true,
          label: { fa: 'مهلت تحویل', en: 'Due' },
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        { name: 'maxScore', type: 'number', required: true, defaultValue: 20, label: { fa: 'حداکثر نمره', en: 'Max score' } },
        { name: 'passScore', type: 'number', label: { fa: 'نمرهٔ قبولی', en: 'Pass score' }, admin: { description: 'Empty = graded is enough.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'required', type: 'checkbox', defaultValue: false, label: { fa: 'الزامی (شرط تکمیل و گواهی)', en: 'Required for completion' } },
        { name: 'allowLate', type: 'checkbox', defaultValue: false, label: { fa: 'تحویل با تأخیر مجاز است', en: 'Late submissions allowed' } },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'published',
          index: true,
          label: { fa: 'وضعیت', en: 'Status' },
          options: [
            { value: 'draft', label: { fa: 'پیش‌نویس', en: 'Draft' } },
            { value: 'published', label: { fa: 'منتشر شده', en: 'Published' } },
            { value: 'archived', label: { fa: 'بایگانی', en: 'Archived' } },
          ],
        },
      ],
    },
    { name: 'attachments', type: 'upload', relationTo: 'media', hasMany: true, label: { fa: 'پیوست', en: 'Attachments' } },
  ],
}
