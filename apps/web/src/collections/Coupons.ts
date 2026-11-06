import type { CollectionConfig } from 'payload'
import { admins } from '../access/roles'

export const Coupons: CollectionConfig = {
  slug: 'coupons',
  labels: { singular: { fa: 'کد تخفیف', en: 'Coupon' }, plural: { fa: 'کدهای تخفیف', en: 'Coupons' } },
  admin: { useAsTitle: 'code', defaultColumns: ['code', 'kind', 'value', 'usedCount', 'active'], group: { fa: 'فروش', en: 'Sales' } },
  access: { read: admins, create: admins, update: admins, delete: admins },
  fields: [
    {
      name: 'code',
      type: 'text',
      required: true,
      index: true,
      hooks: { beforeValidate: [({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)] },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'percent',
          options: [
            { value: 'percent', label: { fa: 'درصدی', en: 'Percent' } },
            { value: 'fixed', label: { fa: 'مبلغ ثابت (ریال)', en: 'Fixed (rials)' } },
          ],
        },
        { name: 'value', type: 'number', required: true, min: 0 },
        { name: 'maxDiscount', type: 'number', min: 0, admin: { description: 'Rials, for percent coupons' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'validUntil', type: 'date' },
        { name: 'usageLimit', type: 'number', min: 0 },
        { name: 'usedCount', type: 'number', defaultValue: 0, admin: { readOnly: true } },
        { name: 'active', type: 'checkbox', defaultValue: true },
      ],
    },
    { name: 'note', type: 'text', admin: { description: 'e.g. Alumni discount' } },
  ],
}
