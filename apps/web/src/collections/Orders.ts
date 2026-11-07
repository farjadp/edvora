import type { CollectionConfig } from 'payload'
import { allow, allowCreate, anyOf, guard, nobody, ownRecords } from '../access/permissions'
import { auditChange } from '../hooks/audit'

const STATUS = [
  { value: 'pending', label: { fa: 'در انتظار پرداخت', en: 'Pending' } },
  { value: 'partially_paid', label: { fa: 'پرداخت قسطی', en: 'Partially paid' } },
  { value: 'paid', label: { fa: 'پرداخت شده', en: 'Paid' } },
  { value: 'failed', label: { fa: 'ناموفق', en: 'Failed' } },
  { value: 'refunded', label: { fa: 'مسترد شده', en: 'Refunded' } },
  { value: 'cancelled', label: { fa: 'لغو شده', en: 'Cancelled' } },
]

/** An order with its instalment schedule and every gateway attempt. All amounts in rials. */
const SCOPE = { course: 'course', cohort: 'cohort' }

export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: { fa: 'سفارش', en: 'Order' }, plural: { fa: 'سفارش‌ها', en: 'Orders' } },
  admin: {
    components: { beforeListTable: ['/components/admin/ListKpis#ListKpis'] }, defaultColumns: ['id', 'user', 'course', 'total', 'status', 'createdAt'], group: { fa: 'فروش', en: 'Sales' } },
  access: {
    read: anyOf(ownRecords('user'), allow('orders.view', SCOPE)),
    // Students' orders are created by the checkout server action (server code, no API access needed).
    create: allowCreate('orders.create_for_lead'),
    update: allow('orders.edit', SCOPE),
    delete: nobody,
  },
  hooks: {
    beforeChange: [guard({ create: ['orders.create_for_lead'], update: ['orders.edit'], fields: SCOPE })],
    afterChange: [auditChange('orders')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
        { name: 'course', type: 'relationship', relationTo: 'courses', required: true },
        { name: 'cohort', type: 'relationship', relationTo: 'cohorts' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'subtotal', type: 'number', required: true, min: 0 },
        { name: 'discount', type: 'number', defaultValue: 0, min: 0 },
        { name: 'total', type: 'number', required: true, min: 0 },
        { name: 'couponCode', type: 'text' },
      ],
    },
    { name: 'status', type: 'select', required: true, defaultValue: 'pending', index: true, options: STATUS },
    {
      // E-032: imported orders are history only (no payment flow, no notifications).
      name: 'source',
      type: 'select',
      defaultValue: 'site',
      index: true,
      label: { fa: 'منبع', en: 'Source' },
      options: [
        { value: 'site', label: { fa: 'سایت', en: 'Site' } },
        { value: 'import', label: { fa: 'انتقال از وردپرس', en: 'WordPress import' } },
      ],
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'instalments',
      type: 'array',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'index', type: 'number', required: true },
            { name: 'amount', type: 'number', required: true },
            { name: 'dueDate', type: 'date', required: true },
            {
              name: 'status',
              type: 'select',
              defaultValue: 'pending',
              options: [
                { value: 'pending', label: { fa: 'سررسید نشده', en: 'Pending' } },
                { value: 'paid', label: { fa: 'پرداخت شده', en: 'Paid' } },
              ],
            },
          ],
        },
        { name: 'paidAt', type: 'date' },
      ],
    },
    {
      name: 'payments',
      type: 'array',
      label: { fa: 'تراکنش‌ها', en: 'Gateway attempts' },
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'instalmentIndex', type: 'number', required: true },
            // 'zarinpal' | 'mock' | … for live attempts, 'imported' for history brought in by the WordPress import.
            { name: 'provider', type: 'text', required: true },
            { name: 'authority', type: 'text', required: true, index: true },
            { name: 'amount', type: 'number', required: true },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'status',
              type: 'select',
              defaultValue: 'started',
              options: [
                { value: 'started', label: 'Started' },
                { value: 'verified', label: 'Verified' },
                { value: 'failed', label: 'Failed' },
              ],
            },
            { name: 'refId', type: 'text' },
            { name: 'cardPan', type: 'text' },
            { name: 'error', type: 'text' },
          ],
        },
        {
          type: 'row',
          fields: [
            // E-032: the original WooCommerce gateway id (e.g. WC_ZPal) and its title, for imported history.
            { name: 'gateway', type: 'text' },
            { name: 'gatewayTitle', type: 'text' },
          ],
        },
      ],
    },
  ],
}
