import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { allow, allowCreate, anyOf, guard, nobody, ownRecords } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'
import { throwFieldErrors } from '../lib/validation'

const SCOPE = { course: 'course', cohort: 'cohort' }

/** The cohort must belong to the session's course (and so to the same academy). */
const checkCohort: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (!data) return data
  const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
  const cohortId = idOf(merged.cohort)
  const courseId = idOf(merged.course)
  if (cohortId && courseId) {
    const cohort = await req.payload.findByID({ collection: 'cohorts', id: cohortId, depth: 0, overrideAccess: true, req, disableErrors: true })
    if (!cohort || idOf(cohort.course) !== courseId) {
      throwFieldErrors('live-sessions', [{ path: 'cohort', message: 'این گروه متعلق به این دوره نیست.' }])
    }
  }
  return data
}

/**
 * A scheduled live class (phase-2 §D, ADR 012). Edvora owns the schedule and who may join; the provider
 * (BigBlueButton) owns the media. Provider fields are written only by server code.
 */
export const LiveSessions: CollectionConfig = {
  slug: 'live-sessions',
  labels: { singular: { fa: 'کلاس زنده', en: 'Live class' }, plural: { fa: 'کلاس‌های زنده', en: 'Live classes' } },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'course', 'cohort', 'startsAt', 'status'], group: { fa: 'آموزش', en: 'Learning' } },
  defaultSort: '-startsAt',
  access: {
    read: anyOf(allow('live.host', SCOPE), allow('cohorts.manage', SCOPE), allow('enrollments.view', SCOPE)),
    create: allowCreate('cohorts.manage'),
    update: anyOf(allow('cohorts.manage', SCOPE), allow('live.host', SCOPE)),
    delete: nobody,
  },
  hooks: {
    beforeChange: [guard({ create: ['cohorts.manage'], update: ['cohorts.manage', 'live.host'], fields: SCOPE }), checkCohort],
    afterChange: [auditChange('live-sessions')],
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
          label: { fa: 'گروه', en: 'Cohort' },
          admin: { description: 'Empty = every active student of the course may join.' },
        },
        { name: 'instructor', type: 'relationship', relationTo: 'users', index: true, label: { fa: 'مدرس', en: 'Instructor' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startsAt',
          type: 'date',
          required: true,
          index: true,
          label: { fa: 'شروع', en: 'Starts at' },
          admin: { date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' }, description: 'Stored in UTC, shown in Tehran time on the site.' },
        },
        { name: 'durationMin', type: 'number', required: true, defaultValue: 90, min: 15, max: 600, label: { fa: 'مدت (دقیقه)', en: 'Duration (min)' } },
        { name: 'joinWindowMin', type: 'number', defaultValue: 10, min: 0, max: 60, label: { fa: 'ورود از چند دقیقه قبل', en: 'Join opens (min before)' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          defaultValue: 'scheduled',
          index: true,
          label: { fa: 'وضعیت', en: 'Status' },
          options: [
            { value: 'scheduled', label: { fa: 'زمان‌بندی‌شده', en: 'Scheduled' } },
            { value: 'live', label: { fa: 'در حال برگزاری', en: 'Live' } },
            { value: 'ended', label: { fa: 'پایان یافته', en: 'Ended' } },
            { value: 'cancelled', label: { fa: 'لغو شده', en: 'Cancelled' } },
          ],
        },
        { name: 'record', type: 'checkbox', defaultValue: true, label: { fa: 'ضبط کلاس', en: 'Record' } },
        { name: 'waitingRoom', type: 'checkbox', defaultValue: false, label: { fa: 'اتاق انتظار', en: 'Waiting room' } },
      ],
    },
    {
      type: 'collapsible',
      label: { fa: 'اطلاعات سرویس کلاس (خودکار)', en: 'Provider data (automatic)' },
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'provider', type: 'text', admin: { readOnly: true } },
            { name: 'providerRoomId', type: 'text', index: true, admin: { readOnly: true } },
            { name: 'createTime', type: 'text', admin: { readOnly: true, description: 'Changes each time the provider re-creates the room.' } },
          ],
        },
        {
          name: 'recordings',
          type: 'array',
          label: { fa: 'ضبط‌ها', en: 'Recordings' },
          admin: { readOnly: true, description: 'Added when the provider reports a recording, then copied to our object storage (E-017). Students of the session watch it from the course page.' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'providerRecordingId', type: 'text', required: true },
                { name: 'format', type: 'text' },
                { name: 'durationSec', type: 'number' },
                {
                  name: 'status',
                  type: 'select',
                  defaultValue: 'ready',
                  options: [
                    { value: 'ready', label: { fa: 'آماده نزد سرویس', en: 'Ready at provider' } },
                    { value: 'waiting', label: { fa: 'در انتظار فایل MP4', en: 'Waiting for MP4' } },
                    { value: 'copying', label: { fa: 'در حال کپی', en: 'Copying' } },
                    { value: 'copied', label: { fa: 'آماده تماشا', en: 'Copied' } },
                    { value: 'failed', label: { fa: 'خطا', en: 'Failed' } },
                  ],
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'storageKey', type: 'text', admin: { description: 'Key in our private bucket. Played only through /live/<id>/recording/<rid>.' } },
                { name: 'sizeBytes', type: 'number' },
                { name: 'copiedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
              ],
            },
            { name: 'error', type: 'text' },
            { name: 'url', type: 'text', admin: { description: 'Provider URL (may expire). Not shown to students.' } },
            { name: 'lesson', type: 'relationship', relationTo: 'lessons' },
          ],
        },
      ],
    },
  ],
}

