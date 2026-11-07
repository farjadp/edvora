/**
 * Commit phase (ADR 011 §Pipeline 6–9), run by the Payload jobs queue. Works from the plan file written at confirm:
 * media first (so courses/posts can point at it and HTML can be rewritten), then every other draft in dependency
 * order, 200 per transaction, redirects last (they are last in COLLECTION_ORDER). Each call stops after its time
 * budget and reports whether there is more; the cursor is saved in the same transaction as the batch.
 *
 * Tenant isolation: the tenant comes from the job row (never from the plan file), every write sets it, every
 * update checks the target doc belongs to it. Writes run as trusted server code (no user; `edvoraSystem` context).
 */
import {
  COLLECTION_ORDER,
  fieldsChecksum,
  type EdvoraCollection,
  type ImportPlan,
  type PlannedDraft,
} from '@edvora/integrations/wordpress'
import { randomBytes } from 'node:crypto'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, ValidationError, type Payload, type PayloadRequest } from 'payload'
import { SYSTEM_CONTEXT } from '../../access/permissions'
import type { ImportJob } from '../../payload-types'
import { idOf } from '../ids'
import { COMMIT_BATCH, RETENTION_DAYS } from './constants'
import { loadRefs, refFrom, type RefRow } from './ctx'
import { docChecksum, parseRefKey, placeholderEmail, toDocData, unionIds, UnresolvedRef, WRITABLE } from './docValues'
import type { MediaResolver } from './htmlToLexical'
import { titleOf } from './report'
import { allowedHosts, pullMediaWithRetry, PullError } from './ssrf'
import { readStored, removeStored } from './storage'

type Tenant = { id: number; slug: string }

export type CommitSummary = {
  counts: Partial<Record<EdvoraCollection, Record<string, number>>>
  failures: { refKey: string; collection: EdvoraCollection; message: string }[]
  conflicts: { refKey: string; collection: EdvoraCollection; title: string; targetId: string | number | null; reason: string | null; resolved?: 'keep' | 'wp' }[]
  media: { pulled: number; failed: { url: string; reason: string }[]; skippedHosts: string[] }
  notWritten: Partial<Record<EdvoraCollection, number>>
}

const emptySummary = (): CommitSummary => ({ counts: {}, failures: [], conflicts: [], media: { pulled: 0, failed: [], skippedHosts: [] }, notWritten: {} })
const CAP = 500

function bump(s: CommitSummary, c: EdvoraCollection, action: string) {
  const row = (s.counts[c] ??= {})
  row[action] = (row[action] ?? 0) + 1
}

async function systemReq(payload: Payload): Promise<PayloadRequest> {
  const req = await createLocalReq({}, payload)
  req.context[SYSTEM_CONTEXT] = true
  return req
}

export async function loadJobForTask(payload: Payload, jobId: number, tenantId: number): Promise<{ job: ImportJob; tenant: Tenant } | null> {
  const res = await payload.find({ collection: 'import-jobs', where: { and: [{ id: { equals: jobId } }, { tenant: { equals: tenantId } }] }, limit: 1, depth: 0, overrideAccess: true, showHiddenFields: true })
  const job = res.docs[0]
  if (!job) return null
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true })
  return { job, tenant: { id: tenant.id, slug: tenant.slug } }
}

async function loadPlan(job: ImportJob): Promise<ImportPlan> {
  if (!job.planFile) throw new Error('Plan file missing')
  return JSON.parse((await readStored(job.planFile)).toString('utf8')) as ImportPlan
}

const summaryOf = (job: ImportJob): CommitSummary => ({ ...emptySummary(), ...((job.summary as Partial<CommitSummary> | null) ?? {}) })
const cursorsOf = (job: ImportJob) => ({ media: 0, records: 0, ...((job.cursors as Record<string, number> | null) ?? {}) })

// ---------------------------------------------------------------- refs

class RefWriter {
  constructor(
    private readonly payload: Payload,
    private readonly tenant: Tenant,
    private readonly siteId: string,
    private readonly jobId: number,
    readonly refs: Map<string, RefRow>,
  ) {}

