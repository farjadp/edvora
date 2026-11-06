import type { CollectionConfig } from 'payload'
import { ROLE_TEMPLATES } from '@edvora/core'
import { allow, asSystem, fieldAllow, nobody } from '../access/permissions'
import { isSuperAdmin } from '../access/roles'
import { gamificationSettingsField } from '../fields/gamification'
import { lockSandboxTenantFields } from '../access/sandbox'
import { auditChange } from '../hooks/audit'
import { richTextField, tenantSelf } from '../lib/richText'

const platformOnly = ({ req }: { req: { user?: unknown } }) => isSuperAdmin(req.user as never)
const settingsField = fieldAllow('settings.edit', (d) => d?.id)

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
    // E-029: sandbox accounts cannot touch routing, plan, modules, gateway or the sandbox flags (real 403).
    beforeOperation: [lockSandboxTenantFields],
    afterChange: [
      // Every new academy (sandboxes included: lib/academies.ts createAcademy is the one path for new tenants) starts with the role templates (ADR 006 §4); admins copy and edit them.
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
    // E-029 / ADR 010: self-serve demo sandboxes. Written only by server code (overrideAccess); never via the API.
    {
      name: 'isSandbox',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: { fa: 'آکادمی آزمایشی (دمو)', en: 'Sandbox (demo)' },
      access: { create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true, description: 'Self-serve demo. Hard-deleted by the cleanup job after expiry + grace.' },
    },
    {
      name: 'expiresAt',
      type: 'date',
      index: true,
      label: { fa: 'پایان آکادمی آزمایشی', en: 'Sandbox expires at' },
      access: { create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true, condition: (data) => Boolean(data?.isSandbox), date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'purgeAt',
      type: 'date',
      index: true,
      label: { fa: 'حذف کامل پس از', en: 'Purge after' },
      access: { create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true, condition: (data) => Boolean(data?.isSandbox), date: { pickerAppearance: 'dayAndTime' } },
    },
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
              ],
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
              name: 'zarinpalMerchantId',
              type: 'text',
              access: { read: settingsField, update: settingsField },
              admin: { description: "The academy's own gateway. Money goes straight to the academy." },
            },
          ],
        },
      ],
    },
  ],
}
