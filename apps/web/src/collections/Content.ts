import type { CollectionConfig } from 'payload'
import { allow, allowCreate, anyOf, fieldAllow, guard, nobody, requireForFields } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { richTextField } from '../lib/richText'
import { isPageSlugShape, isReservedPageSlug } from '../lib/pageSlugs'
import { sourceUrlField } from './fields'

export const Testimonials: CollectionConfig = {
  slug: 'testimonials',
  labels: { singular: { fa: 'روایت دانش‌آموخته', en: 'Testimonial' }, plural: { fa: 'روایت دانش‌آموختگان', en: 'Testimonials' } },
  admin: { useAsTitle: 'name', group: { fa: 'محتوا', en: 'Content' } },
  // Public: approved testimonials only. Staff with content.edit see everything.
  access: { read: anyOf(() => ({ approvedForUse: { equals: true } }), allow('content.edit')), create: allowCreate('content.edit'), update: allow('content.edit'), delete: nobody },
  hooks: {
    beforeChange: [guard({ create: ['content.edit'], update: ['content.edit'] }), requireForFields(['approvedForUse'], 'content.publish', (a, b) => Boolean(a) !== Boolean(b))],
    afterChange: [auditChange('testimonials')],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'role', type: 'text', admin: { description: 'e.g. مدیرعامل فرش عمارت' } },
    { name: 'quote', type: 'textarea' },
    { name: 'videoUrl', type: 'text' },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    { name: 'approvedForUse', type: 'checkbox', defaultValue: false, admin: { description: 'Only approved testimonials are shown.' } },
    { name: 'consentNote', type: 'text', access: { read: fieldAllow('content.edit') }, admin: { description: 'Where consent for reuse comes from / what is still to confirm.' } },
    { name: 'sortOrder', type: 'number', defaultValue: 0 },
    sourceUrlField,
  ],
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: { fa: 'مقاله', en: 'Article' }, plural: { fa: 'مجله', en: 'Journal' } },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'author', 'publishedAt'], group: { fa: 'محتوا', en: 'Content' } },
  // Public: posts with a publish date in the past. No publishedAt = draft/held (staff only).
  access: {
    read: anyOf(() => ({ publishedAt: { less_than_equal: new Date().toISOString() } }), allow('content.edit')),
    create: allowCreate('content.edit'),
    update: allow('content.edit'),
    delete: nobody,
  },
  hooks: {
    beforeChange: [guard({ create: ['content.edit'], update: ['content.edit'] }), requireForFields(['publishedAt'], 'content.publish')],
    afterChange: [auditChange('posts')],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    { name: 'excerpt', type: 'textarea' },
    { name: 'cover', type: 'upload', relationTo: 'media' },
    { name: 'author', type: 'text' },
    { name: 'publishedAt', type: 'date' },
    richTextField({ name: 'body' }),
    sourceUrlField,
  ],
}

/** Simple content pages per academy (about, FAQ, regulations, contact…). Shown at /<slug> when published, via the
 * catch-all route `app/(frontend)/[...wpPath]` (which also serves imported WordPress redirects). */
export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: { fa: 'صفحه', en: 'Page' }, plural: { fa: 'صفحه‌ها', en: 'Pages' } },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', 'status'], group: { fa: 'محتوا', en: 'Content' } },
  // Drafts (e.g. pages holding unverified claims) are visible to content staff only, never via the open API.
  access: { read: anyOf(() => ({ status: { equals: 'published' } }), allow('content.edit')), create: allowCreate('content.edit'), update: allow('content.edit'), delete: nobody },
  hooks: {
    beforeChange: [
      guard({ create: ['content.edit'], update: ['content.edit'] }),
      requireForFields(['status'], 'content.publish', (a, b) => (a === 'published') !== (b === 'published')),
    ],
    afterChange: [auditChange('pages')],
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      validate: (v: unknown) =>
        // Persian slugs are allowed (WordPress pages often have them); the catch-all route serves /<slug>.
        typeof v !== 'string' || !isPageSlugShape(v)
          ? 'lowercase letters (any script), digits and dashes'
          : isReservedPageSlug(v)
            ? `"${v}" is already a site address`
            : true,
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
    { name: 'showInNav', type: 'checkbox', defaultValue: false, label: { fa: 'در منوی سایت', en: 'Show in site menu' } },
    { name: 'sortOrder', type: 'number', defaultValue: 0 },
    { name: 'intro', type: 'textarea' },
    { name: 'cover', type: 'upload', relationTo: 'media' },
    richTextField({ name: 'body' }),
    {
      name: 'faq',
      type: 'array',
      fields: [
        { name: 'question', type: 'text', required: true },
        richTextField({ name: 'answer', required: true }),
      ],
    },
    sourceUrlField,
  ],
}

/** SMS login codes. Never exposed through the API; only the server touches this. */
export const OtpCodes: CollectionConfig = {
  slug: 'otp-codes',
  admin: { hidden: true },
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'phone', type: 'text', required: true, index: true },
    { name: 'codeHash', type: 'text', required: true },
    { name: 'expiresAt', type: 'date', required: true },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'consumed', type: 'checkbox', defaultValue: false },
  ],
}
