import 'server-only'
import { normaliseLegacyPath } from '@edvora/core/wpimport'
import { after } from 'next/server'
import { getPayloadClient } from './payload'

/** WordPress object queries on the home page (ADR 011 §Redirects serving). */
export const WP_HOME_QUERY_KEYS = ['p', 'page_id', 'attachment_id', 'product', 'course', 'lesson', 'post_type'] as const

/**
 * Old WordPress URL → Edvora path for one academy, or null. Server-side lookup with an explicit tenant filter
 * (the collection has no public REST read). Only same-site paths are ever returned.
 */
export async function findRedirect(tenantId: number, pathWithQuery: string): Promise<string | null> {
  let from: string
  try {
    from = normaliseLegacyPath(pathWithQuery)
  } catch {
    return null
  }
  if (from === '/' ) return null
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'redirects',
    where: { and: [{ tenant: { equals: tenantId } }, { from: { equals: from } }, { active: { equals: true } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { to: true, hits: true },
  })
  const row = res.docs[0]
  if (!row || typeof row.to !== 'string' || !row.to.startsWith('/') || row.to.startsWith('//') || row.to.includes('\\')) return null
  const target = normaliseLegacyPath(row.to)
  if (target === from) return null // never loop
  after(async () => {
    await payload.update({ collection: 'redirects', id: row.id, data: { hits: (row.hits ?? 0) + 1 }, overrideAccess: true }).catch(() => undefined)
  })
  // Persian slugs are stored decoded; the Location header needs them percent-encoded.
  return encodeURI(row.to)
}

/** `?p=12` style query of the home page, as a path for `findRedirect`, or null when there is none. */
export function homeQueryPath(searchParams: Record<string, string | string[] | undefined>): string | null {
  const parts: string[] = []
  for (const key of WP_HOME_QUERY_KEYS) {
    const v = searchParams[key]
    const value = Array.isArray(v) ? v[0] : v
    if (value) parts.push(`${key}=${encodeURIComponent(value)}`)
  }
  // `post_type` needs its partner (`name` or `p`).
  const name = searchParams.name
  if (parts.length && typeof name === 'string') parts.push(`name=${encodeURIComponent(name)}`)
  return parts.length ? `/?${parts.join('&')}` : null
}
