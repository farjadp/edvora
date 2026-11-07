import { formatJalali, lessonUnlockAt, validateDripRule, type DripMode } from '@edvora/core'
import type { CollectionBeforeValidateHook, CollectionConfig, FieldAccess } from 'payload'
import { allow, allowCreate, anyone, fieldAllow, guard, nobody } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'
import { throwFieldErrors } from '../lib/validation'
import { richTextField } from '../lib/richText'

/**
 * Paid content (video, notes, resources) is never readable through the REST/GraphQL API by visitors or students:
 * the learn pages read it server-side after checking enrollment and drip (phase-2 §R3). Staff who edit or view
 * courses still see it in /admin.
 */
const contentRead: FieldAccess = async (args) => (await fieldAllow('lessons.edit')(args)) || (await fieldAllow('courses.view')(args))

export const DRIP_MODE_OPTIONS: { value: DripMode; label: { fa: string; en: string } }[] = [
  { value: 'none', label: { fa: 'بدون زمان‌بندی (باز پس از ثبت‌نام)', en: 'None (open once enrolled)' } },
  { value: 'fixedDate', label: { fa: 'تاریخ مشخص', en: 'Fixed date' } },
  { value: 'afterEnrollment', label: { fa: 'چند روز پس از ثبت‌نام', en: 'N days after enrollment' } },
  { value: 'afterCohortStart', label: { fa: 'چند روز پس از شروع ورودی', en: 'N days after cohort start' } },
  { value: 'afterPrevious', label: { fa: 'پس از تکمیل جلسهٔ قبل', en: 'After the previous lesson' } },
]

type DripData = { mode?: DripMode | null; days?: number | null; releaseAt?: string | null }

/** R1: validate the rule; "after previous" is refused on the first lesson of the course. */
const validateDrip: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as { course?: unknown; order?: number; id?: number; drip?: DripData }
  const drip = merged.drip ?? {}
  if ((drip.mode ?? 'none') === 'none') return data
  let isFirstLesson = false
  if (drip.mode === 'afterPrevious') {
    const courseId = idOf(merged.course)
    const earlier = courseId
      ? await req.payload.count({
          collection: 'lessons',
          where: { and: [{ course: { equals: courseId } }, { order: { less_than: merged.order ?? 1 } }, ...(merged.id ? [{ id: { not_equals: merged.id } }] : [])] },
          overrideAccess: true,
          req,
        })
      : { totalDocs: 0 }
    isFirstLesson = earlier.totalDocs === 0
  }
  throwFieldErrors('lessons', validateDripRule(drip, { isFirstLesson }))
  return data
}

/** Admin hint (R1): when this lesson opens for a student who enrols today. */
function dripPreview(drip: DripData | undefined, isFreePreview: boolean): string {
  if (isFreePreview) return 'جلسهٔ رایگان است: زمان‌بندی برای آن اعمال نمی‌شود (برای همه باز است).'
  const mode = drip?.mode ?? 'none'
  if (mode === 'none') return 'بلافاصله پس از ثبت‌نام باز است.'
  if (mode === 'afterPrevious') return 'پس از تکمیل جلسهٔ قبل (و قبولی در آزمون الزامی آن) باز می‌شود.'
  const now = new Date()
  const at = lessonUnlockAt(drip, { enrolledAt: now, cohortStart: null })
  if (!at) return ''
  const when = `برای دانشجویی که امروز ثبت‌نام کند: ${formatJalali(at, 'd MMMM yyyy، HH:mm')} (وقت تهران)`
  return mode === 'afterCohortStart' ? `${when} — از تاریخ شروع ورودی حساب می‌شود؛ ثبت‌نام‌های بدون ورودی از تاریخ ثبت‌نام.` : when
}

export const Lessons: CollectionConfig = {
  slug: 'lessons',
  labels: { singular: { fa: 'جلسه', en: 'Lesson' }, plural: { fa: 'جلسات', en: 'Lessons' } },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'course', 'module', 'order', 'drip.mode'], group: { fa: 'آموزش', en: 'Learning' } },
  access: {
    // Outline fields (title, order, module, duration, free preview, drip rule) are public for course pages.
    // Paid content fields are restricted below (contentRead).
    read: anyone,
    create: allowCreate('lessons.edit'),
    update: allow('lessons.edit', { course: 'course' }),
    delete: nobody,
  },
  hooks: {
    beforeValidate: [validateDrip],
    beforeChange: [guard({ create: ['lessons.edit'], update: ['lessons.edit'], fields: { course: 'course' } })],
    afterChange: [auditChange('lessons')],
  },
  fields: [
    { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true },
    { name: 'title', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'module', type: 'text', admin: { description: 'Module / section name' } },
        { name: 'order', type: 'number', required: true, defaultValue: 1 },
        { name: 'durationMinutes', type: 'number', min: 0 },
        { name: 'isFreePreview', type: 'checkbox', label: { fa: 'جلسه رایگان', en: 'Free preview' }, admin: { description: 'Free previews ignore drip (public).' } },
      ],
    },
    {
      name: 'videoUrl',
      type: 'text',
      access: { read: contentRead },
      admin: { description: 'HLS URL from ArvanCloud VOD. Served signed + watermarked in production.' },
    },
    richTextField({ name: 'notes', label: { fa: 'یادداشت جلسه', en: 'Lesson notes' }, access: { read: contentRead } }),
    {
      name: 'resources',
      type: 'array',
      label: { fa: 'منابع', en: 'Resources' },
      access: { read: contentRead },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'file', type: 'upload', relationTo: 'media' },
      ],
    },
    {
      name: 'drip',
      type: 'group',
      label: { fa: 'زمان‌بندی انتشار', en: 'Release schedule (drip)' },
      admin: { description: 'Unlock time is computed for each student when they open the course; a lesson already opened is never locked again.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'mode', type: 'select', defaultValue: 'none', label: { fa: 'قانون', en: 'Rule' }, options: DRIP_MODE_OPTIONS },
            {
              name: 'days',
              type: 'number',
              min: 0,
              label: { fa: 'تعداد روز', en: 'Days' },
              admin: {
                description: '0 = the same day. Days start at 00:00 Tehran time.',
                condition: (_, s) => s?.mode === 'afterEnrollment' || s?.mode === 'afterCohortStart',
              },
            },
            {
              name: 'releaseAt',
              type: 'date',
              timezone: true,
              label: { fa: 'تاریخ و ساعت انتشار', en: 'Release at' },
              admin: { date: { pickerAppearance: 'dayAndTime' }, condition: (_, s) => s?.mode === 'fixedDate' },
            },
          ],
        },
        {
          name: 'preview',
          type: 'text',
          virtual: true,
          label: { fa: 'پیش‌نمایش', en: 'Preview' },
          admin: { readOnly: true },
          hooks: {
            afterRead: [({ siblingData, data }) => dripPreview(siblingData as DripData | undefined, Boolean((data as { isFreePreview?: boolean } | undefined)?.isFreePreview))],
          },
        },
      ],
    },
  ],
}
