/**
 * Payload-backed lookups for the dry-run planner (`PlanContext`, ADR 011). Every lookup is scoped to the job's
 * tenant, except `findUserByPhone` (phones are global; an existing person only gains a membership).
 */
import type { EdvoraCollection, ImportRef, PlanContext, ProductCourseOverride, MapperId } from '@edvora/integrations/wordpress'
import type { Payload, PayloadRequest } from 'payload'
import { idOf } from '../ids'
import { docChecksum, WRITABLE } from './docValues'

export type RefRow = {
  id: number
  refKey: string
  kind: string
  wpId: string
  targetCollection?: string | null
  targetId?: string | null
  status: 'linked' | 'held' | 'conflict' | 'skipped'
  sourceChecksum?: string | null
  writtenChecksum?: string | null
  sourceUrl?: string | null
  targetUrl?: string | null
  reason?: string | null
}

export type JobChoices = {
  enabledMappers?: MapperId[]
  productCourseOverrides?: Record<string, ProductCourseOverride>
  approvedHosts?: string[]
  /** WP user id → phone the admin entered for a held user. */
  phoneOverrides?: Record<string, string>
}

const refMapKey = (kind: string, wpId: string) => `${kind}\u0000${wpId}`

/** All refs of one source site in one tenant, keyed by kind + wpId. */
export async function loadRefs(payload: Payload, tenantId: number, siteId: string, req?: PayloadRequest): Promise<Map<string, RefRow>> {
  const res = await payload.find({
    collection: 'import-refs',
    where: { and: [{ tenant: { equals: tenantId } }, { site: { equals: siteId } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const map = new Map<string, RefRow>()
  for (const d of res.docs as unknown as RefRow[]) map.set(refMapKey(d.kind, d.wpId), d)
  return map
}

export const refFrom = (refs: Map<string, RefRow>, kind: string, wpId: string) => refs.get(refMapKey(kind, wpId))

export function toImportRef(row: RefRow | undefined): ImportRef | null {
  if (!row) return null
  const target = row.targetId ? (/^\d+$/.test(row.targetId) ? Number(row.targetId) : row.targetId) : null
  return { targetId: target, status: row.status, sourceChecksum: row.sourceChecksum ?? null, writtenChecksum: row.writtenChecksum ?? null }
}

export async function planContext(input: {
  payload: Payload
  tenant: { id: number; slug: string }
  siteId: string
  choices: JobChoices
  req?: PayloadRequest
}): Promise<PlanContext> {
  const { payload, tenant, siteId, choices, req } = input
  const refs = await loadRefs(payload, tenant.id, siteId, req)
  const importedCoupons = new Set([...refs.values()].filter((r) => r.targetCollection === 'coupons' && r.targetId).map((r) => String(r.targetId)))
  return {
    tenantSlug: tenant.slug,
    siteId,
    enabledMappers: choices.enabledMappers,
    productCourseOverrides: choices.productCourseOverrides,
    findRef: async (kind, wpId) => toImportRef(refFrom(refs, kind, wpId)),
    findUserByPhone: async (phone) => {
      const res = await payload.find({ collection: 'users', where: { phone: { equals: phone } }, limit: 1, depth: 0, overrideAccess: true, req })
      const u = res.docs[0]
      return u ? { id: u.id } : null
    },
    currentChecksum: async (collection: EdvoraCollection, id, fields) => {
      if (!WRITABLE.has(collection)) return null
      try {
        const doc = (await payload.findByID({ collection: collection as never, id: id as never, depth: 0, overrideAccess: true, req })) as unknown as Record<string, unknown>
        // Tenant isolation: a ref can only ever point at a doc of this academy (users: a member of it).
        if (collection === 'users') {
          const tenants = Array.isArray(doc.tenants) ? doc.tenants.map((t) => idOf((t as { tenant?: unknown }).tenant)) : []
          if (!tenants.includes(tenant.id)) return null
        } else if (idOf(doc.tenant) !== tenant.id) return null
        return docChecksum(collection, doc, fields)
      } catch {
        return null
      }
    },
    findCouponByCode: async (code) => {
      const res = await payload.find({
        collection: 'coupons',
        where: { and: [{ tenant: { equals: tenant.id } }, { code: { equals: code.trim().toUpperCase() } }] },
        limit: 5,
        depth: 0,
        overrideAccess: true,
        req,
      })
      const other = res.docs.find((c) => !importedCoupons.has(String(c.id)))
      return other ? { id: other.id } : null
    },
  }
}
