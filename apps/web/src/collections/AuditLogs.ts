import type { CollectionConfig } from 'payload'
import { allow, nobody } from '../access/permissions'

/**
 * Append-only log of staff actions (Notion 11 §13). Written only by server hooks (`hooks/audit.ts`);
 * nobody can create, edit or delete rows through the API or the admin.
 */
export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: { fa: 'رویداد ممیزی', en: 'Audit entry' }, plural: { fa: 'گزارش ممیزی', en: 'Audit log' } },
  admin: {
    useAsTitle: 'action',
    defaultColumns: ['createdAt', 'actorEmail', 'action', 'targetCollection', 'docId'],
    group: { fa: 'اعضا و دسترسی', en: 'People & access' },
  },
  defaultSort: '-createdAt',
  access: {
    read: allow('audit.view'),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  fields: [
    { name: 'actor', type: 'relationship', relationTo: 'users', index: true, admin: { readOnly: true } },
    { name: 'actorEmail', type: 'text', admin: { readOnly: true } },
    { name: 'action', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'targetCollection', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'docId', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'changes', type: 'json', admin: { readOnly: true } },
    { name: 'note', type: 'text', admin: { readOnly: true } },
    { name: 'ip', type: 'text', admin: { readOnly: true } },
  ],
}
