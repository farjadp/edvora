import { CONTACT_OUTCOMES, REFUND_STATUS_LABELS, type RefundStatus } from '@edvora/core'
import type { CollectionConfig } from 'payload'
import { allow, anyOf, nobody } from '../access/permissions'

/**
 * E-023 (ADR 021): finance desk records. Server code only — nobody creates or edits a row through REST or /admin;
 * the finance desk actions check tenant, permission and four-eyes before they write, and audit-log every step.
 */

const SCOPE = { course: 'course', cohort: 'cohort' }
const ro = { readOnly: true }
const when = { readOnly: true, date: { pickerAppearance: 'dayAndTime' as const } }
const STATUSES = Object.keys(REFUND_STATUS_LABELS) as RefundStatus[]

/** A refund: requested by one person, approved by a different one, then marked paid back with the bank reference. */
export const Refunds: CollectionConfig = {
  slug: 'refunds',
  labels: { singular: { fa: 'بازپرداخت', en: 'Refund' }, plural: { fa: 'بازپرداخت‌ها', en: 'Refunds' } },
  admin: {
    defaultColumns: ['id', 'order', 'user', 'amount', 'status', 'createdAt'],
    group: { fa: 'فروش', en: 'Sales' },
    description: { fa: 'فقط خواندنی. بازپرداخت‌ها از میز مالی درخواست و تأیید می‌شوند.', en: 'Read only. Refunds are requested and approved on the finance desk.' },
  },
  defaultSort: '-createdAt',
  access: {
    read: anyOf(allow('finance.view', SCOPE), allow('orders.view', SCOPE)),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'order', type: 'relationship', relationTo: 'orders', required: true, index: true, admin: ro },
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true, label: { fa: 'دانشجو', en: 'Student' }, admin: ro },
        { name: 'course', type: 'relationship', relationTo: 'courses', index: true, admin: ro },
        { name: 'cohort', type: 'relationship', relationTo: 'cohorts', admin: ro },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'amount', type: 'number', required: true, min: 1, label: { fa: 'مبلغ (ریال)', en: 'Amount (rial)' }, admin: ro },
        { name: 'full', type: 'checkbox', label: { fa: 'بازپرداخت کامل', en: 'Full refund' }, admin: ro },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'requested',
          index: true,
          options: STATUSES.map((s) => ({ value: s, label: { fa: REFUND_STATUS_LABELS[s].label, en: s } })),
          admin: ro,
        },
      ],
    },
    { name: 'reason', type: 'textarea', required: true, label: { fa: 'دلیل', en: 'Reason' }, admin: ro },
    {
      type: 'row',
      fields: [
        { name: 'requestedBy', type: 'relationship', relationTo: 'users', label: { fa: 'درخواست‌کننده', en: 'Requested by' }, admin: ro },
        { name: 'requestedAt', type: 'date', admin: when },
        { name: 'approvedBy', type: 'relationship', relationTo: 'users', label: { fa: 'تأییدکننده', en: 'Approved by' }, admin: ro },
        { name: 'approvedAt', type: 'date', admin: when },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'refundedBy', type: 'relationship', relationTo: 'users', label: { fa: 'ثبت واریز', en: 'Refunded by' }, admin: ro },
        { name: 'refundedAt', type: 'date', index: true, admin: when },
        { name: 'reference', type: 'text', label: { fa: 'شمارهٔ پیگیری واریز', en: 'Transfer reference' }, admin: ro },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'closedBy', type: 'relationship', relationTo: 'users', label: { fa: 'رد / لغو توسط', en: 'Rejected / cancelled by' }, admin: ro },
        { name: 'closedAt', type: 'date', admin: when },
      ],
    },
    { name: 'rejectionReason', type: 'textarea', label: { fa: 'دلیل رد', en: 'Rejection reason' }, admin: ro },
  ],
}

/** One call / message to a student about an unpaid instalment ("last contact" on the overdue list). Append-only. */
export const FinanceContacts: CollectionConfig = {
  slug: 'finance-contacts',
  labels: { singular: { fa: 'یادداشت تماس مالی', en: 'Finance contact note' }, plural: { fa: 'یادداشت‌های تماس مالی', en: 'Finance contact notes' } },
  admin: { defaultColumns: ['order', 'instalmentIndex', 'outcome', 'by', 'at'], group: { fa: 'فروش', en: 'Sales' }, hidden: true },
  defaultSort: '-at',
  access: {
    read: allow('finance.view'),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'order', type: 'relationship', relationTo: 'orders', required: true, index: true, admin: ro },
        { name: 'instalmentIndex', type: 'number', required: true, min: 0, admin: ro },
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, label: { fa: 'دانشجو', en: 'Student' }, admin: ro },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'outcome', type: 'select', required: true, options: Object.entries(CONTACT_OUTCOMES).map(([value, fa]) => ({ value, label: { fa, en: value } })), admin: ro },
        { name: 'by', type: 'relationship', relationTo: 'users', required: true, label: { fa: 'همکار', en: 'Staff' }, admin: ro },
        { name: 'at', type: 'date', required: true, index: true, admin: when },
      ],
    },
    { name: 'note', type: 'textarea', admin: ro },
  ],
}