  get(refKey: string): RefRow | undefined {
    const p = parseRefKey(refKey)
    return p ? refFrom(this.refs, p.kind, p.wpId) : undefined
  }

  /** Edvora id of a linked ref, or null. */
  resolve = (refKey: string): number | string | null => {
    const r = this.get(refKey)
    if (!r || r.status !== 'linked' || !r.targetId) return null
    return /^\d+$/.test(r.targetId) ? Number(r.targetId) : r.targetId
  }

  async upsert(req: PayloadRequest, d: Pick<PlannedDraft, 'refKey' | 'kind' | 'wpId'>, data: Partial<RefRow> & { heldData?: unknown }): Promise<void> {
    const existing = this.get(d.refKey)
    const row = { refKey: d.refKey, site: this.siteId, kind: d.kind, wpId: d.wpId, job: this.jobId, tenant: this.tenant.id, ...data }
    let saved: RefRow
    if (existing) saved = (await this.payload.update({ collection: 'import-refs', id: existing.id, data: row as never, overrideAccess: true, req })) as unknown as RefRow
    else saved = (await this.payload.create({ collection: 'import-refs', data: row as never, overrideAccess: true, req })) as unknown as RefRow
    this.refs.set(`${d.kind}\u0000${d.wpId}`, saved)
  }
}

// ---------------------------------------------------------------- media

/** Media phase: pull approved files, create Edvora media docs, link refs. Returns true when more work remains. */
export async function runMediaPhase(payload: Payload, jobId: number, tenantId: number, deadline: number): Promise<boolean> {
  const loaded = await loadJobForTask(payload, jobId, tenantId)
  if (!loaded || loaded.job.status !== 'media') return false
  const { job, tenant } = loaded
  const plan = await loadPlan(job)
  const site = (job.site as { siteId?: string; homeUrl?: string } | null) ?? {}
  const siteId = site.siteId ?? plan.siteId
  const manifest = (job.manifest as { site?: { homeUrl?: string; siteUrl?: string; uploadsBaseUrl?: string } } | null) ?? {}
  const approved = ((job.choices as { approvedHosts?: string[] } | null)?.approvedHosts ?? []).map((h) => h.toLowerCase())
  const hosts = allowedHosts([manifest.site?.homeUrl, manifest.site?.siteUrl, manifest.site?.uploadsBaseUrl], approved)
  const refs = new RefWriter(payload, tenant, siteId, job.id, await loadRefs(payload, tenant.id, siteId))
  const summary = summaryOf(job)
  const cursors = cursorsOf(job)
  const drafts = new Map(plan.drafts.media.map((d) => [d.refKey, d]))
  const list = plan.mediaToPull

  while (cursors.media < list.length && Date.now() < deadline) {
    const m = list[cursors.media]!
    cursors.media++
    const d = drafts.get(m.refKey)
    if (!d) continue
    let host = ''
    try {
      host = new URL(m.url).host.toLowerCase()
    } catch {
      host = ''
    }
    if (!hosts.has(host)) {
      if (!summary.media.skippedHosts.includes(host)) summary.media.skippedHosts.push(host)
      bump(summary, 'media', 'skipped')
      continue
    }
    try {
      const file = await pullMediaWithRetry(m.url, { hosts })
      const req = await systemReq(payload)
      const name = `${(String(d.fields.filename ?? '') || `media-${d.wpId}`).replace(/\.[a-z0-9]+$/i, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'media'}-${randomBytes(3).toString('hex')}.${file.kind.ext}`
      const data = { tenant: tenant.id, alt: String(d.fields.alt ?? name).slice(0, 200) }
      const doc = d.targetId && d.action === 'update'
        ? await payload.update({ collection: 'media', id: Number(d.targetId), data, overrideAccess: true, req })
        : await payload.create({ collection: 'media', data, file: { data: file.bytes, mimetype: file.kind.mime, name, size: file.bytes.byteLength }, overrideAccess: true, req })
      const written = docChecksum('media', doc as unknown as Record<string, unknown>, d.checksumFields)
      await refs.upsert(req, d, { status: 'linked', targetCollection: 'media', targetId: String(doc.id), targetUrl: doc.url ?? null, sourceChecksum: d.sourceChecksum, writtenChecksum: written, sourceUrl: m.url, reason: null })
      summary.media.pulled++
      bump(summary, 'media', d.action === 'update' ? 'update' : 'create')
    } catch (err) {
      const reason = err instanceof PullError ? err.code : err instanceof Error ? err.message.slice(0, 120) : 'error'
      if (summary.media.failed.length < CAP) summary.media.failed.push({ url: m.url, reason })
      bump(summary, 'media', 'failed')
    }
  }
  const done = cursors.media >= list.length
  const progress = { ...((job.progress as Record<string, unknown> | null) ?? {}), phase: done ? 'records' : 'media', media: { done: cursors.media, total: list.length }, updatedAt: new Date().toISOString() }
  await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { cursors, summary: summary as never, progress, ...(done ? { status: 'committing' } : {}) } })
  return !done
}

