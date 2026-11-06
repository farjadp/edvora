import type { CollectionConfig } from 'payload'
import { adminsOrInstructors, anyone } from '../access/roles'

export const Lessons: CollectionConfig = {
  slug: 'lessons',
  labels: { singular: { fa: 'جلسه', en: 'Lesson' }, plural: { fa: 'جلسات', en: 'Lessons' } },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'course', 'module', 'order'], group: { fa: 'آموزش', en: 'Learning' } },
  access: {
    // Metadata is public (playlist); the video URL is only handed out to enrolled students by the server.
    read: anyone,
    create: adminsOrInstructors,
    update: adminsOrInstructors,
    delete: adminsOrInstructors,
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
        { name: 'isFreePreview', type: 'checkbox', label: { fa: 'جلسه رایگان', en: 'Free preview' } },
      ],
    },
    {
      name: 'videoUrl',
      type: 'text',
      admin: { description: 'HLS URL from ArvanCloud VOD. Served signed + watermarked in production.' },
    },
    { name: 'notes', type: 'textarea', label: { fa: 'یادداشت جلسه', en: 'Lesson notes' } },
    {
      name: 'resources',
      type: 'array',
      label: { fa: 'منابع', en: 'Resources' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'file', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
