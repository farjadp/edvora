import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { LEAD_STATUSES, LEAD_STATUS_LABELS_FA, canTransitionLead, nextFollowUpAt, type LeadStatus } from '@edvora/core'
import { allow, allowCreate, canIn, guard, isSystemWrite, nobody } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'

const SCOPE = { owner: 'advisor', course: 'course' }

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
    read: allow('leads.view', SCOPE),
    create: allowCreate('leads.create'),
    update: allow('leads.view', SCOPE),
    delete: nobody,
  },
  hooks: {
    afterChange: [auditChange('leads')],
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        if (!req.user || isSystemWrite(req) || !data) return data
        // A lead an advisor adds is theirs unless they may assign it.
        if (operation === 'create' && data.advisor == null) data.advisor = req.user.id
        const before = idOf(originalDoc?.advisor)
        const after = 'advisor' in data ? idOf(data.advisor) : before
        const reassigned = operation === 'create' ? after !== req.user.id : after !== before
        if (reassigned && !(await canIn(req, idOf(data.tenant ?? originalDoc?.tenant), 'leads.assign'))) {
          throw new APIError('Assigning leads to someone else needs leads.assign', 403)
        }
        return data
      },
      guard({ create: ['leads.create'], update: ['leads.view'], fields: SCOPE }),
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
        { name: 'advisor', type: 'relationship', relationTo: 'users', filterOptions: ({ data }) => ({ 'tenants.tenant': { equals: idOf(data?.tenant) ?? -1 } }) },
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
