import type { CollectionConfig } from 'payload'
import { allow, allowCreate, anyone, guard, nobody, requireForFields } from '../access/permissions'
import { auditChange } from '../hooks/audit'

export const Testimonials: CollectionConfig = {
  slug: 'testimonials',
  labels: { singular: { fa: 'روایت دانش‌آموخته', en: 'Testimonial' }, plural: { fa: 'روایت دانش‌آموختگان', en: 'Testimonials' } },
  admin: { useAsTitle: 'name', group: { fa: 'محتوا', en: 'Content' } },
  access: { read: anyone, create: allowCreate('content.edit'), update: allow('content.edit'), delete: nobody },
  hooks: {
    beforeChange: [guard({ create: ['content.edit'], update: ['content.edit'] }), requireForFields(['approvedForUse'], 'content.publish', (a, b) => Boolean(a) !== Boolean(b))],
    afterChange: [auditChange('testimonials')],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'role', type: 'text', admin: { description: 'e.g. مدیرعامل فرش امارات' } },
    { name: 'quote', type: 'textarea' },
    { name: 'videoUrl', type: 'text' },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    { name: 'approvedForUse', type: 'checkbox', defaultValue: false, admin: { description: 'Only approved testimonials are shown.' } },
  ],
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: { fa: 'مقاله', en: 'Article' }, plural: { fa: 'مجله', en: 'Journal' } },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'author', 'publishedAt'], group: { fa: 'محتوا', en: 'Content' } },
  access: { read: anyone, create: allowCreate('content.edit'), update: allow('content.edit'), delete: nobody },
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
    { name: 'body', type: 'richText' },
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
