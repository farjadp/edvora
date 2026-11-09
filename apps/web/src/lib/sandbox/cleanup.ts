import 'server-only'
import { PROTECTED_TENANT_SLUGS, selectForPurge, selectForRevoke, type SandboxConfig } from '@edvora/core'
import type { CollectionSlug, Payload } from 'payload'
import { SYSTEM_CONTEXT } from '../../access/permissions'
import { idOf } from '../ids'

/**
 * Tenant-owned collections, children before parents (FKs to tenants are ON DELETE SET NULL on NOT NULL columns,
 * so every row must go before its tenant). Media and submission files go through Payload so their files on disk
 * are removed too. Must list every collection in multiTenantPlugin.collections (payload.config.ts); purgeTenant
 * refuses to run if one is missing.
 */
const PURGE_ORDER: CollectionSlug[] = [
  // E-023: refunds and contact notes point at orders and users.
  'refunds',
  'finance-contacts',
  // E-047 (develop): the academy's own SMS / email / live provider rows.
  'integration-settings',
  // E-046 (develop): AI assistant. Its vectors (raw `ai_chunks` table) go with the tenant (FK ON DELETE CASCADE).
  'ai-actions',
  'ai-messages',
  'ai-memories',
  'ai-conversations',
  'ai-documents',
  'ai-settings',
  // E-045 (develop): payments before orders; receipts are uploads, deleted through Payload with their files.
  'payment-receipts',
  'payments',
  'payment-methods',
  // E-028 / E-033 / E-032 (develop): ledger, live classes, WordPress import — all point at users/courses/sessions.
  'learning-events',
  'attendance',
  'live-events',
  'live-sessions',
  'import-refs',
  'import-jobs',
  'import-nonces',
  'import-connections',
  'redirects',
  'pages',
  'quiz-attempts',
  'submissions',
  'submission-files',
  'enrollments',
  'orders',
  'certificates',
  'leads',
  'assignments',
  'quizzes',
  'questions',
  'lessons',
  'cohorts',
  'coupons',
  'testimonials',
  'posts',
  'memberships',
  'audit-logs',
  'courses',
  'roles',
  'media',
]

const BATCH = 200

/** Collections that carry the multi-tenant plugin's `tenant` field (so must be purged with the tenant). */
function tenantOwnedSlugs(payload: Payload): Record<string, true> {
  const out: Record<string, true> = {}
  for (const c of payload.config.collections) {
    // demo-sandboxes points at tenants but is platform-owned: it outlives the sandbox (status → purged).
    if (c.slug === 'tenants' || c.slug === 'users' || c.slug === 'demo-sandboxes' || c.slug.startsWith('payload-')) continue
    if (c.flattenedFields.some((f) => f.name === 'tenant' && f.type === 'relationship' && f.relationTo === 'tenants')) out[c.slug] = true
  }
  return out
}

/** Deletes rows of one collection in one tenant until none are left (idempotent, resumable). */
async function purgeCollection(payload: Payload, collection: CollectionSlug, where: Parameters<Payload['delete']>[0]['where']): Promise<number> {
  let removed = 0
  for (;;) {
    const page = await payload.find({ collection, where, limit: BATCH, depth: 0, overrideAccess: true, pagination: false, select: {} })
    if (page.docs.length === 0) return removed
    const res = await payload.delete({ collection, where: { id: { in: page.docs.map((d) => d.id) } }, overrideAccess: true, depth: 0, context: { [SYSTEM_CONTEXT]: true } })
    if (res.errors.length) throw new Error(`purge ${collection}: ${res.errors.map((e) => e.message).join('; ')}`)
    removed += res.docs.length
  }
}

/**
 * Hard-deletes one sandbox: every tenant-owned row, its accounts (users with `sandboxTenant` = it), then the tenant.
 * THE ONE PLACE HARD DELETE IS ALLOWED (ADR 013). Refuses anything that is not `isSandbox === true` or has a
 * protected slug, re-checked here against the DB even though the caller already selected it.
 * Safe to re-run after a crash: each step deletes what is left.
 */
