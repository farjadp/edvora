import { REMINDER_RULES, REMINDER_RULE_LABELS, SEND_STATUSES, SEND_STATUS_LABELS } from '@edvora/core'
import type { CollectionConfig } from 'payload'
import { allow, nobody } from '../access/permissions'

/**
 * E-016 (ADR 020): one row per reminder per recipient — the idempotency record AND the send log. `key` is unique, so
 * a second worker run (or a second app instance) can never insert the same reminder twice. Written only by the
 * reminders worker (server code, overrideAccess); staff with `notifications.view` read it in their academy.
 * The full mobile number is kept for retries but never leaves the server (field read access: nobody); lists show
 * `toMasked`.
 */
export const SmsLog: CollectionConfig = {
  slug: 'sms-log',
  labels: { singular: { fa: 'پیامک یادآور', en: 'Reminder SMS' }, plural: { fa: 'گزارش پیامک‌های یادآور', en: 'Reminder SMS log' } },
  admin: {
    useAsTitle: 'toMasked',
    defaultColumns: ['createdAt', 'rule', 'stage', 'toMasked', 'status', 'attempts', 'provider'],
    group: { fa: 'پیام‌ها', en: 'Messages' },
    description: 'هر یادآور برای هر گیرنده یک بار. ناموفق‌ها خودکار با فاصلهٔ فزاینده دوباره فرستاده می‌شوند.',
  },
  defaultSort: '-createdAt',
  access: {
    read: allow('notifications.view'),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true, label: { fa: 'کلید یکتا', en: 'Idempotency key' }, admin: { readOnly: true } },
    {
      type: 'row',
      fields: [
        { name: 'rule', type: 'select', required: true, index: true, label: { fa: 'قاعده', en: 'Rule' }, options: REMINDER_RULES.map((r) => ({ value: r, label: REMINDER_RULE_LABELS[r] })), admin: { readOnly: true } },
        { name: 'stage', type: 'text', label: { fa: 'مرحله', en: 'Stage' }, admin: { readOnly: true } },
        {
          name: 'status',
          type: 'select',
          required: true,
          index: true,
          label: { fa: 'وضعیت', en: 'Status' },
          options: SEND_STATUSES.map((s) => ({ value: s, label: SEND_STATUS_LABELS[s] })),
          admin: { readOnly: true },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'recipient', type: 'relationship', relationTo: 'users', index: true, label: { fa: 'گیرنده', en: 'Recipient' }, admin: { readOnly: true } },
        { name: 'toMasked', type: 'text', label: { fa: 'موبایل', en: 'Mobile' }, admin: { readOnly: true } },
        // Full number for retries only. Never returned over REST/GraphQL/admin.
        { name: 'to', type: 'text', access: { read: () => false, create: () => false, update: () => false }, admin: { hidden: true } },
      ],
    },
    { name: 'text', type: 'textarea', label: { fa: 'متن فرستاده‌شده', en: 'Text' }, admin: { readOnly: true } },
    {
      type: 'row',
      fields: [
        { name: 'refCollection', type: 'text', label: { fa: 'مربوط به', en: 'Ref collection' }, admin: { readOnly: true } },
        { name: 'refId', type: 'number', index: true, label: { fa: 'شناسه', en: 'Ref id' }, admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'attempts', type: 'number', defaultValue: 0, label: { fa: 'تلاش‌ها', en: 'Attempts' }, admin: { readOnly: true } },
        { name: 'nextAttemptAt', type: 'date', index: true, label: { fa: 'تلاش بعدی', en: 'Next attempt' }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'expiresAt', type: 'date', label: { fa: 'اعتبار تا', en: 'Expires' }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'sentAt', type: 'date', label: { fa: 'زمان ارسال', en: 'Sent at' }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'provider', type: 'text', label: { fa: 'سرویس', en: 'Provider' }, admin: { readOnly: true } },
        { name: 'providerMessageId', type: 'text', label: { fa: 'شناسهٔ پیام در سرویس', en: 'Provider message id' }, admin: { readOnly: true } },
      ],
    },
    { name: 'error', type: 'text', label: { fa: 'خطا / دلیل', en: 'Error / reason' }, admin: { readOnly: true } },
  ],
}