// ---------------------------------------------------------------- records

type WriteCtx = {
  payload: Payload
  req: PayloadRequest
  tenant: Tenant
  refs: RefWriter
  summary: CommitSummary
  resolveMedia: MediaResolver
  jobId: number
}

async function ownDoc(w: WriteCtx, collection: EdvoraCollection, id: number | string): Promise<Record<string, unknown> | null> {
  try {
    const doc = (await w.payload.findByID({ collection: collection as never, id: id as never, depth: 0, overrideAccess: true, req: w.req })) as unknown as Record<string, unknown>
    if (collection === 'users') {
      const tenants = Array.isArray(doc.tenants) ? doc.tenants.map((t) => idOf((t as { tenant?: unknown }).tenant)) : []
      return tenants.includes(w.tenant.id) ? doc : null
    }
    return idOf(doc.tenant) === w.tenant.id ? doc : null
  } catch {
    return null
  }
}

async function linkRef(w: WriteCtx, d: PlannedDraft, collection: EdvoraCollection, doc: Record<string, unknown>, checksumFields: readonly string[]) {
  await w.refs.upsert(w.req, d, {
    status: 'linked',
    targetCollection: collection,
    targetId: String(doc.id),
    sourceChecksum: d.sourceChecksum,
    writtenChecksum: docChecksum(collection, doc, checksumFields),
    sourceUrl: typeof d.fields.sourceUrl === 'string' ? d.fields.sourceUrl : null,
    reason: null,
    heldData: null,
  })
}

/** Existing person (any academy) → only this academy's membership is added; their profile is never touched. */
async function attachUser(w: WriteCtx, userId: number): Promise<Record<string, unknown>> {
  const user = (await w.payload.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true, req: w.req })) as unknown as Record<string, unknown>
  const tenants = Array.isArray(user.tenants) ? (user.tenants as { tenant: unknown }[]) : []
  if (!tenants.some((t) => idOf(t.tenant) === w.tenant.id)) {
    return (await w.payload.update({
      collection: 'users',
      id: userId,
      data: { tenants: [...tenants.map((t) => ({ tenant: idOf(t.tenant)! })), { tenant: w.tenant.id }] },
      overrideAccess: true,
      req: w.req,
    })) as unknown as Record<string, unknown>
  }
  return user
}

