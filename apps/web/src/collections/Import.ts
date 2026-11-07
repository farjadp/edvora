import type { CollectionConfig, FieldAccess } from 'payload'
import { allow, allowCreate, guard, nobody } from '../access/permissions'
import { auditChange } from '../hooks/audit'

/**
 * E-032 — WordPress import (ADR 011 §Collections). Every collection here is tenant-owned (multi-tenant plugin),
 * default deny, never deleted through the API. Rows are written only by server code in `lib/wpimport/` after an
 * explicit tenant + `import.run` check; staff with `import.view` may read them in /admin.
 */

const never: FieldAccess = () => false
const group = { fa: 'انتقال از وردپرس', en: 'WordPress import' }

export const IMPORT_JOB_STATUSES = [
  'draft',
  'ingesting',
  'ready',
  'dry-run',
  'awaiting-confirm',
  'media',
  'committing',
  'done',
  'failed',
  'rejected',
  'cancelled',
] as const
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number]

const STATUS_LABELS: Record<ImportJobStatus, string> = {
  draft: 'در انتظار داده',
  ingesting: 'در حال دریافت',
  ready: 'دریافت کامل',
  'dry-run': 'در حال بررسی',
  'awaiting-confirm': 'منتظر تأیید',
  media: 'دریافت رسانه‌ها',
  committing: 'در حال ورود',
  done: 'پایان یافته',
  failed: 'ناموفق',
  rejected: 'رد شده',
  cancelled: 'لغو شده',
}

export const ImportConnections: CollectionConfig = {
  slug: 'import-connections',
  labels: { singular: { fa: 'اتصال انتقال', en: 'Import connection' }, plural: { fa: 'اتصال‌های انتقال', en: 'Import connections' } },
  admin: { useAsTitle: 'label', defaultColumns: ['label', 'connectionId', 'expiresAt', 'revokedAt', 'lastUsedAt'], group },
  access: { read: allow('import.view'), create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'connectionId', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    // sha256 of the secret, and an AES-256-GCM sealed copy (needed to verify HMACs; a hash alone cannot).
    { name: 'secretHash', type: 'text', required: true, hidden: true, access: { read: never, create: never, update: never } },
    { name: 'secretSealed', type: 'text', required: true, hidden: true, access: { read: never, create: never, update: never } },
    { name: 'job', type: 'relationship', relationTo: 'import-jobs', index: true, admin: { readOnly: true } },
    { name: 'expiresAt', type: 'date', required: true, admin: { readOnly: true } },
    { name: 'revokedAt', type: 'date', admin: { readOnly: true } },
    { name: 'lastUsedAt', type: 'date', admin: { readOnly: true } },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
  ],
}

