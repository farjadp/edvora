import type { Field } from 'payload'

/** Where an imported record came from (e.g. the academy's old website). Set by import scripts; read-only in admin. */
export const sourceUrlField: Field = {
  name: 'sourceUrl',
  type: 'text',
  label: { fa: 'نشانی منبع', en: 'Source URL' },
  admin: { position: 'sidebar', readOnly: true, description: { fa: 'از کجا وارد شده است', en: 'Where this was imported from' } },
}
