import { MANUAL_CHANNELS, PAYMENT_METHOD_KEYS, PAYMENT_METHODS, PAYMENT_STATUS_LABELS, USDT_NETWORK_KEYS, type PaymentStatus } from '@edvora/core'
import type { CollectionConfig } from 'payload'
import { allow, anyOf, nobody, ownRecords } from '../access/permissions'
import { paymentReceiptsDir } from '../lib/privateUploads'

const STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]
const SCOPE = { course: 'course', cohort: 'cohort' }
const ro = { readOnly: true }

/**
 * Every payment attempt (ADR 017): gateway, Tether, card-to-card, manual. Server code only — nobody creates or edits
 * a row through REST or /admin. The checkout, the gateway callback and the finance desk check tenant, user,
 * permission and four-eyes before they write, and audit-log every step.
 */
export const Payments: CollectionConfig = {
  slug: 'payments',
  labels: { singular: { fa: 'پرداخت', en: 'Payment' }, plural: { fa: 'پرداخت‌ها', en: 'Payments' } },
  admin: {
    defaultColumns: ['id', 'order', 'method', 'amount', 'status', 'createdAt'],
    group: { fa: 'فروش', en: 'Sales' },
    description: { fa: 'فقط خواندنی. پرداخت‌ها از صفحهٔ پرداخت دانشجو و میز مالی ثبت و تأیید می‌شوند.', en: 'Read only. Payments are made at checkout and handled on the finance desk.' },
  },
  defaultSort: '-createdAt',
  access: {
    read: anyOf(ownRecords('user'), allow('orders.view', SCOPE)),
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
        { name: 'method', type: 'select', required: true, index: true, options: PAYMENT_METHOD_KEYS.map((k) => ({ value: k, label: PAYMENT_METHODS[k].label })), admin: ro },
        { name: 'methodRow', type: 'relationship', relationTo: 'payment-methods', admin: ro },
        // Adapter that ran: the gateway key, or 'mock' when PAYMENT_PROVIDER=mock; 'env' for the instance default.
        { name: 'provider', type: 'text', admin: ro },
        { name: 'methodTitle', type: 'text', label: { fa: 'نام روش', en: 'Method title' }, admin: ro },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'instalmentIndexes', type: 'number', hasMany: true, required: true, label: { fa: 'قسط‌ها', en: 'Instalments' }, admin: ro },
        { name: 'amount', type: 'number', required: true, min: 0, label: { fa: 'مبلغ (ریال)', en: 'Amount (rial)' }, admin: ro },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'started',
          index: true,
          options: STATUSES.map((s) => ({ value: s, label: { fa: PAYMENT_STATUS_LABELS[s].staff, en: s } })),
          admin: ro,
        },
        {
          name: 'verifiedBy',
          type: 'select',
          options: [
            { value: 'gateway', label: { fa: 'درگاه', en: 'Gateway' } },
            { value: 'chain', label: { fa: 'شبکهٔ بلاک‌چین', en: 'Blockchain' } },
            { value: 'people', label: { fa: 'دو نفر', en: 'Two people' } },
          ],
          admin: ro,
        },
      ],
    },
    // Unique across all academies: the same gateway ref, tx hash or card tracking number is never counted twice.
    { name: 'reuseKey', type: 'text', unique: true, index: true, admin: ro },
    {
      type: 'collapsible',
      label: { fa: 'درگاه', en: 'Gateway' },
      admin: { condition: (d) => PAYMENT_METHODS[d?.method as keyof typeof PAYMENT_METHODS]?.kind === 'gateway' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'authority', type: 'text', index: true, admin: ro },
            { name: 'refId', type: 'text', label: { fa: 'شمارهٔ مرجع', en: 'Reference' }, admin: ro },
            { name: 'cardPan', type: 'text', admin: ro },
          ],
        },
      ],
    },
    {
      name: 'card',
      type: 'group',
      label: { fa: 'کارت‌به‌کارت', en: 'Card-to-card' },
      admin: { condition: (d) => d?.method === 'card' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'last4', type: 'text', label: { fa: '۴ رقم آخر کارت پرداخت‌کننده', en: 'Payer card last 4' }, admin: ro },
            { name: 'tracking', type: 'text', label: { fa: 'شمارهٔ پیگیری', en: 'Tracking number' }, admin: ro },
            { name: 'paidAt', type: 'date', label: { fa: 'زمان واریز', en: 'Paid at' }, admin: { ...ro, date: { pickerAppearance: 'dayAndTime' } } },
            { name: 'toCard', type: 'text', label: { fa: 'کارت مقصد', en: 'To card' }, admin: ro },
          ],
        },
        { name: 'receipt', type: 'relationship', relationTo: 'payment-receipts', label: { fa: 'تصویر رسید', en: 'Receipt' }, admin: ro },
      ],
    },
    {
      name: 'usdt',
      type: 'group',
      label: { fa: 'تتر', en: 'Tether' },
      admin: { condition: (d) => d?.method === 'usdt' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'network', type: 'select', options: USDT_NETWORK_KEYS.map((n) => ({ value: n, label: n.toUpperCase() })), admin: ro },
            { name: 'wallet', type: 'text', admin: ro },
            { name: 'tokenContract', type: 'text', admin: ro },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'rateRial', type: 'number', label: { fa: 'نرخ (ریال به ازای هر تتر)', en: 'Rate (rial per USDT)' }, admin: ro },
            // Integer in the token's smallest unit, stored as a decimal string (BEP20 has 18 decimals).
            { name: 'units', type: 'text', label: { fa: 'مبلغ (کوچک‌ترین واحد)', en: 'Amount (smallest unit)' }, admin: ro },
            { name: 'display', type: 'text', label: { fa: 'مبلغ تتر', en: 'USDT' }, admin: ro },
            { name: 'quotedAt', type: 'date', admin: { ...ro, date: { pickerAppearance: 'dayAndTime' } } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'txHash', type: 'text', index: true, admin: ro },
            { name: 'confirmations', type: 'number', admin: ro },
            { name: 'check', type: 'text', label: { fa: 'آخرین نتیجهٔ بررسی', en: 'Last check' }, admin: ro },
            { name: 'checkedAt', type: 'date', admin: { ...ro, date: { pickerAppearance: 'dayAndTime' } } },
          ],
        },
      ],
    },
    {
      name: 'manual',
      type: 'group',
      label: { fa: 'ثبت دستی', en: 'Manual' },
      admin: { condition: (d) => d?.method === 'manual' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'channel', type: 'select', options: Object.entries(MANUAL_CHANNELS).map(([value, fa]) => ({ value, label: { fa, en: value } })), admin: ro },
            { name: 'reference', type: 'text', label: { fa: 'شمارهٔ رسید / مرجع', en: 'Reference' }, admin: ro },
            { name: 'paidAt', type: 'date', admin: { ...ro, date: { pickerAppearance: 'dayAndTime' } } },
          ],
        },
        { name: 'note', type: 'textarea', admin: ro },
      ],
    },
    {
      type: 'collapsible',
      label: { fa: 'بررسی و تأیید', en: 'Review' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'recordedBy', type: 'relationship', relationTo: 'users', label: { fa: 'ثبت / بررسی اول', en: 'Recorded by' }, admin: ro },
            { name: 'recordedAt', type: 'date', admin: { ...ro, date: { pickerAppearance: 'dayAndTime' } } },
            { name: 'confirmedBy', type: 'relationship', relationTo: 'users', label: { fa: 'تأیید نهایی', en: 'Confirmed by' }, admin: ro },
            { name: 'confirmedAt', type: 'date', admin: { ...ro, date: { pickerAppearance: 'dayAndTime' } } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'rejectedBy', type: 'relationship', relationTo: 'users', admin: ro },
            { name: 'rejectedAt', type: 'date', admin: { ...ro, date: { pickerAppearance: 'dayAndTime' } } },
          ],
        },
        { name: 'rejectionReason', type: 'textarea', label: { fa: 'دلیل رد (به دانشجو نشان داده می‌شود)', en: 'Rejection reason (shown to the student)' }, admin: ro },
        { name: 'error', type: 'text', admin: ro },
      ],
    },
  ],
}

/** Private card-to-card receipt images (ADR 009 rules). Served only by GET /files/receipts/<id>. */
export const PaymentReceipts: CollectionConfig = {
  slug: 'payment-receipts',
  labels: { singular: { fa: 'رسید پرداخت', en: 'Payment receipt' }, plural: { fa: 'رسیدهای پرداخت', en: 'Payment receipts' } },
  admin: { useAsTitle: 'filename', group: { fa: 'فروش', en: 'Sales' }, defaultColumns: ['filename', 'owner', 'createdAt'] },
  access: {
    read: anyOf(ownRecords('owner'), allow('orders.view')),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  upload: {
    staticDir: paymentReceiptsDir(),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    handlers: [() => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } })],
    hideFileInputOnCreate: true,
    hideRemoveFile: true,
    disableLocalStorage: false,
  },
  hooks: {
    afterRead: [
      ({ doc }) => {
        const id = (doc as { id?: number }).id
        if (id) (doc as { url?: string }).url = `/files/receipts/${id}`
        return doc
      },
    ],
  },
  fields: [{ name: 'owner', type: 'relationship', relationTo: 'users', required: true, index: true, label: { fa: 'دانشجو', en: 'Student' } }],
}
