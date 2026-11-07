/**
 * WordPress import service (ADR 011 §Pipeline): connections, ingest (bundle / push / REST), dry run, confirm.
 * Server-only. Every function takes the academy explicitly and filters by it; callers check `import.view` /
 * `import.run` first (route handlers verify the connection signature instead).
 */
import {
  BundleError,
  canonicalJson,
  ManifestSchema,
  planImport,
  type ImportPlan,
  type Manifest,
  type RestSourceConfig,
  type WordPressSource,
} from '@edvora/integrations/wordpress'
import { sql } from '@payloadcms/db-postgres'
import { createGunzip } from 'node:zlib'
import { Readable } from 'node:stream'
import type { Payload, PayloadRequest } from 'payload'
import type { ImportConnection, ImportJob } from '../../payload-types'
import { idOf } from '../ids'
import { planContext, type JobChoices } from './ctx'
import { CONNECTION_TTL_HOURS, newConnectionId, newSecret, openConnectionSecret, openJson, sealConnectionSecret, sealJson } from './secrets'
import { bundleSource, pushedSource, restSource, withPhoneOverrides } from './sources'
import { newStoredName, removeStored, writeStored } from './storage'
import { buildReport, type ImportReport } from './report'
import { IMPORT_QUEUE } from './constants'

export { IMPORT_QUEUE }

export const RUNNING: readonly ImportJob['status'][] = ['media', 'committing']
export const MAX_BUNDLE_BYTES = Number(process.env.IMPORT_MAX_BUNDLE_MB ?? 100) * 1024 * 1024

export type Tenant = { id: number; slug: string }
export type ServiceError = { ok: false; code: string; message: string }
export const fail = (code: string, message: string): ServiceError => ({ ok: false, code, message })

// ---------------------------------------------------------------- audit

/** Audit row for an import action (W20). Never carries secrets or personal data, only ids and counts. */
export async function auditImport(
  payload: Payload,
  entry: { tenant: number; actor?: { id: number; email?: string | null } | null; action: string; collection: string; docId: string | number; note?: string; changes?: Record<string, unknown>; req?: PayloadRequest },
): Promise<void> {
  try {
    await payload.create({
      collection: 'audit-logs',
      overrideAccess: true,
      req: entry.req,
      data: {
        tenant: entry.tenant,
        actor: entry.actor?.id ?? null,
        actorEmail: entry.actor?.email ?? null,
        action: entry.action,
        targetCollection: entry.collection,
        docId: String(entry.docId),
        changes: entry.changes ?? {},
        note: entry.note ?? null,
      },
    })
  } catch (err) {
    payload.logger.error({ err, msg: `audit ${entry.action} failed` })
  }
}

// ---------------------------------------------------------------- reads

