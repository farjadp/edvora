import { validateQuiz, type FieldError } from '@edvora/core'
import type { CollectionBeforeValidateHook, CollectionConfig, Where } from 'payload'
import { allow, allowCreate, anyOf, guard, nobody } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'
import { throwFieldErrors } from '../lib/validation'

const SCOPE = { course: 'course' }

type QuizData = {
  course?: unknown
  lesson?: unknown
  questions?: { question?: unknown }[] | null
  passMark?: number | null
  timeLimitMin?: number | null
  attemptsLimit?: number | null
}

/** Q2: questions from this course's bank, lesson of this course, sane limits. */
const validate: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as QuizData
  const courseId = idOf(merged.course)
  const questionIds = (merged.questions ?? []).map((q) => idOf(q.question)).filter((x): x is number => x !== null)
  const errors: FieldError[] = validateQuiz({
    questionCount: questionIds.length,
    passMark: merged.passMark,
    timeLimitMin: merged.timeLimitMin,
    attemptsLimit: merged.attemptsLimit,
  })
  const lessonId = idOf(merged.lesson)
  if (lessonId && courseId) {
    const lesson = await req.payload.findByID({ collection: 'lessons', id: lessonId, depth: 0, overrideAccess: true, req, disableErrors: true })
    if (!lesson || idOf(lesson.course) !== courseId) errors.push({ path: 'lesson', message: 'این جلسه متعلق به همین دوره نیست.' })
  }
  if (questionIds.length && courseId) {
    const found = await req.payload.find({ collection: 'questions', where: { id: { in: questionIds } }, depth: 0, limit: questionIds.length, pagination: false, overrideAccess: true, req })
    const before = new Set(((originalDoc as QuizData | undefined)?.questions ?? []).map((q) => idOf(q.question)))
    const bad = found.docs.some((q) => idOf(q.course) !== courseId) || found.docs.length !== new Set(questionIds).size
    // Archived questions stay in quizzes that already use them, but cannot be newly added (Q1).
    const archivedNew = found.docs.some((q) => q.archived && !before.has(q.id))
    if (bad) errors.push({ path: 'questions', message: 'همهٔ سؤال‌ها باید از بانک سؤال همین دوره باشند.' })
    else if (archivedNew) errors.push({ path: 'questions', message: 'سؤال بایگانی‌شده را نمی‌توان به آزمون اضافه کرد.' })
  }
  throwFieldErrors('quizzes', errors)
  return data
}

/**
 * A quiz attached to one lesson or to the whole course (phase-2 §Q2). Never public: students get questions only
 * through a server-built attempt without correct answers. Draft quizzes are invisible to students.
 */
