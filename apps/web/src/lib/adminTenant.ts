import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import { headers } from 'next/headers'
import { cache } from 'react'
import { activeMemberships, isPlatformAdmin, mergeExperience } from '@edvora/core'
import type { StaffPerms } from '@edvora/core/staff'
import { createLocalReq, type Payload, type PayloadRequest, type TypedUser } from 'payload'
import { getAccess } from '../access/permissions'
import type { ConsoleScope } from './consoleData'
import type { Tenant } from '../payload-types'

export type AdminTenantContext = {
  user: TypedUser | null
  /** The academy picked in the nav selector (cookie `payload-tenant`), only if this user may read it. */
  tenant: Pick<Tenant, 'id' | 'name' | 'primaryColor' | 'accentColor'> | null
}

/**
 * Who is looking at /admin and which academy they have selected. Read-only: access rules apply
 * (`overrideAccess: false`), so a stale or foreign cookie simply yields `tenant: null`.
 */
export async function getAdminTenantContext(payload: Payload): Promise<AdminTenantContext> {
  const hdrs = await headers()
  const { user } = await payload.auth({ headers: hdrs })
  if (!user) return { user: null, tenant: null }
  const selected = getTenantFromCookie(hdrs, 'number')
  if (typeof selected !== 'number') return { user, tenant: null }
  try {
    const tenant = await payload.findByID({
      collection: 'tenants',
      id: selected,
      depth: 0,
      user,
      overrideAccess: false,
      select: { name: true, primaryColor: true, accentColor: true },
    })
    return { user, tenant }
  } catch {
    return { user, tenant: null }
  }
}

export type AdminConsoleContext = {
  user: TypedUser
  tenant: AdminTenantContext['tenant']
  /** A request carrying the user (and their session id, so 2FA state applies) for access-checked queries. */
  req: PayloadRequest
  /** Permissions that count for this view: the selected academy's, else every active membership's. */
  who: StaffPerms
  scope: ConsoleScope
}

/**
 * Everything the /admin console pieces (nav, header, dashboard, list KPIs) need, from the database per request:
 * the selected academy, the user's real permissions there (memberships, ADR 006) and the explicit query scope.
 * Platform admin without a selection = the whole platform; academy staff without a selection = their academies.
 * Cached per request (`react.cache`): the nav, header, dashboard and list strip share one membership load.
 */
export const getAdminConsoleContext = cache(async (payload: Payload): Promise<AdminConsoleContext | null> => {
  const { user, tenant } = await getAdminTenantContext(payload)
  if (!user) return null
  const req = await createLocalReq({ user }, payload)
  const ctx = await getAccess(req)
  if (!ctx) return null
  const platform = isPlatformAdmin(ctx)
  const active = activeMemberships(ctx).filter((m) => !tenant || String(m.tenantId) === String(tenant.id))
  // E-039 (ADR 016): menus and dashboard widgets follow the experience settings of the roles that grant here.
  const experience = mergeExperience(platform ? [] : active.filter((m) => m.permissions.length > 0).flatMap((m) => m.experience ?? []))
  const who: StaffPerms = { isPlatformAdmin: platform, permissions: [...new Set(active.flatMap((m) => m.permissions))], experience }
  const scope: ConsoleScope = tenant
    ? { kind: 'academy', tenantId: tenant.id }
    : platform
      ? { kind: 'platform' }
      : { kind: 'mine', tenantIds: [...new Set(activeMemberships(ctx).filter((m) => m.permissions.length > 0).map((m) => Number(m.tenantId)))] }
  return { user, tenant, req, who, scope }
})