export async function purgeTenant(payload: Payload, tenantId: number): Promise<{ rows: number }> {
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!tenant) return { rows: 0 }
  if (tenant.isSandbox !== true || PROTECTED_TENANT_SLUGS.includes(tenant.slug.toLowerCase())) {
    throw new Error(`refusing to purge non-sandbox tenant ${tenantId} (${tenant.slug})`)
  }
  const owned = Object.keys(tenantOwnedSlugs(payload))
  const missing = owned.filter((s) => !PURGE_ORDER.includes(s as CollectionSlug))
  if (missing.length) throw new Error(`purge order is missing tenant-owned collections: ${missing.join(', ')}`)
  let rows = 0
  for (const c of PURGE_ORDER) rows += await purgeCollection(payload, c, { tenant: { equals: tenantId } })

  // Real accounts that were ever linked to this sandbox (e.g. a platform admin who opened it) only lose the link.
  const linked = await payload.find({ collection: 'users', where: { and: [{ 'tenants.tenant': { equals: tenantId } }, { sandboxTenant: { not_equals: tenantId } }] }, depth: 0, limit: 500, pagination: false, overrideAccess: true })
  for (const u of linked.docs) {
    await payload.update({
      collection: 'users',
      id: u.id,
      overrideAccess: true,
      depth: 0,
      context: { [SYSTEM_CONTEXT]: true },
      data: { tenants: (u.tenants ?? []).filter((t) => idOf(t.tenant) !== tenantId).map((t) => ({ tenant: idOf(t.tenant)! })) },
    })
  }
  rows += await purgeCollection(payload, 'users', { sandboxTenant: { equals: tenantId } })
  // Before the tenant goes (its FK on the record is SET NULL). If the delete below fails, the next run re-selects the
  // tenant and repeats this, so the record never says "purged" for long while data remains.
  await payload.update({ collection: 'demo-sandboxes', where: { tenant: { equals: tenantId } }, overrideAccess: true, depth: 0, data: { status: 'purged', purgedAt: new Date().toISOString() } })
  await payload.delete({ collection: 'tenants', id: tenantId, overrideAccess: true, depth: 0, context: { [SYSTEM_CONTEXT]: true } })
  return { rows: rows + 1 }
}

/**
 * Ends access for expired sandboxes still in their grace period (defence in depth for E2): accounts suspended and
 * their Payload sessions dropped, so even a copied token is dead. Real-time checks (proxy, tenant expiry, membership
 * expiry, beforeLogin) already refuse them; this makes it permanent in the DB.
 */
async function revokeTenant(payload: Payload, tenantId: number): Promise<number> {
  const res = await payload.find({ collection: 'users', where: { and: [{ sandboxTenant: { equals: tenantId } }, { status: { equals: 'active' } }] }, depth: 0, limit: 500, pagination: false, overrideAccess: true })
  for (const u of res.docs) {
    await payload.update({ collection: 'users', id: u.id, overrideAccess: true, depth: 0, context: { [SYSTEM_CONTEXT]: true }, data: { status: 'suspended', statusReason: 'پایان آکادمی آزمایشی', sessions: [] } })
  }
  return res.docs.length
}

export type CleanupReport = { revoked: number; purged: number[]; failed: { id: number; error: string }[]; staleReservations: number }

/**
 * The cron job (every ~10 min, POST /demo/api/cleanup). Idempotent: running it twice does nothing new.
 * Selection is done twice: in the DB query (`isSandbox = true`) and again by the pure `selectForPurge`.
 */
export async function runSandboxCleanup(payload: Payload, cfg: SandboxConfig, now = new Date()): Promise<CleanupReport> {
  const res = await payload.find({
    collection: 'tenants',
    where: { isSandbox: { equals: true } },
    depth: 0,
    limit: 1000,
    pagination: false,
    overrideAccess: true,
    select: { slug: true, isSandbox: true, expiresAt: true, purgeAt: true },
  })
  const candidates = res.docs.map((t) => ({ id: t.id, slug: t.slug, isSandbox: t.isSandbox, expiresAt: t.expiresAt, purgeAt: t.purgeAt }))
  const toPurge = selectForPurge(candidates, now, cfg.graceHours)
  const report: CleanupReport = { revoked: 0, purged: [], failed: [], staleReservations: 0 }

  for (const id of selectForRevoke(candidates, now).filter((id) => !toPurge.includes(id))) {
    try {
      report.revoked += await revokeTenant(payload, id)
    } catch (err) {
      payload.logger.error({ err, msg: 'sandbox revoke failed', tenant: id })
    }
  }
  for (const id of toPurge) {
    try {
      await purgeTenant(payload, id)
      report.purged.push(id)
      payload.logger.info({ msg: 'sandbox purged', tenant: id })
    } catch (err) {
      // Logged and retried on the next run; never stops the other sandboxes.
      report.failed.push({ id, error: String((err as Error)?.message ?? err).slice(0, 300) })
      payload.logger.error({ err, msg: 'sandbox purge failed', tenant: id })
    }
  }
  // Reservations whose build never finished (process died) and that are past expiry: mark failed.
  const stale = await payload.update({
    collection: 'demo-sandboxes',
    where: { and: [{ status: { equals: 'creating' } }, { expiresAt: { less_than: now.toISOString() } }] },
    overrideAccess: true,
    depth: 0,
    data: { status: 'failed', error: 'build did not finish' },
  })
  report.staleReservations = stale.docs.length
  return report
}

/** Operator "delete now" (O1): end it at once and purge immediately. */
export async function deleteSandboxNow(payload: Payload, tenantId: number): Promise<void> {
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!tenant || tenant.isSandbox !== true) throw new Error('not a sandbox')
  const now = new Date().toISOString()
  await payload.update({ collection: 'tenants', id: tenantId, overrideAccess: true, depth: 0, context: { [SYSTEM_CONTEXT]: true }, data: { expiresAt: now, purgeAt: now } })
  await purgeTenant(payload, tenantId)
}