export const Quizzes: CollectionConfig = {
  slug: 'quizzes',
  labels: { singular: { fa: 'آزمون', en: 'Quiz' }, plural: { fa: 'آزمون‌ها', en: 'Quizzes' } },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'course', 'lesson', 'status', 'required', 'passMark'],
    group: { fa: 'آزمون و تکلیف', en: 'Quizzes & assignments' },
    description: 'Changes apply only to attempts started afterwards: every attempt keeps a copy of its questions, points and answers.',
  },
  access: {
    read: anyOf(allow('quizzes.manage', SCOPE), allow('courses.view', SCOPE), allow('enrollments.view', SCOPE)),
    create: allowCreate('quizzes.manage'),
    update: allow('quizzes.manage', SCOPE),
    delete: nobody,
  },
  hooks: {
    beforeValidate: [validate],
    beforeChange: [guard({ create: ['quizzes.manage'], update: ['quizzes.manage'], fields: SCOPE })],
    afterChange: [auditChange('quizzes')],
  },
  fields: [
    { name: 'title', type: 'text', required: true, label: { fa: 'عنوان', en: 'Title' } },
    {
      type: 'row',
      fields: [
        { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true, label: { fa: 'دوره', en: 'Course' } },
        {
          name: 'lesson',
          type: 'relationship',
          relationTo: 'lessons',
          index: true,
          label: { fa: 'جلسه', en: 'Lesson' },
          admin: { description: 'Empty = course-level (final) quiz.' },
          filterOptions: ({ data }) => (idOf((data as QuizData | undefined)?.course) ? { course: { equals: idOf((data as QuizData).course) } } : true),
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'draft',
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
    { name: 'description', type: 'textarea', label: { fa: 'توضیح برای دانشجو', en: 'Instructions' } },
    {
      name: 'questions',
      type: 'array',
      label: { fa: 'سؤال‌ها', en: 'Questions' },
      minRows: 1,
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'question',
              type: 'relationship',
              relationTo: 'questions',
              required: true,
              filterOptions: ({ data }): Where => {
                const courseId = idOf((data as QuizData | undefined)?.course)
                const notArchived: Where = { archived: { not_equals: true } }
                return courseId ? { and: [{ course: { equals: courseId } }, notArchived] } : notArchived
              },
            },
            { name: 'points', type: 'number', min: 0, label: { fa: 'امتیاز', en: 'Points' }, admin: { description: 'Empty = points from the bank.' } },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'required', type: 'checkbox', defaultValue: false, label: { fa: 'الزامی (شرط تکمیل و گواهی)', en: 'Required for completion' } },
        { name: 'passMark', type: 'number', required: true, min: 1, max: 100, label: { fa: 'حد قبولی (٪)', en: 'Pass mark (%)' } },
        { name: 'attemptsLimit', type: 'number', min: 1, label: { fa: 'تعداد دفعات مجاز', en: 'Attempts' }, admin: { description: 'Empty = unlimited.' } },
        { name: 'timeLimitMin', type: 'number', min: 1, label: { fa: 'محدودیت زمان (دقیقه)', en: 'Time limit (min)' }, admin: { description: 'Empty = no limit.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'countedAttempt',
          type: 'select',
          defaultValue: 'best',
          label: { fa: 'نتیجهٔ ملاک', en: 'Counted attempt' },
          options: [
            { value: 'best', label: { fa: 'بهترین تلاش', en: 'Best' } },
            { value: 'last', label: { fa: 'آخرین تلاش', en: 'Last' } },
          ],
        },
        {
          name: 'review',
          type: 'select',
          defaultValue: 'wrongRight',
          label: { fa: 'نمایش پس از ارسال', en: 'Review after submit' },
          options: [
            { value: 'none', label: { fa: 'هیچ (فقط قبول/مردود)', en: 'Nothing (pass/fail only)' } },
            { value: 'score', label: { fa: 'فقط نمره', en: 'Score only' } },
            { value: 'wrongRight', label: { fa: 'نمره و درست/غلط هر سؤال', en: 'Score + right/wrong' } },
            { value: 'full', label: { fa: 'کامل با پاسخ درست', en: 'Full, with correct answers' } },
          ],
        },
        {
          name: 'fullReviewWhen',
          type: 'select',
          defaultValue: 'always',
          label: { fa: 'پاسخ درست نمایش داده شود', en: 'Show correct answers' },
          options: [
            { value: 'always', label: { fa: 'همیشه', en: 'Always' } },
            { value: 'afterPass', label: { fa: 'پس از قبولی', en: 'After passing' } },
            { value: 'afterLastAttempt', label: { fa: 'پس از آخرین فرصت', en: 'After the last attempt' } },
          ],
          admin: { condition: (_, s) => s?.review === 'full' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'partialCredit', type: 'checkbox', defaultValue: false, label: { fa: 'نمرهٔ نسبی برای چندگزینه‌ای', en: 'Proportional credit (multiple choice)' } },
        { name: 'allowRetakeAfterPass', type: 'checkbox', defaultValue: false, label: { fa: 'تکرار پس از قبولی', en: 'Allow retake after passing' } },
        { name: 'shuffle', type: 'checkbox', defaultValue: false, label: { fa: 'ترتیب تصادفی سؤال و گزینه', en: 'Shuffle questions and options' } },
      ],
    },
  ],
}