async function writeUser(w: WriteCtx, d: PlannedDraft): Promise<'create' | 'update' | 'attach'> {
  const phone = typeof d.fields.phone === 'string' ? d.fields.phone : null
  const profile = {
    name: d.fields.name,
    firstName: d.fields.firstName,
    lastName: d.fields.lastName,
    contactEmail: d.fields.contactEmail,
    city: d.fields.city,
  }
  const existingId = d.targetId !== undefined ? Number(d.targetId) : null
  if (d.attachTenantOnly && existingId) {
    const doc = await attachUser(w, existingId)
    await linkRef(w, d, 'users', doc, [])
    return 'attach'
  }
  if (d.action === 'update' && existingId) {
    const doc = await ownDoc(w, 'users', existingId)
    if (!doc) throw new Error('Target user is not a member of this academy')
    const data: Record<string, unknown> = { ...profile }
    if (phone && phone !== doc.phone) {
      const taken = await w.payload.find({ collection: 'users', where: { phone: { equals: phone } }, limit: 1, depth: 0, overrideAccess: true, req: w.req })
      if (!taken.docs[0]) data.phone = phone
    }
    const saved = (await w.payload.update({ collection: 'users', id: existingId, data, overrideAccess: true, req: w.req })) as unknown as Record<string, unknown>
    await linkRef(w, d, 'users', saved, d.checksumFields)
    return 'update'
  }
  if (!phone) throw new Error('User without phone cannot be created')
  // Someone may have signed up with this phone since the dry run: attach instead of failing.
  const byPhone = await w.payload.find({ collection: 'users', where: { phone: { equals: phone } }, limit: 1, depth: 0, overrideAccess: true, req: w.req })
  if (byPhone.docs[0]) {
    const doc = await attachUser(w, byPhone.docs[0].id)
    await linkRef(w, d, 'users', doc, [])
    return 'attach'
  }
  const created = (await w.payload.create({
    collection: 'users',
    data: {
      ...profile,
      phone,
      email: placeholderEmail(phone, w.tenant.slug),
      password: randomBytes(24).toString('base64url'),
      roles: ['student'],
      source: 'import',
      tenants: [{ tenant: w.tenant.id }],
    } as never,
    overrideAccess: true,
    req: w.req,
  })) as unknown as Record<string, unknown>
  await linkRef(w, d, 'users', created, d.checksumFields)
  return 'create'
}

async function writeRedirect(w: WriteCtx, d: PlannedDraft): Promise<'create' | 'update' | 'skipped'> {
  const target = (d.fields.target as { $ref?: string } | undefined)?.$ref
  // Redirect only to something that exists in Edvora (pages arrive with E-030).
  if (target && w.refs.resolve(target) === null) {
    await w.refs.upsert(w.req, d, { status: 'skipped', reason: 'target_missing' })
    return 'skipped'
  }
  const from = String(d.fields.from)
  const data = { tenant: w.tenant.id, from, to: String(d.fields.to), code: 301, source: 'wp-import' as const, job: w.jobId, active: true }
  const found = await w.payload.find({ collection: 'redirects', where: { and: [{ tenant: { equals: w.tenant.id } }, { from: { equals: from } }] }, limit: 1, depth: 0, overrideAccess: true, req: w.req })
  const existing = found.docs[0]
  const doc = existing
    ? await w.payload.update({ collection: 'redirects', id: existing.id, data, overrideAccess: true, req: w.req })
    : await w.payload.create({ collection: 'redirects', data, overrideAccess: true, req: w.req })
  await linkRef(w, d, 'redirects', doc as unknown as Record<string, unknown>, d.checksumFields)
  return existing ? 'update' : 'create'
}

function certificateCode(siteId: string, d: PlannedDraft): string {
  const legacy = String(d.fields.legacyCode ?? d.fields.legacyId ?? d.wpId).replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || d.wpId
  return `WP-${siteId.slice(0, 6).toUpperCase()}-${legacy}`
}

