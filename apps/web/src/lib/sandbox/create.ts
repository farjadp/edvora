import 'server-only'
import {
  ROLE_TEMPLATES,
  decideCreation,
  generateSandboxPassword,
  hashCreatorKey,
  randomCertificatePrefix,
  randomCreatorKey,
  randomSandboxSlug,
  sandboxExpiresAt,
  sandboxPurgeAt,
  type CreationDecision,
  type SandboxConfig,
} from '@edvora/core'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest, type Where } from 'payload'
import { createAcademy } from '../academies'
import { buildTemplate } from './template'

/** Arbitrary constant for pg_advisory_xact_lock: one global lock for "check limits + reserve a slot". */
const RESERVE_LOCK_KEY = 4_202_901

export const CONSENT_TEXT = 'می‌خواهم تیم ادورا دربارهٔ ادورا با من تماس بگیرد. ایمیل من فقط برای همین استفاده می‌شود.'

/** Runs `fn` inside one DB transaction on `req`; rolls back on any error. */
async function inTransaction<T>(payload: Payload, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try {
    const out = await fn(req)
    await commitTransaction(req)
    return out
  } catch (err) {
    await killTransaction(req)
    throw err
  }
}

/** Takes the reservation lock on the request's own transaction connection, held until commit/rollback. */
async function lockReservations(req: PayloadRequest): Promise<void> {
  const adapter = req.payload.db as unknown as PostgresAdapter
  const id = await req.transactionID
  const session = id !== undefined && id !== null ? adapter.sessions[String(id)] : undefined
  if (!session) throw new Error('sandbox reservation needs a DB transaction')
  await session.db.execute(sql`select pg_advisory_xact_lock(${RESERVE_LOCK_KEY})`)
}

export type Reservation = { id: number; expiresAt: Date }

/**
 * Check every limit and reserve a slot as one critical section (A6: no overshoot of SANDBOX_MAX_ACTIVE). Concurrent
 * requests queue on the advisory lock, so each sees the previous one's reservation. The reservation row counts as
 * active from here on; a crashed build leaves it to expire with its TTL.
 */
export async function reserveSandbox(
  payload: Payload,
  cfg: SandboxConfig,
  input: { ipHash: string; creatorKeyHash: string; powNonce: string },
): Promise<{ decision: CreationDecision; reservation?: Reservation }> {
  return inTransaction(payload, async (req) => {
    await lockReservations(req)
    const now = new Date()
    const liveParts: Where[] = [{ status: { in: ['creating', 'active'] } }, { expiresAt: { greater_than: now.toISOString() } }]
    const live: Where = { and: liveParts }
    const [active, ipDay, ipActive] = await Promise.all([
      payload.find({ collection: 'demo-sandboxes', where: live, sort: 'expiresAt', limit: 1, depth: 0, overrideAccess: true, req, select: { expiresAt: true } }),
      payload.count({ collection: 'demo-sandboxes', where: { and: [{ ipHash: { equals: input.ipHash } }, { status: { not_equals: 'failed' } }, { createdAt: { greater_than: new Date(now.getTime() - 24 * 3600_000).toISOString() } }] }, overrideAccess: true, req }),
      payload.count({ collection: 'demo-sandboxes', where: { and: [...liveParts, { ipHash: { equals: input.ipHash } }] }, overrideAccess: true, req }),
    ])
    const decision = decideCreation({
      enabled: cfg.enabled,
      activeCount: active.totalDocs,
      maxActive: cfg.maxActive,
      ipCount24h: ipDay.totalDocs,
      ipDailyMax: cfg.ipDailyMax,
      ipActiveCount: ipActive.totalDocs,
      ipActiveMax: cfg.ipActiveMax,
      soonestExpiry: active.docs[0]?.expiresAt ?? null,
    })
    if (!decision.ok) return { decision }
    const expiresAt = sandboxExpiresAt(now, cfg.ttlHours)
    const row = await payload.create({
      collection: 'demo-sandboxes',
      overrideAccess: true,
      req,
      depth: 0,
      data: { status: 'creating', expiresAt: expiresAt.toISOString(), ipHash: input.ipHash, creatorKeyHash: input.creatorKeyHash, powNonce: input.powNonce },
    })
    return { decision, reservation: { id: row.id, expiresAt } }
  })
}

export type Credentials = { email: string; password: string }
export type BuiltSandbox = {
  sandboxId: number
  tenantId: number
  slug: string
  expiresAt: Date
  creatorKey: string
  admin: Credentials
  student: Credentials
  certificateCode: string
  buildMs: number
}

/**
 * Builds the sandbox academy for a reservation in ONE transaction (V12: on any error nothing of it stays), then marks
 * the reservation active. Accounts: an academy admin (template role, membership expiring with the sandbox) and a
 * student enrolled in the sample cohort. Passwords are returned once and never stored in plain text.
 */
