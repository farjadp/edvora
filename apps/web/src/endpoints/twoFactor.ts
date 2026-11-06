import { checkTwoFactorReset, generateTotpSecret, openSecret, otpauthUri, sealSecret, verifyTotp } from '@edvora/core'
import type { Endpoint, PayloadRequest } from 'payload'
import { commitTransaction, initTransaction, killTransaction } from 'payload'
import { z } from 'zod'
import { asSystem, getAccess, invalidateAccess, loadMembershipGrants, sessionIdOf, staff2faRequired } from '../access/permissions'
import { isSuperAdmin } from '../access/roles'
import { writeAudit } from '../hooks/audit'
import { idOf } from '../lib/ids'
import { qrSvg } from '../lib/qr'

/**
 * Staff second factor (TOTP), mounted at /api/users/2fa/*. Self-hosted: the secret is generated here and sealed
 * with the server secret; codes come from any offline authenticator app.
 *
 *   POST setup   → { secret, otpauthUri, qrSvg }   start enrolment (not active yet)
 *   POST enable  { code } → turns 2FA on and verifies the current session
 *   POST verify  { code } → verifies the current session after login
 *   POST disable { code } → turns 2FA off (needs a valid code; 409 while STAFF_2FA_REQUIRED=true)
 *   POST reset   { userId } → an admin clears someone else's 2FA and ends their sessions (users.2fa.reset)
 *
 * Wrong code → 401 { attemptsLeft }. The MAX_FAILURES-th wrong code, and every call while locked → 429 { lockedUntil }.
 */

const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000
const ISSUER = 'Edvora'

const codeSchema = z.object({ code: z.string().trim().min(6).max(12) })
const resetSchema = z.object({ userId: z.coerce.number().int().positive() })

type TwoFactor = {
  secret?: string | null
  pendingSecret?: string | null
  lastUsedStep?: number | null
  failedAttempts?: number | null
  lockedUntil?: string | null
  verifiedSessions?: { sid: string; at?: string | null }[] | null
}

const serverSecret = () => process.env.PAYLOAD_SECRET ?? ''
const json = (body: unknown, status = 200) => Response.json(body, { status })

async function body(req: PayloadRequest): Promise<unknown> {
  try {
    return req.json ? await req.json() : {}
  } catch {
    return {}
  }
}

async function loadState(req: PayloadRequest, userId: number) {
  const user = await req.payload.findByID({ collection: 'users', id: userId, depth: 0, showHiddenFields: true, overrideAccess: true, req })
  return { user, tf: (user.twoFactor ?? {}) as TwoFactor }
}

async function save(req: PayloadRequest, userId: number, data: { twoFactorEnabled?: boolean; twoFactor: TwoFactor }) {
  await asSystem(req, () => req.payload.update({ collection: 'users', id: userId, overrideAccess: true, showHiddenFields: true, req, data }))
  invalidateAccess(req)
}

async function audit(req: PayloadRequest, action: string, userId: number, tenants: unknown) {
  const ids = Array.isArray(tenants) ? tenants.map((t) => idOf((t as { tenant?: unknown }).tenant)).filter((x): x is number => x !== null) : []
  await writeAudit(req, { tenants: ids, action, collection: 'users', docId: userId })
}

type CheckResult = { ok: true; step: number } | { ok: false; status: number; body: Record<string, unknown> }