export async function findJob(payload: Payload, tenantId: number, jobId: number | string, hidden = false): Promise<ImportJob | null> {
  const res = await payload.find({
    collection: 'import-jobs',
    where: { and: [{ id: { equals: jobId } }, { tenant: { equals: tenantId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: hidden,
  })
  return res.docs[0] ?? null
}

export async function findConnection(payload: Payload, tenantId: number, connectionId: string): Promise<ImportConnection | null> {
  const res = await payload.find({
    collection: 'import-connections',
    where: { and: [{ connectionId: { equals: connectionId } }, { tenant: { equals: tenantId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  return res.docs[0] ?? null
}

export const connectionUsable = (c: Pick<ImportConnection, 'revokedAt' | 'expiresAt'>, now = new Date()): 'ok' | 'revoked' | 'expired' =>
  c.revokedAt ? 'revoked' : new Date(c.expiresAt).getTime() <= now.getTime() ? 'expired' : 'ok'

export const choicesOf = (job: Pick<ImportJob, 'choices'>): JobChoices => (job.choices && typeof job.choices === 'object' ? (job.choices as JobChoices) : {})

// ---------------------------------------------------------------- connections

export async function createConnection(i: {
  payload: Payload
  tenant: Tenant
  actor: { id: number; email?: string | null }
  label: string
  mode: 'push' | 'bundle'
}): Promise<{ job: ImportJob; connection: ImportConnection; secret: string }> {
  const { payload, tenant, actor } = i
  const job = await payload.create({
    collection: 'import-jobs',
    overrideAccess: true,
    data: { tenant: tenant.id, label: i.label, status: 'draft', mode: i.mode, createdBy: actor.id },
  })
  const secret = newSecret()
  const connection = await payload.create({
    collection: 'import-connections',
    overrideAccess: true,
    data: {
      tenant: tenant.id,
      label: i.label,
      connectionId: newConnectionId(),
      ...sealConnectionSecret(secret),
      job: job.id,
      expiresAt: new Date(Date.now() + CONNECTION_TTL_HOURS * 3600_000).toISOString(),
      createdBy: actor.id,
    },
  })
  const updated = await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { connection: connection.id } })
  await auditImport(payload, { tenant: tenant.id, actor, action: 'import.connection.create', collection: 'import-connections', docId: connection.id, note: `${connection.connectionId} → job ${job.id}` })
  return { job: updated, connection, secret }
}

export async function revokeConnection(i: { payload: Payload; tenant: Tenant; actor: { id: number; email?: string | null }; connectionId: string }): Promise<boolean> {
  const c = await findConnection(i.payload, i.tenant.id, i.connectionId)
  if (!c) return false
  if (!c.revokedAt) {
    await i.payload.update({ collection: 'import-connections', id: c.id, overrideAccess: true, data: { revokedAt: new Date().toISOString() } })
    await auditImport(i.payload, { tenant: i.tenant.id, actor: i.actor, action: 'import.connection.revoke', collection: 'import-connections', docId: c.id, note: c.connectionId })
  }
  return true
}

// ---------------------------------------------------------------- ingest helpers

/** First line of a gzip bundle (the unverified manifest), read without decompressing the rest. */
export async function peekManifestLine(bytes: Uint8Array, maxBytes = 1024 * 1024): Promise<unknown> {
  if (bytes.byteLength < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new BundleError('not_gzip', 'File is not a gzip bundle')
  const gunzip = Readable.from([Buffer.from(bytes)]).pipe(createGunzip())
  let buf = Buffer.alloc(0)
  try {
    for await (const chunk of gunzip) {
      buf = Buffer.concat([buf, chunk as Buffer])
      const nl = buf.indexOf(0x0a)
      if (nl >= 0) {
        gunzip.destroy()
        return JSON.parse(buf.subarray(0, nl).toString('utf8')) as unknown
      }
      if (buf.byteLength > maxBytes) break
    }
  } catch (err) {
    if (err instanceof SyntaxError) throw new BundleError('bad_manifest', 'First line is not JSON')
    throw new BundleError('not_gzip', 'Cannot decompress bundle')
  }
  throw new BundleError('bad_manifest', 'No manifest line')
}

const REJECT_MESSAGES: Record<string, string> = {
  not_gzip: 'این فایل خروجی افزونهٔ ادوورا نیست (فرمت نامعتبر).',
  bad_manifest: 'فهرست خروجی خوانا نیست؛ دوباره از افزونه خروجی بگیرید.',
  missing_signature: 'امضای فایل پیدا نشد؛ فایل ناقص یا دست‌کاری شده است.',
  bad_signature: 'امضای فایل درست نیست؛ فایل دست‌کاری شده یا با کد اتصال دیگری ساخته شده است.',
  invalid_record: 'بخشی از فایل خراب است.',
  too_large: 'فایل از حد مجاز بزرگ‌تر است.',
  empty: 'فایل خالی است.',
  connection_unknown: 'این فایل برای این آکادمی ساخته نشده است (کد اتصال در این آکادمی وجود ندارد).',
  connection_revoked: 'کد اتصالی که این فایل با آن ساخته شده لغو شده است.',
  connection_expired: 'کد اتصال این فایل منقضی شده است؛ اتصال تازه بسازید.',
  tenant_mismatch: 'این فایل برای آکادمی دیگری ساخته شده و اینجا وارد نمی‌شود.',
  site_mismatch: 'این فایل از سایت دیگری است؛ برای آن سایت یک انتقال تازه بسازید.',
  secret_unreadable: 'کد اتصال قابل خواندن نیست؛ اتصال تازه بسازید.',
}
export const rejectMessage = (code: string) => REJECT_MESSAGES[code] ?? 'فایل پذیرفته نشد.'

async function reject(payload: Payload, job: ImportJob, tenant: Tenant, actor: { id: number; email?: string | null } | null, code: string): Promise<ImportJob> {
  await removeStored(job.bundleFile ?? null).catch(() => undefined)
  const updated = await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { status: 'rejected', error: `${code}: ${rejectMessage(code)}`, bundleFile: null } })
  await auditImport(payload, { tenant: tenant.id, actor, action: 'import.rejected', collection: 'import-jobs', docId: job.id, note: code })
  return updated
}

/**
 * Bundle upload (W3): the unverified manifest names the connection; it must exist in THIS academy, be usable and its
 * secret must verify the whole bundle before any record is read. A bundle signed for another academy is rejected.
 */
export async function ingestBundle(i: { payload: Payload; tenant: Tenant; actor: { id: number; email?: string | null }; bytes: Uint8Array; filename: string }): Promise<ImportJob> {
  const { payload, tenant, actor } = i
  const job = await payload.create({
    collection: 'import-jobs',
    overrideAccess: true,
    data: { tenant: tenant.id, label: i.filename.slice(0, 120), status: 'ingesting', mode: 'bundle', createdBy: actor.id },
  })
  let head: Record<string, unknown>
  try {
    head = (await peekManifestLine(i.bytes)) as Record<string, unknown>
  } catch (err) {
    return reject(payload, job, tenant, actor, err instanceof BundleError ? err.code : 'not_gzip')
  }
  const connectionId = typeof head?.connectionId === 'string' ? head.connectionId : ''
  const connection = connectionId ? await findConnection(payload, tenant.id, connectionId) : null
  if (!connection) return reject(payload, job, tenant, actor, head?.tenantSlug && head.tenantSlug !== tenant.slug ? 'tenant_mismatch' : 'connection_unknown')
  // Same rule as push (QA-E032-01): a revoked or expired connection's bundle is refused.
  const usable = connectionUsable(connection)
  if (usable !== 'ok') return reject(payload, job, tenant, actor, `connection_${usable}`)
  if (head.tenantSlug !== tenant.slug) return reject(payload, job, tenant, actor, 'tenant_mismatch')
  const secret = openConnectionSecret(connection)
  if (!secret) return reject(payload, job, tenant, actor, 'secret_unreadable')

  const name = `${newStoredName()}`
  await writeStored(name, i.bytes)
  await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { bundleFile: name, connection: connection.id } })
  let manifest: Manifest
  try {
    const source = await bundleSource(name, secret)
    manifest = await source.manifest()
  } catch (err) {
    return reject(payload, { ...job, bundleFile: name }, tenant, actor, err instanceof BundleError ? err.code : 'invalid_record')
  }
  if (manifest.tenantSlug !== tenant.slug) return reject(payload, { ...job, bundleFile: name }, tenant, actor, 'tenant_mismatch')
  if (manifest.connectionId !== connection.connectionId) return reject(payload, { ...job, bundleFile: name }, tenant, actor, 'connection_unknown')

  await payload.update({ collection: 'import-connections', id: connection.id, overrideAccess: true, data: { lastUsedAt: new Date().toISOString(), job: job.id } })
  await payload.update({
    collection: 'import-jobs',
    id: job.id,
    overrideAccess: true,
    data: { status: 'ready', manifest: manifestSummary(manifest), site: siteOf(manifest), label: manifest.site.name || i.filename.slice(0, 120) },
  })
  return runDryRun({ payload, tenant, jobId: job.id, actor })
}

/** REST fallback (W4): credentials are sealed on the job only, never logged, wiped when the job ends. */
export async function startRest(i: { payload: Payload; tenant: Tenant; actor: { id: number; email?: string | null }; config: Omit<RestSourceConfig, 'tenantSlug' | 'fetch'> }): Promise<ImportJob> {
  const { payload, tenant, actor } = i
  const job = await payload.create({
    collection: 'import-jobs',
    overrideAccess: true,
    data: { tenant: tenant.id, label: new URL(i.config.siteUrl).host, status: 'ready', mode: 'rest', createdBy: actor.id, restSealed: sealJson(i.config) },
  })
  await auditImport(payload, { tenant: tenant.id, actor, action: 'import.rest.start', collection: 'import-jobs', docId: job.id, note: new URL(i.config.siteUrl).host })
  return runDryRun({ payload, tenant, jobId: job.id, actor })
}

export function manifestSummary(m: Manifest): Record<string, unknown> {
  return {
    format: m.format,
    formatVersion: m.formatVersion,
    pluginVersion: m.pluginVersion,
    createdAtGmt: m.createdAtGmt,
    connectionId: m.connectionId,
    tenantSlug: m.tenantSlug,
    site: m.site,
    plugins: m.plugins,
    theme: m.theme ?? null,
    woo: m.woo ?? null,
    lifterlms: m.lifterlms ?? null,
    tutor: m.tutor ?? null,
    counts: m.counts,
  }
}

export const siteOf = (m: Manifest) => ({ siteId: m.site.siteId, homeUrl: m.site.homeUrl, name: m.site.name ?? null, wpVersion: m.site.wpVersion ?? null, phpVersion: m.site.phpVersion ?? null })

// ---------------------------------------------------------------- sources

/** The job's source, already bound to its academy's secret. Throws `BundleError` when the bundle no longer verifies. */
export async function openJobSource(payload: Payload, tenant: Tenant, job: ImportJob): Promise<WordPressSource> {
  const full = (await findJob(payload, tenant.id, job.id, true)) ?? job
  let source: WordPressSource
  if (full.mode === 'bundle' || full.mode === 'push') {
    const connId = idOf(full.connection)
    const conn = connId
      ? (await payload.find({ collection: 'import-connections', where: { and: [{ id: { equals: connId } }, { tenant: { equals: tenant.id } }] }, limit: 1, depth: 0, overrideAccess: true, showHiddenFields: true })).docs[0]
      : undefined
    const secret = conn ? openConnectionSecret(conn) : null
    if (!secret) throw new BundleError('bad_signature', 'Connection secret unavailable')
    if (full.mode === 'bundle') {
      if (!full.bundleFile) throw new BundleError('empty', 'Bundle was purged')
      source = await bundleSource(full.bundleFile, secret)
    } else {
      const manifest = ManifestSchema.parse(full.manifest)
      const dir = (full.chunks as { dir?: string } | null)?.dir
      if (!dir) throw new BundleError('empty', 'No pushed data')
      source = await pushedSource(manifest, dir)
    }
  } else if (full.mode === 'rest') {
    const cfg = openJson<Omit<RestSourceConfig, 'tenantSlug'>>(full.restSealed)
    if (!cfg) throw new BundleError('empty', 'REST credentials were wiped')
    source = restSource({ ...cfg, tenantSlug: tenant.slug, allowLoopback: process.env.NODE_ENV !== 'production' })
  } else throw new BundleError('empty', `Unsupported mode ${full.mode}`)
  return withPhoneOverrides(source, choicesOf(full).phoneOverrides)
}

// ---------------------------------------------------------------- dry run

export async function planJob(payload: Payload, tenant: Tenant, job: ImportJob): Promise<{ plan: ImportPlan; manifest: Manifest }> {
  const source = await openJobSource(payload, tenant, job)
  const manifest = await source.manifest()
  const site = job.site as { siteId?: string } | null
  const siteId = site?.siteId || manifest.site.siteId
  const ctx = await planContext({ payload, tenant, siteId, choices: choicesOf(job) })
  const plan = await planImport({ source, ctx })
  return { plan, manifest }
}

/** Dry run (W6): plans against the current Edvora data, stores only the report on the job. No other writes. */
export async function runDryRun(i: { payload: Payload; tenant: Tenant; jobId: number; actor?: { id: number; email?: string | null } | null }): Promise<ImportJob> {
  const { payload, tenant } = i
  const job = await findJob(payload, tenant.id, i.jobId, true)
  if (!job) throw new Error('Import job not found')
  await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { status: 'dry-run', error: null } })
  try {
    // A re-import of the same site starts from the previous run's decisions (product map, LMS, hosts, phones).
    if (!job.choices) {
      const siteId = (job.site as { siteId?: string } | null)?.siteId
      const prev = siteId
        ? (await payload.find({ collection: 'import-jobs', where: { and: [{ tenant: { equals: tenant.id } }, { status: { equals: 'done' } }, { id: { not_equals: job.id } }] }, sort: '-finishedAt', limit: 20, depth: 0, overrideAccess: true })).docs.find(
            (j) => (j.site as { siteId?: string } | null)?.siteId === siteId,
          )
        : undefined
      if (prev?.choices) {
        await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { choices: prev.choices } })
        job.choices = prev.choices
      }
    }
    const { plan, manifest } = await planJob(payload, tenant, job)
    if (manifest.tenantSlug !== tenant.slug) return reject(payload, job, tenant, i.actor ?? null, 'tenant_mismatch')
    const report = await buildReport(payload, tenant, plan, manifest)
    const updated = await payload.update({
      collection: 'import-jobs',
      id: job.id,
      overrideAccess: true,
      data: {
        status: 'awaiting-confirm',
        report: report as unknown as Record<string, unknown>,
        mappers: plan.mappers,
        counts: plan.counts,
        site: job.site ?? siteOf(manifest),
        manifest: job.manifest ?? manifestSummary(manifest),
      },
    })
    await auditImport(payload, { tenant: tenant.id, actor: i.actor, action: 'import.dry_run', collection: 'import-jobs', docId: job.id, note: report.blocking ? 'blocking' : 'ok', changes: { counts: plan.counts } })
    return updated
  } catch (err) {
    if (err instanceof BundleError) return reject(payload, job, tenant, i.actor ?? null, err.code)
    payload.logger.error({ err, msg: `import dry run ${job.id} failed` })
    return payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { status: 'failed', error: `dry_run: ${err instanceof Error ? err.message.slice(0, 300) : 'error'}` } })
  }
}