export async function buildSandbox(payload: Payload, cfg: SandboxConfig, reservation: Reservation, creatorKey: string): Promise<BuiltSandbox> {
  const started = Date.now()
  const slug = randomSandboxSlug()
  const certificatePrefix = randomCertificatePrefix()
  const admin: Credentials = { email: `admin-${slug}@sandbox.invalid`, password: generateSandboxPassword() }
  const student: Credentials = { email: `student-${slug}@sandbox.invalid`, password: generateSandboxPassword() }
  const expiresAt = reservation.expiresAt
  const now = new Date()

  try {
    const result = await inTransaction(payload, async (req) => {
      const tenant = await createAcademy(req, {
        name: 'آکادمی آزمایشی شما',
        slug,
        plan: 'growth',
        features: ['site', 'lms', 'payments', 'crm', 'certificates'],
        tagline: 'آکادمی آزمایشی ادورا — همهٔ داده‌ها نمونه‌اند و پس از پایان زمان پاک می‌شوند.',
        primaryColor: '#0F766E',
        accentColor: '#F97316',
        defaultTheme: 'light',
        certificatePrefix,
        notice: { enabled: true, text: 'آکادمی آزمایشی: داده‌ها نمونه‌اند، پرداخت‌ها ساختگی‌اند و پیامک یا ایمیلی ارسال نمی‌شود.' },
        manifesto: 'این متن نمونهٔ «دربارهٔ ما» است. در آکادمی واقعی، داستان و روش آموزش خودتان را اینجا می‌نویسید.',
        isSandbox: true,
        expiresAt: expiresAt.toISOString(),
        purgeAt: sandboxPurgeAt(expiresAt, cfg.graceHours).toISOString(),
      })
      const role = await req.payload.find({ collection: 'roles', where: { and: [{ tenant: { equals: tenant.id } }, { key: { equals: 'academy-admin' } }] }, limit: 1, depth: 0, overrideAccess: true, req })
      if (!role.docs[0]) throw new Error(`role template academy-admin missing (have ${ROLE_TEMPLATES.length} templates)`)
      const adminUser = await req.payload.create({
        collection: 'users',
        overrideAccess: true,
        req,
        depth: 0,
        data: { email: admin.email, password: admin.password, name: 'مدیر آکادمی آزمایشی', roles: [], tenants: [{ tenant: tenant.id }], sandboxTenant: tenant.id, source: 'manual' },
      })
      const studentUser = await req.payload.create({
        collection: 'users',
        overrideAccess: true,
        req,
        depth: 0,
        data: { email: student.email, password: student.password, name: 'دانشجوی آزمایشی', roles: ['student'], tenants: [{ tenant: tenant.id }], sandboxTenant: tenant.id, source: 'manual' },
      })
      await req.payload.create({
        collection: 'memberships',
        overrideAccess: true,
        req,
        depth: 0,
        data: { tenant: tenant.id, user: adminUser.id, roles: [role.docs[0].id], status: 'active', expiresAt: expiresAt.toISOString(), note: 'مدیر آکادمی آزمایشی (دمو)' },
      })
      const tpl = await buildTemplate({ req, tenantId: tenant.id, slug, certificatePrefix, adminUserId: adminUser.id, studentUserId: studentUser.id, now })
      return { tenantId: tenant.id, certificateCode: tpl.certificateCode }
    })
    const buildMs = Date.now() - started
    await payload.update({ collection: 'demo-sandboxes', id: reservation.id, overrideAccess: true, depth: 0, data: { status: 'active', tenant: result.tenantId, tenantSlug: slug, buildMs, creatorKeyHash: hashCreatorKey(creatorKey) } })
    payload.logger.info({ msg: 'sandbox created', sandbox: reservation.id, slug, buildMs })
    return { sandboxId: reservation.id, tenantId: result.tenantId, slug, expiresAt, creatorKey, admin, student, certificateCode: result.certificateCode, buildMs }
  } catch (err) {
    // The tenant transaction rolled back; free the slot and keep the error for the operator (no personal data).
    payload.logger.error({ err, msg: 'sandbox build failed', sandbox: reservation.id })
    await payload
      .update({ collection: 'demo-sandboxes', id: reservation.id, overrideAccess: true, depth: 0, data: { status: 'failed', error: String((err as Error)?.message ?? err).slice(0, 300) } })
      .catch((e: unknown) => payload.logger.error({ err: e, msg: 'could not mark sandbox reservation failed' }))
    throw err
  }
}

export const newCreatorKey = randomCreatorKey

/** V8 / F3: store a platform lead only with an explicit consent tick. Never throws into the main flow. */
export async function savePlatformLead(payload: Payload, input: { name?: string; email: string; sandboxId?: number; source: 'demo-form' | 'full-state' | 'expired-state' | 'talk' }): Promise<void> {
  try {
    await payload.create({
      collection: 'demo-leads',
      overrideAccess: true,
      depth: 0,
      data: { name: input.name || null, email: input.email, consent: true, consentText: CONSENT_TEXT, sandbox: input.sandboxId ?? null, source: input.source },
    })
  } catch (err) {
    payload.logger.error({ err, msg: 'demo lead not saved' })
  }
}
