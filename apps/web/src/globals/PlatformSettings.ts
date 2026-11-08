import { INTEGRATION_KINDS, INTEGRATION_LABELS, STAFF_2FA_POLICIES } from '@edvora/core'
import type { GlobalConfig } from 'payload'
import { platformAdmin } from '../access/permissions'
import { rememberPlatformSettings } from '../lib/platformSettings'

/**
 * E-047 (ADR 019 §2): platform-wide rules, Edvora super admins only. Provider keys stay in env (the platform
 * default); this only says whether academies may bring their own provider and what the staff 2FA policy is.
 */
export const PlatformSettings: GlobalConfig = {
  slug: 'platform-settings',
  label: { fa: 'تنظیمات پلتفرم', en: 'Platform settings' },
  admin: { hidden: true },
  access: {
    read: ({ req }) => platformAdmin(req),
    update: () => false,
  },
  hooks: {
    afterChange: [
      ({ doc }) => {
        rememberPlatformSettings(doc)
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'staff2fa',
      type: 'select',
      defaultValue: 'env',
      label: { fa: 'تأیید دومرحله‌ای کارکنان', en: 'Staff 2FA policy' },
      options: STAFF_2FA_POLICIES.map((p) => ({ value: p.value, label: p.fa })),
    },
    {
      name: 'academyProviders',
      type: 'group',
      label: { fa: 'سرویس اختصاصی آکادمی‌ها مجاز است', en: 'Academies may bring their own provider' },
      fields: INTEGRATION_KINDS.map((k) => ({ name: k, type: 'checkbox' as const, defaultValue: true, label: { fa: INTEGRATION_LABELS[k].fa, en: k } })),
    },
  ],
}