/** One row per accepted push nonce (replay guard, 10 min) and per refused request (rate limit window). */
export const ImportNonces: CollectionConfig = {
  slug: 'import-nonces',
  admin: { hidden: true },
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  indexes: [{ fields: ['connection', 'nonce'], unique: true }],
  fields: [
    { name: 'connection', type: 'relationship', relationTo: 'import-connections', required: true, index: true },
    { name: 'nonce', type: 'text', required: true },
    { name: 'accepted', type: 'checkbox', defaultValue: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
}

export const ImportJobs: CollectionConfig = {
  slug: 'import-jobs',
  labels: { singular: { fa: 'انتقال', en: 'Import job' }, plural: { fa: 'انتقال‌ها', en: 'Import jobs' } },
  admin: { useAsTitle: 'label', defaultColumns: ['label', 'mode', 'status', 'createdAt', 'finishedAt'], group },
  defaultSort: '-createdAt',
  access: { read: allow('import.view'), create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'label', type: 'text' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: IMPORT_JOB_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
    },
    {
      name: 'mode',
      type: 'select',
      required: true,
      options: [
        { value: 'push', label: 'Plugin push' },
        { value: 'bundle', label: 'Bundle upload' },
        { value: 'rest', label: 'REST' },
        { value: 'wxr', label: 'WXR' },
      ],
    },
    { name: 'connection', type: 'relationship', relationTo: 'import-connections' },
    { name: 'site', type: 'json', admin: { readOnly: true } },
    { name: 'manifest', type: 'json', admin: { readOnly: true } },
    { name: 'mappers', type: 'json', admin: { readOnly: true } },
    /** Admin choices from the dry run: enabled mappers, product→course map, approved media hosts, phones for held users. */
    { name: 'choices', type: 'json', admin: { readOnly: true } },
    // Private storage paths (ADR 009 pattern). Never public, never in the API.
    { name: 'bundleFile', type: 'text', hidden: true, access: { read: never } },
    { name: 'planFile', type: 'text', hidden: true, access: { read: never } },
    { name: 'chunks', type: 'json', hidden: true, access: { read: never } },
    // REST fallback credentials, sealed, wiped when the job ends.
    { name: 'restSealed', type: 'text', hidden: true, access: { read: never } },
    { name: 'cursors', type: 'json', admin: { readOnly: true } },
    { name: 'counts', type: 'json', admin: { readOnly: true } },
    { name: 'progress', type: 'json', admin: { readOnly: true } },
    { name: 'report', type: 'json', admin: { readOnly: true } },
    { name: 'summary', type: 'json', admin: { readOnly: true } },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'confirmedBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'confirmedAt', type: 'date', admin: { readOnly: true } },
    { name: 'startedAt', type: 'date', admin: { readOnly: true } },
    { name: 'finishedAt', type: 'date', admin: { readOnly: true } },
    { name: 'purgeAfter', type: 'date', index: true, admin: { readOnly: true } },
    { name: 'purgedAt', type: 'date', admin: { readOnly: true } },
    { name: 'error', type: 'text', admin: { readOnly: true } },
  ],
}

export const ImportRefs: CollectionConfig = {
  slug: 'import-refs',
  labels: { singular: { fa: 'پیوند انتقال', en: 'Import ref' }, plural: { fa: 'پیوندهای انتقال', en: 'Import refs' } },
  admin: { useAsTitle: 'refKey', defaultColumns: ['kind', 'wpId', 'targetCollection', 'targetId', 'status'], group },
  access: { read: allow('import.view'), create: nobody, update: nobody, delete: nobody },
  // Idempotency key (ADR 011 §Idempotency): one ref per academy, source site, kind and WordPress id.
  indexes: [{ fields: ['tenant', 'site', 'kind', 'wpId'], unique: true }],
  fields: [
    { name: 'refKey', type: 'text', required: true, index: true },
    { name: 'site', type: 'text', required: true, index: true },
    { name: 'kind', type: 'text', required: true },
    { name: 'wpId', type: 'text', required: true },
    { name: 'targetCollection', type: 'text' },
    { name: 'targetId', type: 'text', index: true },
    // Media only: the Edvora file URL, used to rewrite `wp-content/uploads/...` links in imported HTML.
    { name: 'targetUrl', type: 'text' },
    { name: 'sourceChecksum', type: 'text' },
    { name: 'writtenChecksum', type: 'text' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'linked',
      index: true,
      options: [
        { value: 'linked', label: { fa: 'پیوند خورده', en: 'Linked' } },
        { value: 'held', label: { fa: 'نگه داشته', en: 'Held' } },
        { value: 'conflict', label: { fa: 'تعارض', en: 'Conflict' } },
        { value: 'skipped', label: { fa: 'ردشده', en: 'Skipped' } },
      ],
    },
    { name: 'reason', type: 'text' },
    // Minimal PII for held users (name, WP email, wpId) until an admin adds a phone. Purged with the raw bundle.
    { name: 'heldData', type: 'json' },
    // Also written to the record's own `sourceUrl` column (courses, posts, media, pages — E-030).
    { name: 'sourceUrl', type: 'text' },
    { name: 'job', type: 'relationship', relationTo: 'import-jobs', index: true },
  ],
}

/**
 * Old WordPress URLs → Edvora paths (ADR 011 §Redirects serving). No REST read for guests: the public catch-all
 * route looks rows up through the server with an explicit tenant filter.
 */
export const Redirects: CollectionConfig = {
  slug: 'redirects',
  labels: { singular: { fa: 'تغییر مسیر', en: 'Redirect' }, plural: { fa: 'تغییر مسیرها', en: 'Redirects' } },
  admin: { useAsTitle: 'from', defaultColumns: ['from', 'to', 'code', 'source', 'hits', 'active'], group: { fa: 'محتوا', en: 'Content' } },
  access: { read: allow('content.edit'), create: allowCreate('content.edit'), update: allow('content.edit'), delete: nobody },
  indexes: [{ fields: ['tenant', 'from'], unique: true }],
  hooks: {
    beforeChange: [guard({ create: ['content.edit'], update: ['content.edit'] })],
    afterChange: [auditChange('redirects')],
  },
  fields: [
    { name: 'from', type: 'text', required: true, index: true, admin: { description: 'Normalised old path, e.g. /course/برندسازی or /?p=12' } },
    { name: 'to', type: 'text', required: true, validate: (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) || 'A same-site path starting with /' },
    { name: 'code', type: 'number', required: true, defaultValue: 301 },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      options: [
        { value: 'wp-import', label: { fa: 'انتقال از وردپرس', en: 'WordPress import' } },
        { value: 'manual', label: { fa: 'دستی', en: 'Manual' } },
      ],
    },
    { name: 'job', type: 'relationship', relationTo: 'import-jobs', admin: { readOnly: true } },
    { name: 'hits', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'active', type: 'checkbox', defaultValue: true },
  ],
}