/** Writes one planned draft (inside the batch transaction). */
async function writeDraft(w: WriteCtx, d: PlannedDraft, siteId: string): Promise<void> {
  const c = d.collection
  if (d.action === 'unchanged') return bump(w.summary, c, 'unchanged')
  if (d.action === 'held') {
    if (w.refs.get(d.refKey)?.status !== 'linked') {
      const heldData = c === 'users' ? { name: d.fields.name ?? null, contactEmail: d.fields.contactEmail ?? null, wpId: d.wpId, reason: d.reason ?? null } : { reason: d.reason ?? null }
      await w.refs.upsert(w.req, d, { status: 'held', reason: d.reason ?? 'held', heldData })
    }
    return bump(w.summary, c, 'held')
  }
  if (d.action === 'skipped') {
    if (w.refs.get(d.refKey)?.status !== 'linked') await w.refs.upsert(w.req, d, { status: 'skipped', reason: d.reason ?? 'skipped' })
    return bump(w.summary, c, 'skipped')
  }
  if (d.action === 'conflict') {
    const ref = w.refs.get(d.refKey)
    await w.refs.upsert(w.req, d, { status: 'conflict', reason: d.reason ?? 'conflict', ...(ref ? {} : { targetCollection: c, targetId: d.targetId !== undefined ? String(d.targetId) : null }) })
    if (w.summary.conflicts.length < CAP) w.summary.conflicts.push({ refKey: d.refKey, collection: c, title: titleOf(d.fields), targetId: d.targetId ?? null, reason: d.reason ?? null })
    return bump(w.summary, c, 'conflict')
  }
  if (!WRITABLE.has(c)) {
    w.summary.notWritten[c] = (w.summary.notWritten[c] ?? 0) + 1
    if (w.refs.get(d.refKey)?.status !== 'linked') await w.refs.upsert(w.req, d, { status: 'skipped', reason: `${c}_not_available` })
    return bump(w.summary, c, 'skipped')
  }
  if (c === 'users') return bump(w.summary, c, await writeUser(w, d))
  if (c === 'redirects') return bump(w.summary, c, await writeRedirect(w, d))

  let data: Record<string, unknown>
  try {
    data = toDocData(c, d.fields, { resolve: w.refs.resolve, dependsOn: d.dependsOn, resolveMedia: w.resolveMedia })
  } catch (err) {
    if (err instanceof UnresolvedRef) {
      await w.refs.upsert(w.req, d, { status: 'skipped', reason: 'missing_dependency' })
      return bump(w.summary, c, 'skipped')
    }
    throw err
  }
  data.tenant = w.tenant.id
  if (c === 'certificates' && d.action === 'create') data.code = certificateCode(siteId, d)

  if (d.action === 'update' && d.targetId !== undefined) {
    const current = await ownDoc(w, c, d.targetId)
    if (!current) throw new Error(`Target ${c}#${d.targetId} is not in this academy`)
    for (const f of d.unionFields ?? []) data[f] = unionIds(current[f], data[f])
    delete data.tenant
    const saved = (await w.payload.update({ collection: c as never, id: d.targetId as never, data: data as never, overrideAccess: true, req: w.req })) as unknown as Record<string, unknown>
    await linkRef(w, d, c, saved, d.checksumFields)
    return bump(w.summary, c, 'update')
  }
  const created = (await w.payload.create({ collection: c as never, data: data as never, overrideAccess: true, req: w.req })) as unknown as Record<string, unknown>
  await linkRef(w, d, c, created, d.checksumFields)
  bump(w.summary, c, 'create')
}