/** Checks a code against the stored secret, with lockout after repeated failures and replay protection. */
async function check(req: PayloadRequest, userId: number, tf: TwoFactor, code: string, sealed: string | null | undefined): Promise<CheckResult> {
  if (tf.lockedUntil && new Date(tf.lockedUntil).getTime() > Date.now()) {
    return { ok: false, status: 429, body: { error: 'Too many attempts. Try again later.', lockedUntil: new Date(tf.lockedUntil).toISOString() } }
  }
  const secret = sealed ? openSecret(sealed, serverSecret()) : null
  if (!secret) return { ok: false, status: 400, body: { error: 'Two-factor authentication is not set up' } }
  const result = verifyTotp(secret, code, { lastUsedStep: tf.lastUsedStep ?? null })
  if (result.ok) return { ok: true, step: result.step }
  const failed = (tf.failedAttempts ?? 0) + 1
  if (failed >= MAX_FAILURES) {
    const lockedUntil = new Date(Date.now() + LOCK_MS).toISOString()
    await save(req, userId, { twoFactor: { ...tf, failedAttempts: 0, lockedUntil } })
    return { ok: false, status: 429, body: { error: 'Too many attempts. Try again later.', lockedUntil } }
  }
  await save(req, userId, { twoFactor: { ...tf, failedAttempts: failed, lockedUntil: null } })
  return { ok: false, status: 401, body: { error: 'Invalid code', attemptsLeft: MAX_FAILURES - failed } }
}

/** Keeps only sessions that still exist on the user, plus the current one. */
function verifiedWith(user: { sessions?: { id: string }[] | null }, tf: TwoFactor, sid: string) {
  const live = new Set((user.sessions ?? []).map((s) => s.id))
  const kept = (tf.verifiedSessions ?? []).filter((v) => live.has(v.sid) && v.sid !== sid)
  return [...kept, { sid, at: new Date().toISOString() }]
}

/** Ends every Payload session of a user (same write as Payload's own "log out everywhere"). */
async function revokeSessions(req: PayloadRequest, userId: number) {
  const doc = await req.payload.db.findOne<{ id: number } & Record<string, unknown>>({ collection: 'users', req, where: { id: { equals: userId } } })
  if (!doc) return
  await req.payload.db.updateOne({ collection: 'users', id: userId, req, returning: false, data: { ...doc, sessions: [], updatedAt: null } })
}

const handler =
  (fn: (req: PayloadRequest, userId: number) => Promise<Response>): Endpoint['handler'] =>
  async (req) => {
    if (!req.user || req.user.collection !== 'users') return json({ error: 'Unauthorized' }, 401)
    try {
      return await fn(req, req.user.id)
    } catch (err) {
      req.payload.logger.error({ err, msg: '2fa endpoint failed' })
      return json({ error: 'Something went wrong' }, 500)
    }
  }

