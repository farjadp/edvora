import type { CollectionConfig } from 'payload'
import { allow, allowCreate, anyone, fieldAllow, guard, nobody, requireForFields } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { sourceUrlField } from './fields'

const staffOnly = fieldAllow('courses.edit')

export const COURSE_KINDS = [
  { value: 'program', label: { fa: 'دوره بلندمدت', en: 'Long program' } },
  { value: 'short', label: { fa: 'دوره کوتاه / کارگاه', en: 'Short course / workshop' } },
  { value: 'video', label: { fa: 'دوره ویدیویی', en: 'Video course' } },
  { value: 'bundle', label: { fa: 'بسته', en: 'Bundle' } },
] as const

export const Courses: CollectionConfig = {
  slug: 'courses',
  labels: { singular: { fa: 'دوره', en: 'Course' }, plural: { fa: 'دوره‌ها', en: 'Courses' } },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'kind', 'price', 'status'], group: { fa: 'آموزش', en: 'Learning' } },
  access: {
    // Public pages query through the server with explicit tenant + status filters.
    read: anyone,
    create: allowCreate('courses.edit'),
    update: allow('courses.edit', { course: 'id' }),
    delete: nobody,
  },
  hooks: {
    beforeChange: [
      guard({ create: ['courses.edit'], update: ['courses.edit'], fields: { course: 'id' } }),
      requireForFields(['price', 'maxInstalments'], 'pricing.edit', (a, b) => (a ?? null) !== (b ?? null) && !(a == null && (b === 0 || b === 1))),
      requireForFields(['status'], 'courses.publish', (a, b) => (a === 'published') !== (b === 'published')),
    ],
    afterChange: [auditChange('courses')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'title', type: 'text', required: true, label: { fa: 'عنوان', en: 'Title' } },
        { name: 'slug', type: 'text', required: true, index: true, admin: { description: 'URL: /courses/<slug>' } },
      ],
    },
    { name: 'subtitle', type: 'text', label: { fa: 'زیرعنوان', en: 'Subtitle' } },
    {
      type: 'row',
      fields: [
        { name: 'kind', type: 'select', required: true, defaultValue: 'program', options: [...COURSE_KINDS] },
        {
          name: 'programCode',
          type: 'text',
          admin: { description: 'For certificate codes, e.g. MBA → BA-MBA-181' },
          validate: (v: unknown) => !v || (typeof v === 'string' && /^[A-Z]{2,8}$/.test(v)) || '2–8 capital letters',
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'draft',
          options: [
            { value: 'draft', label: { fa: 'پیش‌نویس', en: 'Draft' } },
            { value: 'published', label: { fa: 'منتشر شده', en: 'Published' } },
          ],
        },
      ],
    },
    { name: 'heroImage', type: 'upload', relationTo: 'media' },
    sourceUrlField,
    {
      name: 'pendingClaims',
      type: 'array',
      label: { fa: 'ادعاهای تأییدنشده (منتشر نمی‌شود)', en: 'Unverified claims (never published)' },
      // Staff-only: never returned by the public API and never rendered on public pages.
      access: { read: staffOnly, create: staffOnly, update: staffOnly },
      admin: {
        position: 'sidebar',
        description: { fa: 'متن‌هایی که تا تأیید نشده‌اند نباید در سایت بیایند.', en: 'Copy that must stay off the site until verified.' },
      },
      fields: [
        { name: 'text', type: 'textarea', required: true },
        { name: 'note', type: 'text' },
        { name: 'sourceUrl', type: 'text' },
      ],
    },
    { name: 'summary', type: 'textarea', label: { fa: 'خلاصه', en: 'Summary' } },
    {
      type: 'row',
      fields: [
        {
          name: 'price',
          type: 'number',
          required: true,
          min: 0,
          admin: { description: 'In RIALS (integer). 8,470,000 toman = 84,700,000 rials.' },
          validate: (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) || 'Integer rials only',
        },
        { name: 'maxInstalments', type: 'number', min: 1, max: 12, defaultValue: 1, label: { fa: 'حداکثر اقساط', en: 'Max instalments' } },
        { name: 'durationLabel', type: 'text', label: { fa: 'مدت', en: 'Duration' }, admin: { description: 'e.g. ۴ ماه' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'featured', type: 'checkbox', label: { fa: 'ویژه در صفحه اصلی', en: 'Featured on homepage' } },
        { name: 'requiresDefense', type: 'checkbox', label: { fa: 'نیاز به دفاع نهایی', en: 'Requires final defense' } },
        { name: 'sortOrder', type: 'number', defaultValue: 0 },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { fa: 'مخاطب و نتیجه', en: 'Audience & outcomes' },
          fields: [
            {
              name: 'audience',
              type: 'array',
              label: { fa: 'این دوره برای کیست', en: 'Who is this for' },
              fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'text', type: 'textarea' },
              ],
            },
            { name: 'outcomes', type: 'array', label: { fa: 'در پایان دوره', en: 'What you get' }, fields: [{ name: 'text', type: 'text', required: true }] },
          ],
        },
        {
          label: { fa: 'سرفصل', en: 'Syllabus' },
          fields: [
            {
              name: 'syllabus',
              type: 'array',
              fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'description', type: 'textarea' },
                { name: 'hours', type: 'number' },
              ],
            },
          ],
        },
        {
          label: { fa: 'اساتید', en: 'Faculty' },
          fields: [
            {
              name: 'faculty',
              type: 'array',
              fields: [
                { name: 'name', type: 'text', required: true },
                { name: 'role', type: 'text' },
                { name: 'photo', type: 'upload', relationTo: 'media' },
              ],
            },
          ],
        },
        {
          label: { fa: 'پرسش‌های متداول', en: 'FAQ' },
          fields: [
            {
              name: 'faq',
              type: 'array',
              fields: [
                { name: 'question', type: 'text', required: true },
                { name: 'answer', type: 'textarea', required: true },
              ],
            },
          ],
        },
      ],
    },
  ],
}
