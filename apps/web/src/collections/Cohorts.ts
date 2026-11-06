import type { CollectionConfig } from 'payload'
import { admins, anyone } from '../access/roles'

export const Cohorts: CollectionConfig = {
  slug: 'cohorts',
  labels: { singular: { fa: 'دوره برگزاری', en: 'Cohort' }, plural: { fa: 'دوره‌های برگزاری', en: 'Cohorts' } },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'course', 'startDate', 'status'], group: { fa: 'آموزش', en: 'Learning' } },
  access: { read: anyone, create: admins, update: admins, delete: admins },
  fields: [
    { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true },
    { name: 'title', type: 'text', required: true, admin: { description: 'e.g. ورودی هفدهم' } },
    {
      type: 'row',
      fields: [
        { name: 'startDate', type: 'date', required: true },
        { name: 'schedule', type: 'text', admin: { description: 'e.g. یکشنبه‌ها ۱۷ تا ۱۹' } },
        { name: 'seats', type: 'number', min: 0 },
        { name: 'seatsTaken', type: 'number', min: 0, defaultValue: 0 },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'mode',
          type: 'select',
          defaultValue: 'online',
          options: [
            { value: 'online', label: { fa: 'آنلاین', en: 'Online' } },
            { value: 'in-person', label: { fa: 'حضوری', en: 'In person' } },
            { value: 'hybrid', label: { fa: 'ترکیبی', en: 'Hybrid' } },
          ],
        },
        {
          name: 'status',
          type: 'select',
          defaultValue: 'open',
          options: [
            { value: 'preregistration', label: { fa: 'پیش‌ثبت‌نام', en: 'Pre-registration' } },
            { value: 'open', label: { fa: 'ثبت‌نام باز', en: 'Open' } },
            { value: 'full', label: { fa: 'تکمیل ظرفیت', en: 'Full' } },
            { value: 'running', label: { fa: 'در حال برگزاری', en: 'Running' } },
            { value: 'finished', label: { fa: 'پایان یافته', en: 'Finished' } },
          ],
        },
        { name: 'priceOverride', type: 'number', min: 0, admin: { description: 'Rials. Leave empty to use course price.' } },
      ],
    },
  ],
}
