import 'server-only'
import { hashCreatorKey, sandboxState } from '@edvora/core'
import type { NextResponse } from 'next/server'
import { generatePayloadCookie, type Payload } from 'payload'
import type { Tenant, User } from '../../payload-types'
import { SANDBOX_LOGIN_CONTEXT } from '../../access/sandbox'
import { startSession } from '../session'
import { CREATOR_COOKIE, SELECTOR_COOKIE, cookieOptions, openCreator, signSelector, type CreatorCookie } from './cookies'

export type SignInResult = { ok: true; to: '/staff' | '/dashboard'; payloadCookie?: string } | { ok: false; error: 'invalid' | 'ended' | 'locked' }

/** The selector cookie for a sandbox, valid until the sandbox's expiry. */
export function setSelector(res: NextResponse, tenant: Pick<Tenant, 'id' | 'expiresAt'>, maxAgeS: number): void {
  const exp = new Date(tenant.expiresAt ?? 0).getTime()
  res.cookies.set(SELECTOR_COOKIE, signSelector({ tid: tenant.id, exp }), cookieOptions(maxAgeS))
}

async function isStaffInSandbox(payload: Payload, userId: number, tenantId: number): Promise<boolean> {
  const m = await payload.count({ collection: 'memberships', where: { and: [{ user: { equals: userId } }, { tenant: { equals: tenantId } }, { status: { equals: 'active' } }] }, overrideAccess: true })
  return m.totalDocs > 0
}

/**
 * Signs a sandbox account in with its password (Payload checks the hash, lockout after failed attempts — per
 * account, so one sandbox's failures never lock another (A5) — and `beforeLogin` refuses an ended sandbox).
 * Only accounts that belong to THIS sandbox are looked up, so real accounts are never touched from here.
 * Staff get a Payload session cookie (→ /staff); students get the student session (→ /dashboard).
 */
export async function signInSandboxAccount(payload: Payload, tenant: Tenant, email: string, password: string): Promise<SignInResult> {
  if (sandboxState(tenant) !== 'active') return { ok: false, error: 'ended' }
  const found = await payload.find({ collection: 'users', where: { and: [{ email: { equals: email.toLowerCase() } }, { sandboxTenant: { equals: tenant.id } }] }, limit: 1, depth: 0, overrideAccess: true })
  const user = found.docs[0] as User | undefined
  if (!user) return { ok: false, error: 'invalid' }
  let token: string | undefined
  try {
    const res = await payload.login({ collection: 'users', data: { email: user.email, password }, context: { [SANDBOX_LOGIN_CONTEXT]: tenant.id } })
    token = res.token
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'LockedAuth') return { ok: false, error: 'locked' }
    const status = (err as { status?: number })?.status
    if (status === 403) return { ok: false, error: 'ended' }
    return { ok: false, error: 'invalid' }
  }
  if (await isStaffInSandbox(payload, user.id, tenant.id)) {
    if (!token) return { ok: false, error: 'invalid' }
    const payloadCookie = generatePayloadCookie({ collectionAuthConfig: payload.collections.users.config.auth, cookiePrefix: payload.config.cookiePrefix, token })
    return { ok: true, to: '/staff', payloadCookie }
  }
  await startSession(user, tenant.id)
  return { ok: true, to: '/dashboard' }
}

/**
 * The creator cookie, checked against its sandbox record (same sandbox, same creator key, still active), so it
 * cannot be replayed against another sandbox.
 */
export async function verifiedCreator(payload: Payload, raw: string | undefined): Promise<{ creator: CreatorCookie; tenant: Tenant } | null> {
  const creator = openCreator(raw)
  if (!creator) return null
  const row = await payload.findByID({ collection: 'demo-sandboxes', id: creator.sid, depth: 0, overrideAccess: true, disableErrors: true })
  if (!row || row.creatorKeyHash !== hashCreatorKey(creator.key) || row.tenantSlug !== creator.slug) return null
  const tenant = await payload.findByID({ collection: 'tenants', id: creator.tid, depth: 1, overrideAccess: true, disableErrors: true })
  if (!tenant || tenant.isSandbox !== true || tenant.slug !== creator.slug) return null
  return { creator, tenant }
}

export { CREATOR_COOKIE }
