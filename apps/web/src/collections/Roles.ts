import {
  ACADEMY_PERMISSIONS,
  DASHBOARD_WIDGETS,
  LANDING_OPTIONS,
  MAX_SESSION_HOURS,
  MENU_SECTIONS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  PERMISSION_GROUP_LABELS,
  canEditRole,
  validateRolePermissions,
  validateRoleSettings,
  type PermissionGroup,
  type RoleSettingsInput,
} from '@edvora/core'
import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { assertManagersRemain } from '../access/managers'
import { allow, allowCreate, anyOf, getAccess, invalidateAccess, isSystemWrite, nobody } from '../access/permissions'
import { auditChange } from '../hooks/audit'
import { idOf } from '../lib/ids'

const groupOf = (p: string) =>
  (Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).find((g) => (PERMISSION_GROUPS[g] as readonly string[]).includes(p)) ?? 'academy'

const opts = (list: readonly { value: string; fa: string; en: string }[]) => list.map((o) => ({ value: o.value, label: { fa: o.fa, en: o.en } }))

/** Named, editable sets of permissions per academy (ADR 006 §4) + security and experience settings (ADR 016). */
export const Roles: CollectionConfig = {
  slug: 'roles',
  labels: { singular: { fa: 'نقش', en: 'Role' }, plural: { fa: 'نقش‌ها', en: 'Roles' } },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'key', 'template', 'archived'],
    group: { fa: 'اعضا و دسترسی', en: 'People & access' },
    // E-039: link to the who-can-do-what table across the academy's roles.
    components: { beforeList: ['/components/admin/RolesCompareLink#RolesCompareLink'] },
  },
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

        const settings: RoleSettingsInput = {
          security: (data.security ?? originalDoc?.security) as RoleSettingsInput['security'],
          experience: (data.experience ?? originalDoc?.experience) as RoleSettingsInput['experience'],
        }
        const checked = validateRoleSettings(settings)
        if (!checked.ok) throw new APIError(checked.reason, 400)

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
      type: 'tabs',
      tabs: [
        {
          label: { fa: 'دسترسی‌ها', en: 'Permissions' },
          fields: [
            {
              name: 'permissions',
              type: 'select',
              hasMany: true,
              label: { fa: 'دسترسی‌ها', en: 'Permissions' },
              admin: { components: { Field: '/components/admin/PermissionsField#PermissionsField' } },
              options: ACADEMY_PERMISSIONS.map((p) => {
                const g = PERMISSION_GROUP_LABELS[groupOf(p)]
                const d = PERMISSION_DESCRIPTIONS[p]
                return { value: p, label: { fa: `${g.fa} · ${d.fa} (${p})`, en: `${g.en} · ${d.en} (${p})` } }
              }),
            },
          ],
        },
        {
          label: { fa: 'امنیت', en: 'Security' },
          description: {
            fa: 'این قانون‌ها روی همین نقش اعمال می‌شوند: اگر برقرار نباشند، این نقش در آن نشست هیچ دسترسی‌ای نمی‌دهد. نقش‌های دیگر همان شخص کار می‌کنند.',
            en: 'Rules for this role only: when one fails, this role grants nothing in that session. The person\'s other roles keep working.',
          },
          fields: [
            {
              name: 'security',
              type: 'group',
              label: false,
              fields: [
                {
                  name: 'require2fa',
                  type: 'checkbox',
                  defaultValue: false,
                  label: { fa: 'تأیید دومرحله‌ای اجباری', en: 'Require two-factor authentication' },
                  admin: { description: { fa: 'تا کد برنامهٔ احراز هویت در همین نشست وارد نشود، این نقش کار نمی‌کند.', en: 'The role works only after this session passed the authenticator code.' } },
                },
                {
                  name: 'maxSessionHours',
                  type: 'number',
                  min: 1,
                  max: MAX_SESSION_HOURS,
                  label: { fa: 'حداکثر مدت نشست (ساعت)', en: 'Maximum session length (hours)' },
                  admin: { description: { fa: 'خالی یعنی بدون محدودیت. پس از این مدت از ورود، دوباره باید وارد شد.', en: 'Empty = no limit. After this many hours from sign-in the person must sign in again.' }, step: 1 },
                },
                {
                  name: 'loginHours',
                  type: 'group',
                  label: { fa: 'ساعت‌های مجاز ورود (به وقت تهران)', en: 'Allowed sign-in hours (Tehran time)' },
                  fields: [
                    { name: 'enabled', type: 'checkbox', defaultValue: false, label: { fa: 'فقط در این ساعت‌ها', en: 'Only during these hours' } },
                    {
                      type: 'row',
                      fields: [
                        {
                          name: 'from',
                          type: 'number',
                          min: 0,
                          max: 23,
                          label: { fa: 'از ساعت', en: 'From hour' },
                          admin: { condition: (_d, sibling) => Boolean(sibling?.enabled), step: 1, width: '50%' },
                        },
                        {
                          name: 'to',
                          type: 'number',
                          min: 0,
                          max: 23,
                          label: { fa: 'تا ساعت', en: 'Until hour' },
                          admin: {
                            condition: (_d, sibling) => Boolean(sibling?.enabled),
                            step: 1,
                            width: '50%',
                            description: { fa: 'مثلاً ۸ تا ۱۸. اگر «از» بزرگ‌تر باشد، بازه از نیمه‌شب می‌گذرد (۲۲ تا ۶).', en: 'E.g. 8 to 18. If "from" is larger, the window wraps midnight (22 to 6).' },
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: { fa: 'تجربهٔ کاربری', en: 'Experience' },
          description: {
            fa: 'فقط ظاهر را تنظیم می‌کند: چیزی را پنهان می‌کند، دسترسی نمی‌دهد. دسترسی همچنان با فهرست دسترسی‌ها تعیین می‌شود.',
            en: 'Appearance only: it can hide things, never grant them. Access is still decided by the permissions.',
          },
          fields: [
            {
              name: 'experience',
              type: 'group',
              label: false,
              fields: [
                {
                  name: 'landing',
                  type: 'select',
                  defaultValue: 'auto',
                  options: opts(LANDING_OPTIONS),
                  label: { fa: 'صفحهٔ شروع پس از ورود', en: 'Landing page after sign-in' },
                  admin: { description: { fa: 'اگر شخص به آن صفحه دسترسی نداشته باشد، صفحهٔ خودکار باز می‌شود.', en: 'If the person cannot open it, the automatic landing is used.' } },
                },
                {
                  name: 'menuSections',
                  type: 'select',
                  hasMany: true,
                  options: opts(MENU_SECTIONS),
                  label: { fa: 'بخش‌های منو', en: 'Menu sections' },
                  admin: { description: { fa: 'خالی یعنی همهٔ بخش‌هایی که دسترسی‌اش را دارد.', en: 'Empty = every section the person has access to.' } },
                },
                {
                  name: 'dashboardWidgets',
                  type: 'select',
                  hasMany: true,
                  options: opts(DASHBOARD_WIDGETS),
                  label: { fa: 'ویجت‌های داشبورد', en: 'Dashboard widgets' },
                  admin: { description: { fa: 'خالی یعنی همهٔ ویجت‌ها.', en: 'Empty = every widget.' } },
                },
              ],
            },
          ],
        },
      ],
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
