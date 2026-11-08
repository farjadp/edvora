import { hashCreatorKey, verifyChallenge } from '@edvora/core'
import { cookies } from 'next/headers'
import { getRequestOrigin } from '../../../../../lib/origin'
import { getPayloadClient } from '../../../../../lib/payload'
import { CREATOR_COOKIE, cookieOptions, sealCreator } from '../../../../../lib/sandbox/cookies'
import { buildSandbox, newCreatorKey, reserveSandbox, savePlatformLead } from '../../../../../lib/sandbox/create'
import { CreateInput, isActive, newChallenge, powSecret, remainingFa, timeFa } from '../../../../../lib/sandbox/demoState'
import { allowRequest, claimNonce, demoRequest, json, tooMany } from '../../../../../lib/sandbox/guard'
import { setSelector, verifiedCreator } from '../../../../../lib/sandbox/signin'

export const dynamic = 'force-dynamic'

/**
 * POST /demo/api/create — the one creation endpoint (E-029 V2, A1–A6). JSON in, JSON out, real HTTP statuses.
 * Order: platform host → request rate → kill switch → Zod → honeypot → signed PoW + time check (single use) →
 * already has a live sandbox → DB-locked limits + reservation → build in one transaction → cookies.
 */
export async function POST(request: Request) {
  const r = await demoRequest()
  if (!r) return json({ state: 'not-found' }, 404)
  if (!allowRequest(r)) return tooMany()
  if (!r.cfg.enabled) return json({ state: 'disabled' }, 503)

  const retry = () => json({ state: 'retry', challenge: newChallenge(r.cfg.powBits) }, 400)
  const parsed = CreateInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const badEmail = parsed.error.issues.some((i) => i.path[0] === 'email')
    return badEmail ? json({ state: 'invalid-email', challenge: newChallenge(r.cfg.powBits) }, 400) : retry()
  }
  const input = parsed.data
  // A1: same answer as any other retry; never say why.
  if (input.website) return retry()

  const check = verifyChallenge(input.token, input.counter, powSecret(), { minBits: r.cfg.powBits, minFillMs: r.cfg.minFillMs, ttlMs: r.cfg.challengeTtlMs })
  if (!check.ok || !claimNonce(check.nonce, r.cfg.challengeTtlMs)) return retry()

  const payload = await getPayloadClient()
  const jar = await cookies()
  // C3 / V9: a browser with a live sandbox continues it instead of making a second one.
  const existing = await verifiedCreator(payload, jar.get(CREATOR_COOKIE)?.value)
  if (existing && isActive(existing.tenant)) return json({ state: 'exists' }, 409)

  const creatorKey = newCreatorKey()
  let reserved: Awaited<ReturnType<typeof reserveSandbox>>
  try {
    reserved = await reserveSandbox(payload, r.cfg, { ipHash: r.ipHash, creatorKeyHash: hashCreatorKey(creatorKey), powNonce: check.nonce })
  } catch (err) {
    // Includes a reused nonce (unique index) from another instance.
    payload.logger.error({ err, msg: 'sandbox reservation failed' })
    return retry()
  }
  const { decision, reservation } = reserved
  if (!decision.ok) {
    if (decision.reason === 'rate-limited') return tooMany()
    if (decision.reason === 'disabled') return json({ state: 'disabled' }, 503)
    // F3: interest can still be registered from the full state.
    return json({ state: 'full', nextFreeInFa: decision.nextFreeAt ? remainingFa(decision.nextFreeAt) : null }, 503)
  }
  if (!reservation) return retry()

  let built: Awaited<ReturnType<typeof buildSandbox>>
  try {
    built = await buildSandbox(payload, r.cfg, reservation, creatorKey)
  } catch {
    // V12: nothing half-built stays (one transaction); the reservation is marked failed and logged.
    return json({ state: 'error', challenge: newChallenge(r.cfg.powBits) }, 500)
  }

  // V8: only with an email AND the consent tick; never emailed.
  const leadSaved = Boolean(input.email && input.consent)
  if (leadSaved && input.email) await savePlatformLead(payload, { name: input.name, email: input.email, sandboxId: built.sandboxId, source: 'demo-form' })

  const origin = await getRequestOrigin()
  const maxAgeS = (built.expiresAt.getTime() - Date.now()) / 1000 + r.cfg.graceHours * 3600
  const res = json({
    state: 'ready',
    expiresAt: built.expiresAt.toISOString(),
    expiresAtFa: timeFa(built.expiresAt),
    loginUrl: `${origin}/demo/s/${built.slug}`,
    admin: built.admin,
    student: built.student,
    certificateCode: built.certificateCode,
    buildMs: built.buildMs,
    leadSaved,
  })
  setSelector(res, { id: built.tenantId, expiresAt: built.expiresAt.toISOString() }, maxAgeS)
  res.cookies.set(
    CREATOR_COOKIE,
    sealCreator({ sid: built.sandboxId, tid: built.tenantId, slug: built.slug, exp: built.expiresAt.getTime(), key: built.creatorKey, admin: built.admin, student: built.student }),
    cookieOptions(maxAgeS),
  )
  return res
}
