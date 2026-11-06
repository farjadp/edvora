import {
  ACADEMY_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_GROUP_LABELS,
  canEditRole,
  validateRolePermissions,
  type PermissionGroup,
} from '@edvora/core'
import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { assertManagersRemain } from '../access/managers'
import { allow, allowCreate, anyOf, getAccess, invalidateAccess, isSystemWrite, nobody } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'

const groupOf = (p: string) =>
  (Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).find((g) => (PERMISSION_GROUPS[g] as readonly string[]).includes(p)) ?? 'academy'

/** Named, editable sets of permissions per academy (ADR 006 §4). Templates are seeded; admins add custom roles. */
export const Roles: CollectionConfig = {
  slug: 'roles',
  labels: { singular: { fa: 'نقش', en: 'Role' }, plural: { fa: 'نقش‌ها', en: 'Roles' } },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'key', 'template', 'archived'], group: { fa: 'اعضا و دسترسی', en: 'People & access' } },
  access: {
    read: anyOf(allow('roles.view'), allow('roles.assign'), allow('roles.manage')),
    create: allowCreate('roles.manage'),
    update: allow('roles.manage'),
    // Never deleted: archive instead, so history keeps its meaning.
    delete: nobody,
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        const tenantId = idOf(data.tenant ?? originalDoc?.tenant)
        if (!tenantId) throw new APIError('Academy is required', 400)
        if (operation === 'update' && idOf(originalDoc?.tenant) !== tenantId) throw new APIError('A role cannot move to another academy', 403)

        const after = (data.permissions ?? originalDoc?.permissions ?? []) as string[]
        const valid = validateRolePermissions(after)
        if (!valid.ok) throw new APIError(valid.reason, 400)
        data.permissions = valid.permissions

        const key = (data.key ?? originalDoc?.key) as string | undefined
        const clash = await req.payload.find({
          collection: 'roles',
          where: { and: [{ tenant: { equals: tenantId } }, { key: { equals: key } }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
        if (clash.docs.length) throw new APIError(`A role with key "${key}" already exists in this academy`, 400)

        if (!req.user || isSystemWrite(req)) return data
        const ctx = await getAccess(req)
        if (!ctx) throw new APIError('Forbidden', 403)
        const decision = canEditRole(ctx, tenantId, operation === 'update' ? ((originalDoc?.permissions ?? []) as string[]) : null, valid.permissions)
        if (!decision.ok) throw new APIError(decision.reason, 403)
        if (operation === 'update' && originalDoc) {
          await assertManagersRemain(req, tenantId, { kind: 'role', id: originalDoc.id, permissions: valid.permissions, archived: Boolean(data.archived ?? originalDoc.archived) })
        }
        return data
      },
    ],
    afterChange: [
      ({ req, doc }) => {
        invalidateAccess(req)
        return doc
      },
      auditChange('roles'),
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, label: { fa: 'نام نقش', en: 'Name' } },
        {
          name: 'key',
          type: 'text',
          required: true,
          index: true,
          label: { fa: 'شناسه', en: 'Key' },
          admin: { description: 'Lowercase latin, e.g. sales-lead' },
          validate: (v: unknown) => (typeof v === 'string' && /^[a-z][a-z0-9-]{1,40}$/.test(v)) || 'Lowercase latin letters, digits and dashes',
        },
      ],
    },
    { name: 'description', type: 'textarea', label: { fa: 'توضیح', en: 'Description' } },
    {
      name: 'permissions',
      type: 'select',
      hasMany: true,
      label: { fa: 'دسترسی‌ها', en: 'Permissions' },
      options: ACADEMY_PERMISSIONS.map((p) => ({ value: p, label: { fa: `${PERMISSION_GROUP_LABELS[groupOf(p)].fa} · ${p}`, en: `${PERMISSION_GROUP_LABELS[groupOf(p)].en} · ${p}` } })),
    },
    {
      type: 'row',
      fields: [
        {
          name: 'template',
          type: 'text',
          label: { fa: 'از قالب', en: 'From template' },
          admin: { readOnly: true, description: 'Set by the seed for the built-in templates.' },
          access: { create: () => false, update: () => false },
        },
        { name: 'archived', type: 'checkbox', defaultValue: false, label: { fa: 'بایگانی', en: 'Archived' }, admin: { description: 'Archived roles grant nothing.' } },
      ],
    },
  ],
}
