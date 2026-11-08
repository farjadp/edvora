import type { CollectionConfig } from 'payload'
import { FONT_DISPLAY, MESSAGE_EVENTS, PLAN_LIMITS, PLAN_LIMIT_LABELS, ROLE_TEMPLATES, SITE_TOGGLES, SOCIAL_PLATFORMS } from '@edvora/core'
import { allow, asSystem, fieldAllow, nobody } from '../access/permissions'
import { isSuperAdmin } from '../access/roles'
import { gamificationSettingsField } from '../fields/gamification'
import { auditChange } from '../hooks/audit'
import { richTextField, tenantSelf } from '../lib/richText'

const platformOnly = ({ req }: { req: { user?: unknown } }) => isSuperAdmin(req.user as never)
const settingsField = fieldAllow('settings.edit', (d) => d?.id)
const templatesField = fieldAllow('templates.edit', (d) => d?.id)

/** An academy on Edvora. Everything else belongs to exactly one tenant. */
export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: { singular: { fa: 'آکادمی', en: 'Academy' }, plural: { fa: 'آکادمی‌ها', en: 'Academies' } },
  admin: { useAsTitle: 'name', group: { fa: 'ادورا', en: 'Edvora' } },
  access: {
    // The multi-tenant plugin narrows read/update to the user's own tenants.
    read: ({ req }) => Boolean(req.user),
    create: platformOnly,
    update: allow('settings.edit', { tenant: 'id' }),
    // Never hard-deleted (Notion 11 §0: suspend/archive an academy is a later platform feature).
    delete: nobody,
  },
  hooks: {
    afterChange: [
      // Every new academy starts with the role templates (ADR 006 §4); admins copy and edit them.
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return doc
        await asSystem(req, async () => {
          for (const t of ROLE_TEMPLATES) {
            const exists = await req.payload.find({ collection: 'roles', where: { and: [{ tenant: { equals: doc.id } }, { key: { equals: t.key } }] }, limit: 1, depth: 0, overrideAccess: true, req })
            if (exists.docs.length) continue
            await req.payload.create({
              collection: 'roles',
              overrideAccess: true,
              req,
              data: { tenant: doc.id, key: t.key, template: t.key, name: t.name.fa, description: t.description, permissions: [...t.permissions], archived: false },
            })
          }
        })
        return doc
      },
      auditChange('tenants'),
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true, label: { fa: 'نام آکادمی', en: 'Name' } },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { create: platformOnly, update: platformOnly },
      admin: { description: 'Lowercase, no spaces. Used in URLs and for DEFAULT_TENANT_SLUG.' },
    },
    {
      name: 'domains',
      type: 'array',
      label: { fa: 'دامنه‌ها', en: 'Domains' },
      access: { create: platformOnly, update: platformOnly },
      fields: [{ name: 'domain', type: 'text', required: true, index: true }],
    },
    {
      name: 'plan',
      type: 'select',
      defaultValue: 'starter',
      access: { create: platformOnly, update: platformOnly },
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
      access: { create: platformOnly, update: platformOnly },
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
    // E-047 (ADR 019): plan limits, platform only. Empty = no limit.
    {
      name: 'limits',
      type: 'group',
      label: { fa: 'سقف‌های طرح', en: 'Plan limits' },
      access: { create: platformOnly, update: platformOnly },
      fields: PLAN_LIMITS.map((k) => ({ name: k, type: 'number' as const, min: 0, label: { fa: PLAN_LIMIT_LABELS[k], en: k } })),
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { fa: 'برند', en: 'Branding' },
          fields: [
            { name: 'tagline', type: 'text', label: { fa: 'شعار', en: 'Tagline' } },
            { name: 'logo', type: 'upload', relationTo: 'media', label: { fa: 'لوگو (زمینهٔ روشن)', en: 'Logo (light)' } },
            // E-047 (ADR 019): the rest of the identity set. Uploaded through the settings hub (type and size checked).
            { name: 'logoDark', type: 'upload', relationTo: 'media', label: { fa: 'لوگو (زمینهٔ تیره)', en: 'Logo (dark)' } },
            { name: 'favicon', type: 'upload', relationTo: 'media', label: { fa: 'نماد زبانه (favicon)', en: 'Favicon' } },
            { name: 'ogImage', type: 'upload', relationTo: 'media', label: { fa: 'تصویر اشتراک‌گذاری (OG)', en: 'OG image' } },
            {
              name: 'fontDisplay',
              type: 'select',
              defaultValue: 'morabba',
              label: { fa: 'قلم عنوان‌ها', en: 'Display font' },
              options: FONT_DISPLAY.map((f) => ({ value: f.value, label: f.fa })),
            },
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
            richTextField({ name: 'manifesto', label: { fa: 'مانیفست / درباره ما', en: 'Manifesto' }, tenantsOf: tenantSelf }),
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
                { name: 'address', type: 'text' },
                {
                  name: 'social',
                  type: 'array',
                  label: { fa: 'شبکه‌های اجتماعی', en: 'Social links' },
                  maxRows: 12,
                  fields: [
                    { name: 'platform', type: 'select', required: true, options: SOCIAL_PLATFORMS.map((p) => ({ value: p.value, label: p.fa })) },
                    {
                      name: 'url',
                      type: 'text',
                      required: true,
                      validate: (v: unknown) => (typeof v === 'string' && /^https:\/\//.test(v)) || 'https:// only',
                    },
                  ],
                },
              ],
            },
            {
              name: 'seo',
              type: 'group',
              label: { fa: 'پیش‌فرض‌های سئو', en: 'SEO defaults' },
              fields: [
                { name: 'titleSuffix', type: 'text', label: { fa: 'پسوند عنوان صفحه‌ها', en: 'Title suffix' } },
                { name: 'description', type: 'textarea', label: { fa: 'توضیح پیش‌فرض', en: 'Default description' } },
                { name: 'keywords', type: 'text', label: { fa: 'کلیدواژه‌ها', en: 'Keywords' } },
                { name: 'noindex', type: 'checkbox', defaultValue: false, label: { fa: 'پنهان از موتورهای جست‌وجو', en: 'noindex' } },
              ],
            },
            {
              name: 'loginTexts',
              type: 'group',
              label: { fa: 'متن‌های صفحهٔ ورود', en: 'Login page texts' },
              fields: [
                { name: 'title', type: 'text' },
                { name: 'subtitle', type: 'textarea' },
                { name: 'help', type: 'text' },
              ],
            },
            {
              name: 'toggles',
              type: 'group',
              label: { fa: 'بخش‌های سایت', en: 'Site sections' },
              fields: SITE_TOGGLES.map((t) => ({ name: t.key, type: 'checkbox' as const, defaultValue: true, label: { fa: t.fa, en: t.key } })),
            },
            {
              name: 'legal',
              type: 'group',
              label: { fa: 'صفحه‌های حقوقی', en: 'Legal pages' },
              fields: (['terms', 'privacy', 'refund'] as const).map((k) => ({
                name: k,
                type: 'relationship' as const,
                relationTo: 'pages' as const,
                // Only this academy's pages.
                filterOptions: ({ id }: { id?: string | number }) => (id ? { tenant: { equals: id } } : false),
              })),
            },
          ],
        },
        {
          label: { fa: 'انگیزش و پیشرفت', en: 'Gamification' },
          fields: [gamificationSettingsField],
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
              name: 'certificateSigner',
              type: 'group',
              label: { fa: 'امضاکنندهٔ گواهی', en: 'Certificate signer' },
              fields: [
                { name: 'name', type: 'text' },
                { name: 'title', type: 'text' },
                { name: 'signature', type: 'upload', relationTo: 'media' },
              ],
            },
            {
              name: 'messageTemplates',
              type: 'array',
              label: { fa: 'قالب‌های پیامک و ایمیل', en: 'Message templates' },
              access: { read: templatesField, update: templatesField },
              fields: [
                { name: 'event', type: 'select', required: true, options: MESSAGE_EVENTS.map((e) => ({ value: e.key, label: e.fa })) },
                { name: 'channel', type: 'select', required: true, options: [{ value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' }] },
                { name: 'enabled', type: 'checkbox', defaultValue: false },
                { name: 'subject', type: 'text' },
                { name: 'body', type: 'textarea' },
              ],
            },
            {
              // Legacy (ADR 019 §9): moved to a sealed Zarinpal row in payment-methods (E-045) by migration
              // e047_zarinpal_to_payment_methods; nothing reads it any more. Dropping the column needs Farjad's OK.
              name: 'zarinpalMerchantId',
              type: 'text',
              access: { read: settingsField, update: () => false },
              admin: { hidden: true },
            },
          ],
        },
      ],
    },
  ],
}