/** Saves the admin's dry-run choices and plans again. */
export async function updateChoices(i: { payload: Payload; tenant: Tenant; actor: { id: number; email?: string | null }; jobId: number; patch: (c: JobChoices) => JobChoices }): Promise<ImportJob | ServiceError> {
  const job = await findJob(i.payload, i.tenant.id, i.jobId)
  if (!job) return fail('not_found', 'این انتقال پیدا نشد.')
  if (job.status !== 'awaiting-confirm') return fail('state', 'این انتقال دیگر قابل تغییر نیست.')
  const choices = i.patch(choicesOf(job))
  await i.payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { choices: choices as Record<string, unknown> } })
  return runDryRun({ payload: i.payload, tenant: i.tenant, jobId: job.id, actor: i.actor })
}

// ---------------------------------------------------------------- confirm

/** Atomic status claim (two admins / double click): only one caller moves the job out of `from`. */
async function claimStatus(payload: Payload, jobId: number, from: ImportJob['status'], to: ImportJob['status']): Promise<boolean> {
  const db = payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows?: unknown[] } | unknown[]> } }
  const res = await db.drizzle.execute(sql`UPDATE "import_jobs" SET "status" = ${to}, "updated_at" = now() WHERE "id" = ${jobId} AND "status" = ${from} RETURNING "id"`)
  const rows = Array.isArray(res) ? res : (res.rows ?? [])
  return rows.length === 1
}