/** One row per student per session (phase-2 D5). Provider events fill it; a person can correct it (source → manual). */
export const Attendance: CollectionConfig = {
  slug: 'attendance',
  labels: { singular: { fa: 'حضور و غیاب', en: 'Attendance' }, plural: { fa: 'حضور و غیاب', en: 'Attendance' } },
  admin: { defaultColumns: ['session', 'user', 'minutes', 'joinedAt', 'leftAt', 'source'], group: { fa: 'آموزش', en: 'Learning' } },
  access: {
    read: anyOf(allow('live.host', SCOPE), allow('enrollments.view', SCOPE), ownRecords('user')),
    create: allowCreate('live.host'),
    update: allow('live.host', SCOPE),
    delete: nobody,
  },
  indexes: [{ fields: ['session', 'user'], unique: true }],
  hooks: {
    beforeChange: [
      guard({ create: ['live.host'], update: ['live.host'], fields: SCOPE }),
      // A person editing the numbers turns the row into a manual correction the provider never overwrites.
      async ({ data, originalDoc, req, context }) => {
        if (!data || context.liveSystem === true || !req.user) return data
        const edited = ['minutes', 'joinedAt', 'leftAt'].some((k) => k in data && JSON.stringify(data[k]) !== JSON.stringify(originalDoc?.[k]))
        if (edited) data.source = 'manual'
        return data
      },
    ],
    afterChange: [auditChange('attendance')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'session', type: 'relationship', relationTo: 'live-sessions', required: true, index: true, label: { fa: 'کلاس', en: 'Session' } },
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true, label: { fa: 'دانشجو', en: 'Student' } },
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
        { name: 'joinedAt', type: 'date', label: { fa: 'ورود', en: 'Joined' }, admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'leftAt', type: 'date', label: { fa: 'خروج', en: 'Left' }, admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'minutes', type: 'number', min: 0, defaultValue: 0, label: { fa: 'دقیقهٔ حضور', en: 'Minutes present' } },
      ],
    },
    { name: 'openSince', type: 'date', admin: { hidden: true } },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'webhook',
      label: { fa: 'منبع', en: 'Source' },
      admin: { readOnly: true },
      options: [
        { value: 'webhook', label: { fa: 'رویداد سرویس', en: 'Provider events' } },
        { value: 'summary', label: { fa: 'گزارش پایان کلاس', en: 'End-of-class report' } },
        { value: 'manual', label: { fa: 'اصلاح دستی', en: 'Manual' } },
        { value: 'import', label: { fa: 'ورود از فایل', en: 'Import' } },
      ],
    },
  ],
}

/** Provider webhook events already processed: dedupe and replay protection (ADR 012). Server code only. */
export const LiveEvents: CollectionConfig = {
  slug: 'live-events',
  labels: { singular: { fa: 'رویداد کلاس', en: 'Live event' }, plural: { fa: 'رویدادهای کلاس', en: 'Live events' } },
  admin: { hidden: true },
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  indexes: [{ fields: ['tenant', 'provider', 'eventId'], unique: true }],
  fields: [
    { name: 'provider', type: 'text', required: true },
    { name: 'eventId', type: 'text', required: true },
    { name: 'type', type: 'text', required: true },
    { name: 'session', type: 'relationship', relationTo: 'live-sessions', index: true },
    { name: 'occurredAt', type: 'date' },
  ],
}
