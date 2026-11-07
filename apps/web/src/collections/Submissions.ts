import { lexicalToPlainText, parseScore } from '@edvora/core'
import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { allow, allowCreate, anyOf, fieldAllow, guard, isSystemWrite, nobody, ownRecords } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'
import { throwFieldErrors } from '../lib/validation'
import { richTextField } from '../lib/richText'

const SCOPE = { course: 'course', cohort: 'cohort' }
const gradeField = fieldAllow('submissions.grade')

/**
 * Grading (C4). Staff type the score as text so ۱۸٫۵, 18.5 and 18,5 all work; it is parsed against the assignment's
 * max score into the numeric `score`. Invalid input is rejected and the previous grade is kept.
 * Last write wins; `gradedBy` / `gradedAt` record who graded last.
 */
const applyGrade: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (!data) return data
  const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
  // Denormalised scope fields follow the assignment, never the client.
  const assignmentId = idOf(merged.assignment)
  if (assignmentId) {
    const assignment = await req.payload.findByID({ collection: 'assignments', id: assignmentId, depth: 0, overrideAccess: true, req })
    data.course = idOf(assignment.course)
    data.tenant = idOf(assignment.tenant)
    if (operation === 'create' && !merged.cohort) data.cohort = idOf(assignment.cohort)
    const rawChanged = 'scoreInput' in data && String(data.scoreInput ?? '') !== String(originalDoc?.scoreInput ?? '')
    const feedbackChanged = 'feedback' in data && lexicalToPlainText(data.feedback) !== lexicalToPlainText(originalDoc?.feedback)
    if (rawChanged) {
      const raw = String(data.scoreInput ?? '').trim()
      if (raw === '') {
        data.score = null
        data.scoreInput = null
      } else {
        const parsed = parseScore(raw, assignment.maxScore)
        if (!parsed.ok) throwFieldErrors('submissions', [{ path: 'scoreInput', message: parsed.message }])
        else {
          data.score = parsed.value
          data.scoreInput = String(parsed.value)
        }
      }
    }
    if ((rawChanged || feedbackChanged) && req.user && !isSystemWrite(req)) {
      data.gradedBy = req.user.id
      data.gradedAt = new Date().toISOString()
    }
  }
  const score = 'score' in data ? data.score : originalDoc?.score
  data.status = score == null ? (merged.submittedAt ? 'submitted' : 'missing') : 'graded'
  return data
}

/**
 * A student's work on an assignment (phase-2 §C2–C5). One per assignment + student. Students create and edit
 * their own only through the submit action (enrollment, deadline and file checks); graders work in /admin.
 */
export const Submissions: CollectionConfig = {
  slug: 'submissions',
  labels: { singular: { fa: 'تحویل تکلیف', en: 'Submission' }, plural: { fa: 'تحویل تکالیف (نمره‌دهی)', en: 'Submissions (grading)' } },
  admin: {
    defaultColumns: ['user', 'assignment', 'status', 'late', 'submittedAt', 'score', 'gradedAt'],
    group: { fa: 'آزمون و تکلیف', en: 'Quizzes & assignments' },
    description: 'Grading queue: filter by assignment, cohort, status or late. Oldest first.',
    listSearchableFields: ['text'],
  },
  defaultSort: 'submittedAt',
  access: {
    read: anyOf(ownRecords('user'), allow('submissions.grade', SCOPE)),
    // Graders may record a grade without a submission (e.g. 0 for a missed deadline, C4).
    create: allowCreate('submissions.grade'),
    update: allow('submissions.grade', SCOPE),
    delete: nobody,
  },
  indexes: [{ fields: ['assignment', 'user'], unique: true }],
  hooks: {
    beforeChange: [applyGrade, guard({ create: ['submissions.grade'], update: ['submissions.grade'], fields: SCOPE })],
    afterChange: [auditChange('submissions')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'assignment', type: 'relationship', relationTo: 'assignments', required: true, index: true, label: { fa: 'تکلیف', en: 'Assignment' } },
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true, label: { fa: 'دانشجو', en: 'Student' } },
        { name: 'enrollment', type: 'relationship', relationTo: 'enrollments', label: { fa: 'ثبت‌نام', en: 'Enrollment' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'course', type: 'relationship', relationTo: 'courses', index: true, admin: { readOnly: true } },
        { name: 'cohort', type: 'relationship', relationTo: 'cohorts', index: true, admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          defaultValue: 'submitted',
          index: true,
          label: { fa: 'وضعیت', en: 'Status' },
          admin: { readOnly: true },
          options: [
            { value: 'submitted', label: { fa: 'در انتظار نمره', en: 'Submitted' } },
            { value: 'graded', label: { fa: 'نمره داده شد', en: 'Graded' } },
            { value: 'missing', label: { fa: 'تحویل نشده', en: 'Not submitted' } },
          ],
        },
        { name: 'late', type: 'checkbox', defaultValue: false, index: true, label: { fa: 'با تأخیر', en: 'Late' }, admin: { readOnly: true } },
        { name: 'submittedAt', type: 'date', index: true, label: { fa: 'زمان تحویل', en: 'Submitted at' }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    { name: 'text', type: 'textarea', label: { fa: 'متن پاسخ', en: 'Answer text' }, admin: { readOnly: true } },
    {
      name: 'files',
      type: 'relationship',
      relationTo: 'submission-files',
      hasMany: true,
      label: { fa: 'فایل‌ها', en: 'Files' },
      admin: { readOnly: true, description: 'Download from the file record (opens the protected download link).' },
    },
    {
      type: 'collapsible',
      label: { fa: 'نمره‌دهی', en: 'Grading' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'scoreInput',
              type: 'text',
              label: { fa: 'نمره', en: 'Score' },
              access: { update: gradeField, create: gradeField },
              admin: { description: 'e.g. ۱۸٫۵ or 18.5 — empty = not graded.' },
            },
            { name: 'score', type: 'number', label: { fa: 'نمرهٔ ثبت‌شده', en: 'Stored score' }, access: { update: () => false, create: () => false }, admin: { readOnly: true } },
          ],
        },
        richTextField({ name: 'feedback', label: { fa: 'بازخورد', en: 'Feedback' }, access: { update: gradeField, create: gradeField } }),
        {
          type: 'row',
          fields: [
            { name: 'gradedBy', type: 'relationship', relationTo: 'users', label: { fa: 'نمره‌دهنده', en: 'Graded by' }, access: { update: () => false, create: () => false }, admin: { readOnly: true } },
            { name: 'gradedAt', type: 'date', label: { fa: 'زمان نمره‌دهی', en: 'Graded at' }, access: { update: () => false, create: () => false }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
          ],
        },
      ],
    },
  ],
}