function mediaResolver(refs: Map<string, RefRow>): MediaResolver {
  const byUrl = new Map<string, { id: number; url: string }>()
  const key = (u: string) => u.replace(/^https?:\/\//i, '').replace(/[?#].*$/, '').toLowerCase()
  for (const r of refs.values()) {
    if (r.kind === 'wp.attachment' && r.status === 'linked' && r.sourceUrl && r.targetUrl && r.targetId) byUrl.set(key(r.sourceUrl), { id: Number(r.targetId), url: r.targetUrl })
  }
  return (url) => {
    // WordPress resized variants (`photo-300x200.jpg`) resolve to the original upload.
    const k = key(url)
    return byUrl.get(k) ?? byUrl.get(k.replace(/-\d+x\d+(\.[a-z0-9]+)$/i, '$1')) ?? null
  }
}

/** Records phase. Returns true when more work remains (the task re-queues itself). */
export async function runRecordsPhase(payload: Payload, jobId: number, tenantId: number, deadline: number): Promise<boolean> {
  const loaded = await loadJobForTask(payload, jobId, tenantId)
  if (!loaded || loaded.job.status !== 'committing') return false
  const { job, tenant } = loaded
  const plan = await loadPlan(job)
  const siteId = (job.site as { siteId?: string } | null)?.siteId ?? plan.siteId
  const list = COLLECTION_ORDER.filter((c) => c !== 'media').flatMap((c) => plan.drafts[c])
  const refsMap = await loadRefs(payload, tenant.id, siteId)
  const refs = new RefWriter(payload, tenant, siteId, job.id, refsMap)
  const resolveMedia = mediaResolver(refsMap)
  let summary = summaryOf(job)
  const cursors = cursorsOf(job)

  while (cursors.records < list.length && Date.now() < deadline) {
    const batch = list.slice(cursors.records, cursors.records + COMMIT_BATCH)
    const req = await systemReq(payload)
    await initTransaction(req)
    const draftSummary: CommitSummary = JSON.parse(JSON.stringify(summary)) as CommitSummary
    const w: WriteCtx = { payload, req, tenant, refs, summary: draftSummary, resolveMedia, jobId: job.id }
    try {
      for (const d of batch) {
        try {
          await writeDraft(w, d, siteId)
        } catch (err) {
          // Validation problems of one row are logged and skipped (W18); database errors abort the batch.
          if (!(err instanceof ValidationError) && !(err instanceof Error && /not in this academy|without phone/.test(err.message))) throw err
          if (draftSummary.failures.length < CAP) draftSummary.failures.push({ refKey: d.refKey, collection: d.collection, message: err.message.slice(0, 200) })
          bump(draftSummary, d.collection, 'failed')
        }
      }
      const next = { ...cursors, records: cursors.records + batch.length }
      const progress = { ...((job.progress as Record<string, unknown> | null) ?? {}), phase: 'records', records: { done: next.records, total: list.length }, updatedAt: new Date().toISOString() }
      await payload.update({ collection: 'import-jobs', id: job.id, data: { cursors: next, summary: draftSummary as never, progress }, overrideAccess: true, req })
      await commitTransaction(req)
      cursors.records = next.records
      summary = draftSummary
    } catch (err) {
      await killTransaction(req)
      // Refs written in the rolled-back batch are stale in memory: reload before anything else.
      refs.refs.clear()
      for (const [k, v] of await loadRefs(payload, tenant.id, siteId)) refs.refs.set(k, v)
      throw err
    }
  }
  if (cursors.records < list.length) return true
  await finishJob(payload, job, tenant, summary)
  return false
}

async function finishJob(payload: Payload, job: ImportJob, tenant: Tenant, summary: CommitSummary): Promise<void> {
  const now = new Date()
  const purgeAfter = new Date(now.getTime() + RETENTION_DAYS * 86400_000)
  await payload.update({
    collection: 'import-jobs',
    id: job.id,
    overrideAccess: true,
    data: { status: 'done', finishedAt: now.toISOString(), purgeAfter: purgeAfter.toISOString(), restSealed: null, progress: { ...((job.progress as Record<string, unknown> | null) ?? {}), phase: 'done', updatedAt: now.toISOString() } },
  })
  await payload.create({
    collection: 'audit-logs',
    overrideAccess: true,
    data: { tenant: tenant.id, actor: idOf(job.confirmedBy), action: 'import.commit', targetCollection: 'import-jobs', docId: String(job.id), changes: { counts: summary.counts, failures: summary.failures.length, conflicts: summary.conflicts.length }, note: null },
  })
  await payload.jobs.queue({ task: 'importPurge', input: { jobId: job.id, tenantId: tenant.id }, queue: 'wpimport', waitUntil: purgeAfter })
}

/** Raw data purge (W21): bundle/chunks/plan file and held PII. Report, counts and refs (without PII) stay. */
export async function purgeJob(payload: Payload, jobId: number, tenantId: number, opts: { force?: boolean; actor?: { id: number; email?: string | null } | null } = {}): Promise<boolean> {
  const loaded = await loadJobForTask(payload, jobId, tenantId)
  if (!loaded) return false
  const { job } = loaded
  if (job.purgedAt) return true
  if (!opts.force && (!job.purgeAfter || new Date(job.purgeAfter).getTime() > Date.now())) return false
  await removeStored(job.bundleFile ?? null)
  await removeStored(job.planFile ?? null)
  const chunkDir = (job.chunks as { dir?: string } | null)?.dir
  if (chunkDir) await removeStored(chunkDir)
  const held = await payload.find({ collection: 'import-refs', where: { and: [{ tenant: { equals: tenantId } }, { job: { equals: job.id } }, { heldData: { exists: true } }] }, pagination: false, depth: 0, overrideAccess: true })
  for (const r of held.docs) await payload.update({ collection: 'import-refs', id: r.id, data: { heldData: null }, overrideAccess: true })
  await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { bundleFile: null, planFile: null, chunks: null, restSealed: null, purgedAt: new Date().toISOString() } })
  await payload.create({
    collection: 'audit-logs',
    overrideAccess: true,
    data: { tenant: tenantId, actor: opts.actor?.id ?? null, actorEmail: opts.actor?.email ?? null, action: 'import.purge', targetCollection: 'import-jobs', docId: String(job.id), changes: {}, note: opts.force ? 'manual' : 'retention' },
  })
  return true
}

