import { checkGrant, type Scope } from '@edvora/core'
import type { CollectionConfig, PayloadRequest, Where } from 'payload'
import { APIError } from 'payload'
import { assertManagersRemain } from '../access/managers'
import { allow, allowCreate, anyOf, asSystem, getAccess, invalidateAccess, isSystemWrite, nobody, ownRecords } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'

const idList = (v: unknown): number[] => (Array.isArray(v) ? v.map(idOf).filter((x): x is number => x !== null) : [])

type Snapshot = { roles: number[]; scope: Scope; status: 'active' | 'suspended'; expiresAt: string | null }

function snapshot(doc: Record<string, unknown> | undefined): Snapshot {
  const scope = (doc?.scope ?? {}) as Record<string, unknown>
  return {
    roles: idList(doc?.roles),
    scope: { courses: idList(scope.courses), cohorts: idList(scope.cohorts), ownRecordsOnly: Boolean(scope.ownRecordsOnly) },
    status: doc?.status === 'suspended' ? 'suspended' : 'active',
    expiresAt: typeof doc?.expiresAt === 'string' ? doc.expiresAt : null,
  }
}

/** Union of the roles' permissions; every role and scoped record must belong to the same academy. */
async function resolve(req: PayloadRequest, tenantId: number, s: Snapshot): Promise<string[]> {
  if (s.roles.length === 0) return []
  const roles = await req.payload.find({ collection: 'roles', where: { id: { in: s.roles } }, depth: 0, limit: s.roles.length, overrideAccess: true, req })
  if (roles.docs.length !== s.roles.length || roles.docs.some((r) => idOf(r.tenant) !== tenantId)) {
    throw new APIError('Every role must belong to this academy', 400)
  }
  for (const [collection, list] of [['courses', s.scope.courses], ['cohorts', s.scope.cohorts]] as const) {
    const wanted = idList(list)
    if (wanted.length === 0) continue
    const found = await req.payload.find({ collection, where: { and: [{ id: { in: wanted } }, { tenant: { equals: tenantId } }] }, depth: 0, limit: wanted.length, overrideAccess: true, req })
    if (found.docs.length !== wanted.length) throw new APIError(`Scope ${collection} must belong to this academy`, 400)
  }
  return [...new Set(roles.docs.filter((r) => !r.archived).flatMap((r) => r.permissions ?? []))]
}

/**
 * A person's access in one academy: roles + scope + status + optional expiry (ADR 006 §4, Notion 11 §3.3).
 * Several memberships per person and academy are allowed; their grants add up.
 */
