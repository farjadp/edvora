/**
 * Push API (FORMAT.md §2, §5): the WordPress plugin POSTs a manifest, NDJSON chunks and a finish call, each signed
 * with the connection secret. The academy is resolved from the Host header (ADR 005); the connection is looked up in
 * that academy only, so a connection of another academy is "unknown" here (no existence leak).
 */
import {
  CHUNK_MAX_BYTES,
  CHUNK_MAX_RECORDS,
  HEADER_CONNECTION,
  ManifestSchema,
  PushFinishSchema,
  verifyRequest,
  type VerifyFailure,
} from '@edvora/integrations/wordpress'
import { after } from 'next/server'
import { getPayloadClient } from '../payload'
import { getCurrentTenant, normalizeHost } from '../tenant'
import type { ImportJob } from '../../payload-types'
import { idOf } from '../ids'
import { nonceStore, payloadNonceRepo } from './nonces'
import { openConnectionSecret } from './secrets'
import { auditImport, connectionUsable, findConnection, findJob, manifestSummary, runDryRun, siteOf } from './service'
import { parseChunk } from './sources'
import { chunkName, listChunks, newStoredName, readStored, removeStored, writeStored } from './storage'

export type PushStep = 'ping' | 'manifest' | 'records' | 'finish'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
export const pushError = (status: number, code: string, message: string) => json({ ok: false, code, message }, status)

const VERIFY_MESSAGES: Record<VerifyFailure, string> = {
  missing_header: 'Signed request headers are missing',
  wrong_connection: 'Connection does not match',
  bad_timestamp: 'Bad timestamp',
  expired: 'Clock difference is more than 5 minutes; fix the server time and retry',
  bad_nonce: 'Bad nonce',
  bad_signature: 'Signature does not match (wrong secret?)',
  replay: 'This request was already received',
}

const isLocalHost = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost')

/** HTTPS unless the academy host is local (FORMAT.md §5). Trusts the proxy's X-Forwarded-Proto. */
function secureEnough(request: Request): boolean {
  const host = normalizeHost(request.headers.get('host'))
  if (isLocalHost(host)) return true
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? new URL(request.url).protocol.replace(':', '')
  return proto === 'https'
}

async function readBody(request: Request): Promise<Uint8Array | 'too_large'> {
  const declared = Number(request.headers.get('content-length') ?? NaN)
  if (Number.isFinite(declared) && declared > CHUNK_MAX_BYTES) return 'too_large'
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > CHUNK_MAX_BYTES) {
      await reader.cancel().catch(() => undefined)
      return 'too_large'
    }
    parts.push(value)
  }
  return Buffer.concat(parts)
}

const TERMINAL: readonly ImportJob['status'][] = ['done', 'failed', 'rejected', 'cancelled']