export const twoFactorEndpoints: Endpoint[] = [
  {
    path: '/2fa/setup',
    method: 'post',
    handler: handler(async (req, userId) => {
      const { user, tf } = await loadState(req, userId)
      if (user.twoFactorEnabled) return json({ error: 'Two-factor authentication is already on' }, 409)
      const secret = generateTotpSecret()
      await save(req, userId, { twoFactor: { ...tf, pendingSecret: sealSecret(secret, serverSecret()) } })
      const uri = otpauthUri({ issuer: ISSUER, account: user.email, secret })
      return json({ secret, otpauthUri: uri, qrSvg: qrSvg(uri) })
    }),
  },
  {
    path: '/2fa/enable',
    method: 'post',
    handler: handler(async (req, userId) => {
      const parsed = codeSchema.safeParse(await body(req))
      if (!parsed.success) return json({ error: 'Enter the 6-digit code' }, 400)
      const { user, tf } = await loadState(req, userId)
      if (user.twoFactorEnabled) return json({ error: 'Two-factor authentication is already on' }, 409)
      const result = await check(req, userId, tf, parsed.data.code, tf.pendingSecret)
      if (!result.ok) return json(result.body, result.status)
      const sid = sessionIdOf(req)
      await save(req, userId, {
        twoFactorEnabled: true,
        twoFactor: {
          secret: tf.pendingSecret,
          pendingSecret: null,
          lastUsedStep: result.step,
          failedAttempts: 0,
          lockedUntil: null,
          verifiedSessions: sid ? verifiedWith(user, tf, sid) : [],
        },
      })
      await audit(req, 'users.2fa.enable', userId, user.tenants)
      return json({ ok: true })
    }),
  },
  {
    path: '/2fa/verify',
    method: 'post',
    handler: handler(async (req, userId) => {
      const parsed = codeSchema.safeParse(await body(req))
      if (!parsed.success) return json({ error: 'Enter the 6-digit code' }, 400)
      const sid = sessionIdOf(req)
      if (!sid) return json({ error: 'No session to verify' }, 400)
      const { user, tf } = await loadState(req, userId)
      if (!user.twoFactorEnabled) return json({ error: 'Two-factor authentication is not on' }, 400)
      const result = await check(req, userId, tf, parsed.data.code, tf.secret)
      if (!result.ok) return json(result.body, result.status)
      await save(req, userId, { twoFactor: { ...tf, lastUsedStep: result.step, failedAttempts: 0, lockedUntil: null, verifiedSessions: verifiedWith(user, tf, sid) } })
      return json({ ok: true })
    }),
  },
  {
    path: '/2fa/disable',
    method: 'post',
    handler: handler(async (req, userId) => {
      if (staff2faRequired()) return json({ error: 'Two-factor authentication is required in this academy' }, 409)
      const parsed = codeSchema.safeParse(await body(req))
      if (!parsed.success) return json({ error: 'Enter the 6-digit code' }, 400)
      const { user, tf } = await loadState(req, userId)
      if (!user.twoFactorEnabled) return json({ error: 'Two-factor authentication is not on' }, 400)
      const result = await check(req, userId, tf, parsed.data.code, tf.secret)
      if (!result.ok) return json(result.body, result.status)
      await save(req, userId, { twoFactorEnabled: false, twoFactor: { secret: null, pendingSecret: null, lastUsedStep: null, failedAttempts: 0, lockedUntil: null, verifiedSessions: [] } })
      await audit(req, 'users.2fa.disable', userId, user.tenants)
      return json({ ok: true })
    }),
  },
  {
    path: '/2fa/reset',
    method: 'post',
    handler: handler(async (req) => {
      const parsed = resetSchema.safeParse(await body(req))
      if (!parsed.success) return json({ error: 'userId is required' }, 400)
      const targetId = parsed.data.userId
      const ctx = await getAccess(req)
      if (!ctx) return json({ error: 'Forbidden' }, 403)
      const target = await req.payload.findByID({ collection: 'users', id: targetId, depth: 0, overrideAccess: true, req, disableErrors: true })
      if (!target) return json({ error: 'Not found' }, 404)
      const decision = checkTwoFactorReset(ctx, {
        userId: target.id,
        isPlatformAdmin: isSuperAdmin(target),
        tenantIds: (target.tenants ?? []).map((t) => idOf(t.tenant)).filter((x): x is number => x !== null),
        memberships: await loadMembershipGrants(req, target.id),
      })
      if (!decision.ok) return json({ error: 'Forbidden', reason: decision.reason }, 403)
      if (!target.twoFactorEnabled) return json({ error: 'Two-factor authentication is not on' }, 409)

      // One transaction: 2FA cleared, every session of the target revoked, audit row written — or none of it.
      const own = await initTransaction(req)
      try {
        await save(req, target.id, { twoFactorEnabled: false, twoFactor: { secret: null, pendingSecret: null, lastUsedStep: null, failedAttempts: 0, lockedUntil: null, verifiedSessions: [] } })
        await revokeSessions(req, target.id)
        await writeAudit(req, {
          tenants: decision.tenantIds.map(Number),
          action: 'users.2fa.reset',
          collection: 'users',
          docId: target.id,
          note: `2FA reset for ${target.email}; all sessions revoked`,
        })
        if (own) await commitTransaction(req)
      } catch (err) {
        await killTransaction(req)
        throw err
      }
      return json({ ok: true })
    }),
  },
]