export const Memberships: CollectionConfig = {
  slug: 'memberships',
  labels: { singular: { fa: 'عضویت و دسترسی', en: 'Membership' }, plural: { fa: 'عضویت‌ها و دسترسی‌ها', en: 'Memberships' } },
  admin: { useAsTitle: 'note', defaultColumns: ['user', 'roles', 'status', 'expiresAt'], group: { fa: 'اعضا و دسترسی', en: 'People & access' } },
  access: {
    read: anyOf(ownRecords('user'), allow('roles.view'), allow('roles.assign'), allow('users.view')),
    create: allowCreate('roles.assign'),
    update: allow('roles.assign'),
    delete: nobody,
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        const tenantId = idOf(data.tenant ?? originalDoc?.tenant)
        const userId = idOf(data.user ?? originalDoc?.user)
        if (!tenantId || !userId) throw new APIError('Academy and user are required', 400)
        if (operation === 'update' && (idOf(originalDoc?.tenant) !== tenantId || idOf(originalDoc?.user) !== userId)) {
          throw new APIError('A membership cannot move to another person or academy; create a new one', 400)
        }
        const after = snapshot({ ...(originalDoc ?? {}), ...data })
        const afterPerms = await resolve(req, tenantId, after)
        if (operation === 'create' && req.user) data.createdBy = req.user.id

        if (!req.user || isSystemWrite(req)) return data
        const ctx = await getAccess(req)
        if (!ctx) throw new APIError('Forbidden', 403)
        // No escalation: the actor must cover what the person will have, and (on change) what they had.
        const grantAfter = checkGrant(ctx, tenantId, { permissions: afterPerms, scope: after.scope }, userId)
        if (!grantAfter.ok) throw new APIError(grantAfter.reason === 'self' ? 'You cannot change your own roles' : grantAfter.reason, 403)
        if (operation === 'update' && originalDoc) {
          const before = snapshot(originalDoc)
          const grantBefore = checkGrant(ctx, tenantId, { permissions: await resolve(req, tenantId, before), scope: before.scope }, userId)
          if (!grantBefore.ok) throw new APIError(`You cannot change this membership: ${grantBefore.reason}`, 403)
        }
        const userDoc = await req.payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true, req })
        await assertManagersRemain(req, tenantId, {
          kind: 'membership',
          id: originalDoc?.id ?? null,
          row: { userId, tenantId, status: after.status, expiresAt: after.expiresAt, permissions: afterPerms, scope: after.scope, userStatus: userDoc.status ?? 'active' },
        })
        return data
      },
    ],
    afterChange: [
      async ({ doc, req }) => {
        invalidateAccess(req)
        // Keep the multi-tenant plugin's users.tenants in sync, so the person can see this academy at all.
        const tenantId = idOf(doc.tenant)
        const userId = idOf(doc.user)
        if (!tenantId || !userId) return doc
        const user = await req.payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true, req })
        const current = (user.tenants ?? []).map((t) => idOf(t.tenant)).filter((x): x is number => x !== null)
        if (!current.includes(tenantId)) {
          await asSystem(req, () =>
            req.payload.update({ collection: 'users', id: userId, overrideAccess: true, req, data: { tenants: [...current, tenantId].map((tenant) => ({ tenant })) } }),
          )
        }
        return doc
      },
      auditChange('memberships'),
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true, label: { fa: 'کاربر', en: 'User' } },
        {
          name: 'roles',
          type: 'relationship',
          relationTo: 'roles',
          hasMany: true,
          required: true,
          label: { fa: 'نقش‌ها', en: 'Roles' },
          filterOptions: ({ data }): Where => ({ and: [{ tenant: { equals: idOf(data?.tenant) ?? -1 } }, { archived: { not_equals: true } }] }),
        },
      ],
    },
    {
      name: 'scope',
      type: 'group',
      label: { fa: 'محدوده', en: 'Scope' },
      admin: { description: 'Empty = the whole academy.' },
      fields: [
        {
          name: 'courses',
          type: 'relationship',
          relationTo: 'courses',
          hasMany: true,
          label: { fa: 'فقط این دوره‌ها', en: 'Only these courses' },
          filterOptions: ({ data }) => ({ tenant: { equals: idOf(data?.tenant) ?? -1 } }),
        },
        {
          name: 'cohorts',
          type: 'relationship',
          relationTo: 'cohorts',
          hasMany: true,
          label: { fa: 'فقط این ورودی‌ها', en: 'Only these cohorts' },
          filterOptions: ({ data }) => ({ tenant: { equals: idOf(data?.tenant) ?? -1 } }),
        },
        { name: 'ownRecordsOnly', type: 'checkbox', defaultValue: false, label: { fa: 'فقط موارد خودش (سرنخ‌ها، تیکت‌ها)', en: 'Own records only (leads, tickets)' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'active',
          label: { fa: 'وضعیت', en: 'Status' },
          options: [
            { value: 'active', label: { fa: 'فعال', en: 'Active' } },
            { value: 'suspended', label: { fa: 'معلق', en: 'Suspended' } },
          ],
        },
        { name: 'expiresAt', type: 'date', label: { fa: 'تاریخ انقضا', en: 'Expires at' }, admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    { name: 'note', type: 'text', label: { fa: 'یادداشت', en: 'Note' }, admin: { description: 'e.g. مدرس مهمان ورودی هفدهم' } },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true }, access: { create: () => false, update: () => false } },
  ],
}