export async function handlePush(request: Request, step: PushStep): Promise<Response> {
  try {
    if (!secureEnough(request)) return pushError(400, 'https_required', 'HTTPS is required')
    const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])
    const cid = request.headers.get(HEADER_CONNECTION) ?? ''
    const connection = /^[a-z0-9_]{4,64}$/i.test(cid) ? await findConnection(payload, tenant.id, cid) : null
    if (!connection) return pushError(401, 'unknown_connection', 'Unknown connection for this academy')
    const usable = connectionUsable(connection)
    if (usable !== 'ok') return pushError(401, `connection_${usable}`, `Connection ${usable}`)
    const store = nonceStore(payloadNonceRepo(payload, tenant.id))
    if (await store.rateLimited(connection.id)) return pushError(429, 'rate_limited', 'Too many requests; wait a minute')

    const body = await readBody(request)
    if (body === 'too_large') return pushError(413, 'too_large', `Chunk larger than ${CHUNK_MAX_BYTES} bytes`)
    const secret = openConnectionSecret(connection)
    if (!secret) return pushError(401, 'secret_unreadable', 'Connection cannot be verified; create a new one')
    const url = new URL(request.url)
    const verified = await verifyRequest({
      secret,
      method: request.method,
      pathWithQuery: `${url.pathname}${url.search}`,
      body,
      headers: request.headers,
      seenNonce: store.seen(connection.id),
      expectedConnectionId: connection.connectionId,
    })
    if (!verified.ok) {
      await store.recordRefused(connection.id)
      return pushError(401, verified.code, VERIFY_MESSAGES[verified.code])
    }
    await payload.update({ collection: 'import-connections', id: connection.id, overrideAccess: true, data: { lastUsedAt: new Date().toISOString() } })

    const jobId = idOf(connection.job)
    let job = jobId ? await findJob(payload, tenant.id, jobId, true) : null
    if (step === 'ping') return json({ ok: true, tenant: tenant.slug, job: job ? String(job.id) : null, status: job?.status ?? 'none' })

    if (step === 'manifest') {
      let raw: unknown
      try {
        raw = JSON.parse(Buffer.from(body).toString('utf8'))
      } catch {
        return pushError(422, 'invalid_manifest', 'Manifest is not JSON')
      }
      const parsed = ManifestSchema.safeParse(raw)
      if (!parsed.success) return pushError(422, 'invalid_manifest', parsed.error.issues[0]?.message ?? 'Invalid manifest')
      const m = parsed.data
      if (m.tenantSlug !== tenant.slug) return pushError(409, 'tenant_mismatch', 'Manifest is for another academy')
      if (m.connectionId !== connection.connectionId) return pushError(409, 'connection_mismatch', 'Manifest names another connection')
      if (!job || TERMINAL.includes(job.status)) {
        // A new push on a finished job starts a new run (re-import) bound to the same connection.
        job = await payload.create({ collection: 'import-jobs', overrideAccess: true, data: { tenant: tenant.id, label: m.site.name || job?.label || connection.label, status: 'draft', mode: 'push', connection: connection.id, createdBy: idOf(connection.createdBy) } })
        await payload.update({ collection: 'import-connections', id: connection.id, overrideAccess: true, data: { job: job.id } })
      }
      if (job.status !== 'draft' && job.status !== 'ingesting') return pushError(409, 'state', `Job is ${job.status}`)
      const prev = (job.chunks as { dir?: string } | null)?.dir
      if (prev) await removeStored(prev)
      await payload.update({
        collection: 'import-jobs',
        id: job.id,
        overrideAccess: true,
        data: { status: 'ingesting', mode: 'push', manifest: manifestSummary(m), site: siteOf(m), chunks: { dir: newStoredName() }, label: m.site.name || job.label, error: null },
      })
      return json({ ok: true })
    }

    const dir = (job?.chunks as { dir?: string } | null)?.dir
    if (!job || job.status !== 'ingesting' || !dir) return pushError(409, 'state', 'Send the manifest first')

    if (step === 'records') {
      const kind = url.searchParams.get('kind') ?? ''
      const seq = Number(url.searchParams.get('seq'))
      if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(kind) || !Number.isInteger(seq) || seq < 0 || seq > 1_000_000) return pushError(422, 'invalid_query', 'kind and seq are required')
      let records
      try {
        records = parseChunk(Buffer.from(body).toString('utf8'))
      } catch {
        return pushError(422, 'invalid_record', 'A line is not a valid record envelope')
      }
      if (records.length > CHUNK_MAX_RECORDS) return pushError(413, 'too_many_records', `At most ${CHUNK_MAX_RECORDS} records per chunk`)
      if (records.some((r) => r.kind !== kind)) return pushError(422, 'invalid_record', 'Every record must be of the chunk kind')
      // Same (kind, seq) again overwrites: retries are idempotent.
      await writeStored(chunkName(dir, kind, seq), body)
      return json({ ok: true, stored: records.length })
    }

    // finish
    let finish
    try {
      finish = PushFinishSchema.parse(JSON.parse(Buffer.from(body).toString('utf8')))
    } catch {
      return pushError(422, 'invalid_finish', 'Body must be {"chunks":{…},"counts":{…}}')
    }
    const stored = await listChunks(dir)
    const missing: { kind: string; chunks: number; counts: number }[] = []
    const kinds = new Set([...Object.keys(finish.chunks), ...Object.keys(finish.counts)])
    for (const kind of kinds) {
      const mine = stored.filter((c) => c.kind === kind)
      let lines = 0
      for (const c of mine) lines += (await readStored(c.file)).toString('utf8').split('\n').filter((l) => l.trim()).length
      if (mine.length !== (finish.chunks[kind] ?? 0) || lines !== (finish.counts[kind] ?? 0)) missing.push({ kind, chunks: mine.length, counts: lines })
    }
    if (missing.length) return json({ ok: false, code: 'incomplete', message: 'Some chunks are missing', missing }, 409)
    await payload.update({ collection: 'import-jobs', id: job.id, overrideAccess: true, data: { status: 'ready' } })
    await auditImport(payload, { tenant: tenant.id, action: 'import.push.finish', collection: 'import-jobs', docId: job.id, changes: { counts: finish.counts } })
    const id = job.id
    after(async () => {
      await runDryRun({ payload, tenant: { id: tenant.id, slug: tenant.slug }, jobId: id }).catch((err: unknown) => payload.logger.error({ err, msg: 'push dry run failed' }))
    })
    return json({ ok: true })
  } catch (err) {
    const payload = await getPayloadClient().catch(() => null)
    payload?.logger.error({ err, msg: `import push ${step} failed` })
    return pushError(500, 'server_error', 'Unexpected error')
  }
}
