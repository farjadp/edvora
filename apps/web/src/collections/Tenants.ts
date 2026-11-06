import type { CollectionConfig } from 'payload'
import { adminsField, isSuperAdmin, superAdminField, superAdminOnly } from '../access/roles'

/** An academy on Edvora. Everything else belongs to exactly one tenant. */
export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: { singular: { fa: 'آکادمی', en: 'Academy' }, plural: { fa: 'آکادمی‌ها', en: 'Academies' } },
  admin: { useAsTitle: 'name', group: { fa: 'ادورا', en: 'Edvora' } },
  access: {
    // The multi-tenant plugin narrows read/update to the user's own tenants.
    read: ({ req }) => Boolean(req.user),
    create: superAdminOnly,
    update: ({ req }) => isSuperAdmin(req.user) || Boolean(req.user?.roles?.includes('admin')),
    delete: superAdminOnly,
  },
  fields: [
    { name: 'name', type: 'text', required: true, label: { fa: 'نام آکادمی', en: 'Name' } },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { update: superAdminField },
      admin: { description: 'Lowercase, no spaces. Used in URLs and for DEFAULT_TENANT_SLUG.' },
    },
    {
      name: 'domains',
      type: 'array',
      label: { fa: 'دامنه‌ها', en: 'Domains' },
      access: { update: superAdminField },
      fields: [{ name: 'domain', type: 'text', required: true, index: true }],
    },
    {
      name: 'plan',
      type: 'select',
      defaultValue: 'starter',
      access: { update: superAdminField },
      options: [
        { label: 'Starter', value: 'starter' },
        { label: 'Growth', value: 'growth' },
        { label: 'Academy Pro', value: 'pro' },
      ],
    },
    {
      name: 'features',
      type: 'select',
      hasMany: true,
      label: { fa: 'ماژول‌های فعال', en: 'Enabled modules' },
      access: { update: superAdminField },
      defaultValue: ['site', 'lms', 'payments', 'certificates'],
      options: [
        { label: 'Public site', value: 'site' },
        { label: 'LMS', value: 'lms' },
        { label: 'Payments', value: 'payments' },
        { label: 'Lead CRM', value: 'crm' },
        { label: 'Certificates', value: 'certificates' },
        { label: 'Live classes', value: 'live' },
        { label: 'Consulting', value: 'consulting' },
        { label: 'B2B accounts', value: 'b2b' },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { fa: 'برند', en: 'Branding' },
          fields: [
            { name: 'tagline', type: 'text', label: { fa: 'شعار', en: 'Tagline' } },
            { name: 'logo', type: 'upload', relationTo: 'media' },
            {
              name: 'primaryColor',
              type: 'text',
              defaultValue: '#1A56DB',
              validate: (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) || 'Use a hex color like #1A56DB',
            },
            {
              name: 'accentColor',
              type: 'text',
              defaultValue: '#F59E0B',
              validate: (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) || 'Use a hex color like #F59E0B',
            },
            {
              name: 'defaultTheme',
              type: 'select',
              defaultValue: 'light',
              options: [
                { label: 'Light', value: 'light' },
                { label: 'Dark', value: 'dark' },
              ],
            },
          ],
        },
        {
          label: { fa: 'محتوای سایت', en: 'Site content' },
          fields: [
            {
              name: 'notice',
              type: 'group',
              label: { fa: 'نوار اطلاع‌رسانی', en: 'Notice bar' },
              fields: [
                { name: 'enabled', type: 'checkbox', defaultValue: false },
                { name: 'text', type: 'text' },
              ],
            },
            { name: 'manifesto', type: 'textarea', label: { fa: 'مانیفست / درباره ما', en: 'Manifesto' } },
            {
              name: 'services',
              type: 'array',
              label: { fa: 'خدمات (مشاوره، سازمانی…)', en: 'Services' },
              fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'text', type: 'textarea' },
              ],
            },
            {
              name: 'stats',
              type: 'array',
              label: { fa: 'آمار', en: 'Proof stats' },
              fields: [
                { name: 'value', type: 'text', required: true },
                { name: 'label', type: 'text', required: true },
              ],
            },
            {
              name: 'clientLogos',
              type: 'array',
              label: { fa: 'برندهای همراه', en: 'Client logos' },
              fields: [
                { name: 'name', type: 'text', required: true },
                { name: 'logo', type: 'upload', relationTo: 'media' },
              ],
            },
            {
              name: 'contact',
              type: 'group',
              fields: [
                { name: 'phone', type: 'text' },
                { name: 'email', type: 'email' },
              ],
            },
          ],
        },
        {
          label: { fa: 'تنظیمات فنی', en: 'Settings' },
          fields: [
            {
              name: 'certificatePrefix',
              type: 'text',
              required: true,
              defaultValue: 'ED',
              admin: { description: 'Certificate codes look like PREFIX-PROGRAM-001 (IBA: BA-MBA-181).' },
              validate: (v: unknown) => (typeof v === 'string' && /^[A-Z]{2,6}$/.test(v)) || '2–6 capital letters',
            },
            {
              name: 'zarinpalMerchantId',
              type: 'text',
              access: { read: adminsField, update: adminsField },
              admin: { description: "The academy's own gateway. Money goes straight to the academy." },
            },
          ],
        },
      ],
    },
  ],
}
