import type { CollectionConfig } from 'payload'
import { nobody } from '../access/permissions'
import { isSuperAdmin } from '../access/roles'

const platformOnly = ({ req }: { req: { user?: unknown } }) => isSuperAdmin(req.user as never)
const group = { fa: 'ادورا', en: 'Edvora' }
const readOnly = { create: () => false, update: () => false }

/**
 * One row per self-serve demo (E-029, ADR 010). Platform-owned (not a tenant collection): it outlives the sandbox
 * so the per-IP daily cap and demo counts (O5) still work after the cleanup job hard-deletes the tenant. Holds no
 * personal data beyond a keyed IP hash. Written only by server code; Edvora super-admins can read it.
 */
export const DemoSandboxes: CollectionConfig = {
  slug: 'demo-sandboxes',
  labels: { singular: { fa: 'آکادمی آزمایشی', en: 'Demo sandbox' }, plural: { fa: 'آکادمی‌های آزمایشی', en: 'Demo sandboxes' } },
  admin: {
    useAsTitle: 'tenantSlug',
    defaultColumns: ['tenantSlug', 'status', 'createdAt', 'expiresAt', 'buildMs', 'ipHash'],
    group,
    description: 'Operate demos at /demo/ops (count vs cap, delete now). Rows are kept after cleanup for the daily limit.',
  },
  access: { read: platformOnly, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', index: true, access: readOnly },
    { name: 'tenantSlug', type: 'text', index: true, access: readOnly },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'creating',
      index: true,
      access: readOnly,
      options: [
        { value: 'creating', label: { fa: 'در حال ساخت', en: 'Creating' } },
        { value: 'active', label: { fa: 'فعال', en: 'Active' } },
        { value: 'failed', label: { fa: 'ناموفق', en: 'Failed' } },
        { value: 'purged', label: { fa: 'حذف شده', en: 'Purged' } },
      ],
    },
    { name: 'expiresAt', type: 'date', required: true, index: true, access: readOnly, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'purgedAt', type: 'date', access: readOnly, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'ipHash', type: 'text', required: true, index: true, access: readOnly },
    { name: 'creatorKeyHash', type: 'text', index: true, access: readOnly, admin: { hidden: true } },
    // Proof-of-work nonce: unique, so a solved challenge is single-use even across instances (A2).
    { name: 'powNonce', type: 'text', unique: true, access: readOnly, admin: { hidden: true } },
    { name: 'buildMs', type: 'number', access: readOnly, label: { fa: 'زمان ساخت (ms)', en: 'Build time (ms)' } },
    { name: 'error', type: 'text', access: readOnly },
  ],
}

/**
 * Platform leads from /demo (C5, V8, F3): only with an explicit consent tick. Not tenant-owned, so no academy admin
 * can see them and they survive sandbox cleanup. Retention: 12 months (Farjad default pending), then delete by hand
 * until a retention job exists. Export: /demo/ops/leads.csv.
 */
export const DemoLeads: CollectionConfig = {
  slug: 'demo-leads',
  labels: { singular: { fa: 'سرنخ دمو', en: 'Demo lead' }, plural: { fa: 'سرنخ‌های دمو', en: 'Demo leads' } },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'source', 'createdAt'], group },
  access: { read: platformOnly, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'name', type: 'text', access: readOnly },
    { name: 'email', type: 'email', required: true, index: true, access: readOnly },
    { name: 'consent', type: 'checkbox', required: true, access: readOnly },
    { name: 'consentText', type: 'text', required: true, access: readOnly },
    { name: 'sandbox', type: 'relationship', relationTo: 'demo-sandboxes', access: readOnly },
    {
      name: 'source',
      type: 'select',
      required: true,
      access: readOnly,
      options: [
        { value: 'demo-form', label: { fa: 'فرم ساخت دمو', en: 'Demo form' } },
        { value: 'full-state', label: { fa: 'ظرفیت پر', en: 'Capacity full' } },
        { value: 'expired-state', label: { fa: 'پایان دمو', en: 'Demo ended' } },
        { value: 'talk', label: { fa: 'درخواست گفتگو', en: 'Talk to us' } },
      ],
    },
  ],
}