export async function confirmJob(i: { payload: Payload; tenant: Tenant; actor: { id: number; email?: string | null }; jobId: number; expectedCounts?: string }): Promise<{ ok: true; job: ImportJob } | ServiceError> {
  const { payload, tenant, actor } = i
  const job = await findJob(payload, tenant.id, i.jobId, true)
  if (!job) return fail('not_found', 'این انتقال پیدا نشد.')
  if (job.status !== 'awaiting-confirm') return fail('state', 'این انتقال در وضعیت قابل اجرا نیست (شاید هم‌اکنون کس دیگری آن را اجرا کرده است).')
  const busy = await payload.count({ collection: 'import-jobs', where: { and: [{ tenant: { equals: tenant.id } }, { status: { in: [...RUNNING] } }, { id: { not_equals: job.id } }] }, overrideAccess: true })
  if (busy.totalDocs > 0) return fail('busy', 'یک انتقال دیگر در این آکادمی در حال اجراست؛ پس از پایان آن دوباره تلاش کنید.')

  // Re-check against the data as it is now (W6c): blocking issues or changed numbers send the admin back to the report.
  let plan: ImportPlan
  let manifest: Manifest
  try {
    ;({ plan, manifest } = await planJob(payload, tenant, job))
  } catch (err) {
    if (err instanceof BundleError) {
      await reject(payload, job, tenant, actor, err.code)
      return fail(err.code, rejectMessage(err.code))
    }
    throw err
  }
  const report = await buildReport(payload, tenant, plan, manifest)
  // canonicalJson: jsonb does not keep key order, so compare canonical forms.
  const before = canonicalJson((job.report as ImportReport | null)?.counts ?? null)
  if (plan.blocking || before !== canonicalJson(report.counts)) {
    await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { report: report as unknown as Record<string, unknown>, counts: plan.counts } })
    return plan.blocking
      ? fail('blocking', 'پیش از اجرا باید موارد مسدودکننده را برطرف کنید.')
      : fail('changed', 'داده‌ها از زمان بررسی تغییر کرده‌اند؛ گزارش تازه را دوباره ببینید.')
  }

  const planFile = `${newStoredName()}`
  await writeStored(planFile, JSON.stringify(plan))
  if (!(await claimStatus(payload, job.id, 'awaiting-confirm', 'media'))) {
    await removeStored(planFile)
    return fail('state', 'این انتقال هم‌اکنون توسط کس دیگری اجرا شده است.')
  }
  const now = new Date().toISOString()
  const mediaTotal = plan.mediaToPull.length
  const recordTotal = Object.entries(plan.drafts).reduce((n, [c, list]) => (c === 'media' ? n : n + list.length), 0)
  const updated = await payload.update({
    collection: 'import-jobs',
    id: job.id,
    overrideAccess: true,
    data: {
      planFile,
      confirmedBy: actor.id,
      confirmedAt: now,
      startedAt: now,
      cursors: { media: 0, records: 0 },
      progress: { phase: 'media', media: { done: 0, total: mediaTotal }, records: { done: 0, total: recordTotal }, updatedAt: now },
      summary: {},
    },
  })
  await payload.jobs.queue({ task: 'importMediaBatch', input: { jobId: job.id, tenantId: tenant.id }, queue: IMPORT_QUEUE })
  await auditImport(payload, { tenant: tenant.id, actor, action: 'import.confirm', collection: 'import-jobs', docId: job.id, changes: { counts: plan.counts } })
  return { ok: true, job: updated }
}

/** Runs the import queue now (fire-and-forget after a confirm); autoRun picks up whatever is left. */
export async function kickQueue(payload: Payload): Promise<void> {
  try {
    await payload.jobs.run({ queue: IMPORT_QUEUE, limit: 5 })
  } catch (err) {
    payload.logger.error({ err, msg: 'import queue run failed' })
  }
}
