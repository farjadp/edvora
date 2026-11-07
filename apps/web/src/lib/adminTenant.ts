import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import { headers } from 'next/headers'
import type { Payload, TypedUser } from 'payload'
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
