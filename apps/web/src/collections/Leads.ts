import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { LEAD_STATUSES, LEAD_STATUS_LABELS_FA, canTransitionLead, nextFollowUpAt, type LeadStatus } from '@edvora/core'
import { adminsOrAdvisors, admins } from '../access/roles'

/** Lead CRM for advisors: form → queue → call → notes → enrolled / lost. */
export const Leads: CollectionConfig = {
  slug: 'leads',
  labels: { singular: { fa: 'سرنخ', en: 'Lead' }, plural: { fa: 'سرنخ‌ها (CRM)', en: 'Leads (CRM)' } },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'phone', 'course', 'status', 'advisor', 'nextFollowUpAt'],
    group: { fa: 'فروش', en: 'Sales' },
  },
  access: {
    // Public lead forms create leads through a server action, never through the open API.
    read: adminsOrAdvisors,
    create: adminsOrAdvisors,
    update: adminsOrAdvisors,
    delete: admins,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        const from = (originalDoc?.status ?? 'new') as LeadStatus
        const to = (data.status ?? from) as LeadStatus
        if (operation === 'update' && !canTransitionLead(from, to)) {
          throw new APIError(`Lead cannot move from "${from}" to "${to}"`, 400)
        }
        if (operation === 'create' || from !== to) {
          data.nextFollowUpAt = nextFollowUpAt(to)?.toISOString() ?? null
        }
        return data
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, label: { fa: 'نام', en: 'Name' } },
        { name: 'phone', type: 'text', required: true, index: true, label: { fa: 'موبایل', en: 'Mobile' } },
      ],
    },
    { name: 'course', type: 'relationship', relationTo: 'courses' },
    { name: 'message', type: 'textarea' },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'new',
          index: true,
          options: LEAD_STATUSES.map((s) => ({ value: s, label: { fa: LEAD_STATUS_LABELS_FA[s], en: s } })),
        },
        { name: 'advisor', type: 'relationship', relationTo: 'users', filterOptions: { roles: { in: ['advisor', 'admin'] } } },
        { name: 'nextFollowUpAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    {
      name: 'source',
      type: 'group',
      fields: [
        { name: 'page', type: 'text' },
        { name: 'utmSource', type: 'text' },
        { name: 'utmCampaign', type: 'text' },
      ],
    },
    {
      name: 'activities',
      type: 'array',
      label: { fa: 'تماس‌ها و یادداشت‌ها', en: 'Calls & notes' },
      fields: [
        {
          name: 'kind',
          type: 'select',
          defaultValue: 'call',
          options: [
            { value: 'call', label: { fa: 'تماس', en: 'Call' } },
            { value: 'note', label: { fa: 'یادداشت', en: 'Note' } },
            { value: 'sms', label: 'SMS' },
          ],
        },
        { name: 'text', type: 'textarea', required: true },
        { name: 'at', type: 'date', defaultValue: () => new Date().toISOString() },
      ],
    },
  ],
}
