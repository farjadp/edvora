import 'server-only'
import { isPlatformHost, sandboxState } from '@edvora/core'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { sandboxConfig } from '../access/sandbox'
import { env } from '../env'
import type { Tenant } from '../payload-types'
import { getPayloadClient } from './payload'
import { SELECTOR_COOKIE, readSelector } from './sandbox/cookies'

/** Strips port and a leading "www." so example.com and www.example.com resolve to the same academy. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').toLowerCase().split(':')[0]!.replace(/^www\./, '')
}

/**
 * Demo sandbox selected by the signed `edvora_sbx` cookie (ADR 013). Honoured only on the platform host(s) and only
 * for tenants with `isSandbox = true`, so the cookie can never switch a request to a real academy, and academy
 * domains ignore it entirely. Returns the sandbox even after it ended (callers show the ended state, never data).
 */
export const getSelectedSandbox = cache(async (): Promise<Tenant | null> => {
  const host = normalizeHost((await headers()).get('host'))
  if (!isPlatformHost(host, sandboxConfig())) return null
  const sel = readSelector((await cookies()).get(SELECTOR_COOKIE)?.value)
  if (!sel) return null
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'tenants', where: { and: [{ id: { equals: sel.tid } }, { isSandbox: { equals: true } }] }, limit: 1, depth: 1, overrideAccess: true })
  return res.docs[0] ?? null
})

/** True when the current request is inside a sandbox whose time is up (server clock). */
export const isEndedSandbox = (tenant: Pick<Tenant, 'isSandbox' | 'expiresAt'>) => sandboxState(tenant) === 'expired'

/**
 * Resolves the academy for the current request from the Host header (custom domains),
 * falling back to DEFAULT_TENANT_SLUG for localhost and preview URLs. On the platform host a valid sandbox
 * selector cookie wins (ADR 013).
 */
export const getCurrentTenant = cache(async (): Promise<Tenant> => {
  const sandbox = await getSelectedSandbox()
  if (sandbox) return sandbox
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

/** E-047: public-site sections the academy switched off in the settings hub (default on). */
export const siteSectionOn = (tenant: Tenant, key: 'journal' | 'faculty' | 'verify' | 'leadForm'): boolean => tenant.toggles?.[key] !== false

export const tenantHasFeature = (tenant: Tenant, feature: NonNullable<Tenant['features']>[number]) =>
  Boolean(tenant.features?.includes(feature))
