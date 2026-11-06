import 'server-only'
import { headers } from 'next/headers'
import { cache } from 'react'
import { env } from '../env'
import type { Tenant } from '../payload-types'
import { getPayloadClient } from './payload'

/** Strips port and a leading "www." so example.com and www.example.com resolve to the same academy. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').toLowerCase().split(':')[0]!.replace(/^www\./, '')
}

/**
 * Resolves the academy for the current request from the Host header (custom domains),
 * falling back to DEFAULT_TENANT_SLUG for localhost and preview URLs.
 */
export const getCurrentTenant = cache(async (): Promise<Tenant> => {
  const payload = await getPayloadClient()
  const host = normalizeHost((await headers()).get('host'))

  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    const byDomain = await payload.find({
      collection: 'tenants',
      where: { 'domains.domain': { in: [host, `www.${host}`] } },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    })
    if (byDomain.docs[0]) return byDomain.docs[0]
  }

  const bySlug = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: env().DEFAULT_TENANT_SLUG } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const tenant = bySlug.docs[0]
  if (!tenant) {
    throw new Error(`No academy found for host "${host}" or DEFAULT_TENANT_SLUG "${env().DEFAULT_TENANT_SLUG}". Run pnpm seed.`)
  }
  return tenant
})

export const tenantHasFeature = (tenant: Tenant, feature: NonNullable<Tenant['features']>[number]) =>
  Boolean(tenant.features?.includes(feature))
