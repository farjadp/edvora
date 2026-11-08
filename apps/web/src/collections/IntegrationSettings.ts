import { INTEGRATION_KINDS, INTEGRATION_LABELS, INTEGRATION_PROVIDERS } from '@edvora/core'
import type { CollectionConfig } from 'payload'
import { allow, nobody } from '../access/permissions'
import { lockSandboxIntegrations } from '../access/sandbox'

/**
 * E-047 (ADR 019 §5): an academy's own provider for one kind (SMS, email, live classes). The key is sealed
 * (AES-256-GCM, bound to the academy and kind) in `secretSealed`, which is `hidden`: Payload never returns it over
 * REST, GraphQL or the admin. Create/update/delete are closed to the API; only the settings route handler writes,
 * after its own permission check, and writes the audit row.
 */
export const IntegrationSettings: CollectionConfig = {
  slug: 'integration-settings',
  labels: { singular: { fa: 'سرویس بیرونی', en: 'Integration' }, plural: { fa: 'سرویس‌های بیرونی', en: 'Integrations' } },
  admin: { hidden: true, useAsTitle: 'kind' },
  access: {
    read: allow('settings.integrations'),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  // E-029: demo sandboxes only ever hold the mock (ADR 013).
  hooks: { beforeValidate: [lockSandboxIntegrations] },
  indexes: [{ fields: ['tenant', 'kind'], unique: true }],
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: INTEGRATION_KINDS.map((k) => ({ value: k, label: INTEGRATION_LABELS[k].fa })),
    },
    {
      name: 'provider',
      type: 'select',
      required: true,
      defaultValue: 'mock',
      options: [...new Map(Object.values(INTEGRATION_PROVIDERS).flat().map((p) => [p.value, { value: p.value, label: p.fa }])).values()],
    },
    { name: 'enabled', type: 'checkbox', defaultValue: false },
    /** Non-secret settings only (sender line, SMTP host/port/from, BBB URL). Validated per provider in core. */
    { name: 'config', type: 'json' },
    { name: 'secretSealed', type: 'text', hidden: true, access: { read: () => false, create: () => false, update: () => false } },
    { name: 'secretSetAt', type: 'date' },
    {
      name: 'lastTest',
      type: 'group',
      fields: [
        { name: 'ok', type: 'checkbox' },
        { name: 'at', type: 'date' },
        { name: 'message', type: 'text' },
      ],
    },
  ],
}