/** "Use the WordPress version" for one conflict (W17): overwrite the Edvora doc with the planned fields. */
export async function resolveConflict(payload: Payload, i: { tenant: Tenant; jobId: number; refKey: string; choice: 'keep' | 'wp'; actor: { id: number; email?: string | null } }): Promise<boolean> {
  const loaded = await loadJobForTask(payload, i.jobId, i.tenant.id)
  if (!loaded || loaded.job.status !== 'done' || !loaded.job.planFile) return false
  const { job, tenant } = loaded
  const plan = await loadPlan(job)
  const d = COLLECTION_ORDER.flatMap((c) => plan.drafts[c]).find((x) => x.refKey === i.refKey && x.action === 'conflict')
  if (!d || d.targetId === undefined || !WRITABLE.has(d.collection) || d.collection === 'users') return false
  const siteId = (job.site as { siteId?: string } | null)?.siteId ?? plan.siteId
  const refsMap = await loadRefs(payload, tenant.id, siteId)
  const refs = new RefWriter(payload, tenant, siteId, job.id, refsMap)
  const req = await systemReq(payload)
  await initTransaction(req)
  try {
    const w: WriteCtx = { payload, req, tenant, refs, summary: emptySummary(), resolveMedia: mediaResolver(refsMap), jobId: job.id }
    const current = await ownDoc(w, d.collection, d.targetId)
    if (!current) throw new Error('Target is not in this academy')
    if (i.choice === 'wp') {
      const data = toDocData(d.collection, d.fields, { resolve: refs.resolve, dependsOn: [], resolveMedia: w.resolveMedia })
      for (const f of d.unionFields ?? []) data[f] = unionIds(current[f], data[f])
      const saved = (await payload.update({ collection: d.collection as never, id: d.targetId as never, data: data as never, overrideAccess: true, req })) as unknown as Record<string, unknown>
      await linkRef(w, d, d.collection, saved, d.checksumFields)
    } else {
      // Keep Edvora: the current values become the baseline, so the next run updates only on new WordPress changes.
      await refs.upsert(req, d, { status: 'linked', sourceChecksum: d.sourceChecksum, writtenChecksum: fieldsChecksum({}, ['__kept__']), reason: 'kept_edvora' })
    }
    const summary = summaryOf(job)
    summary.conflicts = summary.conflicts.map((x) => (x.refKey === d.refKey ? { ...x, resolved: i.choice } : x))
    await payload.update({ collection: 'import-jobs', id: job.id, data: { summary: summary as never }, overrideAccess: true, req })
    await payload.create({
      collection: 'audit-logs',
      overrideAccess: true,
      req,
      data: { tenant: tenant.id, actor: i.actor.id, actorEmail: i.actor.email ?? null, action: `import.conflict.${i.choice}`, targetCollection: d.collection, docId: String(d.targetId), changes: {}, note: `job ${job.id}` },
    })
    await commitTransaction(req)
    return true
  } catch (err) {
    await killTransaction(req)
    throw err
  }
}
