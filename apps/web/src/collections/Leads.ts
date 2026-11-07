import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { DATE_MOVED, STATUS_CHANGED, LEAD_OUTCOMES, LEAD_OUTCOME_LABELS_FA, LEAD_STATUSES, LEAD_STATUS_LABELS_FA, canTransitionLead, nextFollowUpAt, type LeadStatus } from '@edvora/core'
import type { CollectionBeforeChangeHook } from 'payload'
import { allow, allowCreate, canIn, guard, isSystemWrite, nobody } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'

const SCOPE = { owner: 'advisor', course: 'course' }

/** Set by `recordFollowUpOutcome` (server action) — the only writer of the follow-up log. */
export const FOLLOW_UP_CONTEXT = 'edvoraFollowUpOutcome'
const OUTCOME_FIELDS = ['lastOutcome', 'lastOutcomeAt', 'lastOutcomeBy', 'followUps'] as const

const sameInstant = (a: unknown, b: unknown) => {
  const ta = a ? new Date(a as string).getTime() : null
  const tb = b ? new Date(b as string).getTime() : null
  return ta === tb
}

/**
 * E-028 T6: outcomes are recorded only through the server action (`recordFollowUpOutcome`). Edits in /admin cannot
 * write the log directly.
 */
const protectFollowUpLog: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (!data || isSystemWrite(req) || req.context[FOLLOW_UP_CONTEXT] === true) return data
  for (const f of OUTCOME_FIELDS) {
    if (operation === 'create') delete data[f]
    else data[f] = originalDoc?.[f]
  }
  return data
}

/**
 * Runs last. A follow-up that was already due and is changed in /admin without the outcome action is logged:
 * a status change counts as an outcome (PRD §4.1), moving the date alone is `date_moved` (stays due, never done).
 */
const logAdminFollowUp: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (!data || operation !== 'update' || !originalDoc || isSystemWrite(req) || req.context[FOLLOW_UP_CONTEXT] === true) return data
  const before = originalDoc.nextFollowUpAt as string | null | undefined
  if (before == null || new Date(before).getTime() > Date.now()) return data
  const statusChanged = (data.status ?? originalDoc.status) !== originalDoc.status
  const dateChanged = 'nextFollowUpAt' in data && !sameInstant(before, data.nextFollowUpAt)
  if (!statusChanged && !dateChanged) return data
  const log = Array.isArray(originalDoc.followUps) ? originalDoc.followUps : []
  const now = new Date().toISOString()
  data.followUps = [...log, { at: now, outcome: statusChanged ? STATUS_CHANGED : DATE_MOVED, by: req.user?.id ?? null, dueAt: before, note: null }]
  if (statusChanged) {
    data.lastOutcomeAt = now
    data.lastOutcomeBy = req.user?.id ?? null
  }
  return data
}

/** Lead CRM for advisors: form → queue → call → notes → enrolled / lost. */
export const Leads: CollectionConfig = {
  slug: 'leads',
  labels: { singular: { fa: 'سرنخ', en: 'Lead' }, plural: { fa: 'سرنخ‌ها (CRM)', en: 'Leads (CRM)' } },
  admin: {
    components: { beforeListTable: ['/components/admin/ListKpis#ListKpis'] },
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
      protectFollowUpLog,
      ({ data, originalDoc, operation }) => {
        const from = (originalDoc?.status ?? 'new') as LeadStatus
        const to = (data.status ?? from) as LeadStatus
        if (operation === 'update' && !canTransitionLead(from, to)) {
          throw new APIError(`Lead cannot move from "${from}" to "${to}"`, 400)
        }
        // Default follow-up date per stage, unless the same change sets a date explicitly (outcome action, admin).
        const dateGiven = 'nextFollowUpAt' in data && (operation === 'create' ? data.nextFollowUpAt != null : !sameInstant(data.nextFollowUpAt, originalDoc?.nextFollowUpAt))
        if ((operation === 'create' || from !== to) && !dateGiven) {
          data.nextFollowUpAt = nextFollowUpAt(to)?.toISOString() ?? null
        }
        if (to === 'enrolled') data.nextFollowUpAt = null
        return data
      },
      logAdminFollowUp,
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
        { name: 'nextFollowUpAt', type: 'date', index: true, label: { fa: 'پیگیری بعدی', en: 'Next follow-up' }, admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'lastOutcome',
          type: 'select',
          label: { fa: 'نتیجهٔ آخرین پیگیری', en: 'Last outcome' },
          options: LEAD_OUTCOMES.map((o) => ({ value: o, label: { fa: LEAD_OUTCOME_LABELS_FA[o], en: o } })),
          admin: { readOnly: true },
        },
        { name: 'lastOutcomeAt', type: 'date', label: { fa: 'زمان ثبت نتیجه', en: 'Outcome recorded at' }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'lastOutcomeBy', type: 'relationship', relationTo: 'users', label: { fa: 'ثبت‌کننده', en: 'Recorded by' }, admin: { readOnly: true } },
      ],
    },
    {
      name: 'followUps',
      type: 'array',
      label: { fa: 'تاریخچهٔ پیگیری', en: 'Follow-up log' },
      admin: { readOnly: true, description: 'Append-only. Written by «ثبت نتیجهٔ پیگیری»; a moved date without an outcome is logged as date_moved.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'at', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
            {
              name: 'outcome',
              type: 'select',
              required: true,
              options: [
                ...LEAD_OUTCOMES.map((o) => ({ value: o, label: { fa: LEAD_OUTCOME_LABELS_FA[o], en: o } })),
                { value: STATUS_CHANGED, label: { fa: 'وضعیت تغییر کرد', en: 'Status changed' } },
                { value: DATE_MOVED, label: { fa: 'فقط تاریخ جابه‌جا شد', en: 'Date moved (no outcome)' } },
              ],
            },
            { name: 'by', type: 'relationship', relationTo: 'users' },
            { name: 'dueAt', type: 'date', admin: { description: 'The follow-up date this entry resolved.', date: { pickerAppearance: 'dayAndTime' } } },
          ],
        },
        { name: 'note', type: 'textarea' },
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
