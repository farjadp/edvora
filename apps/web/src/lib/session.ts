import 'server-only'
import { sandboxState, signSession, verifySession } from '@edvora/core'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { env } from '../env'
import type { User } from '../payload-types'
import { getPayloadClient } from './payload'
import { getCurrentTenant } from './tenant'

const COOKIE = 'edvora_session'
const MAX_AGE_S = 60 * 60 * 24 * 30

/** Student session (phone + SMS login). Staff use Payload's own /admin login. */
export async function startSession(user: Pick<User, 'id'>, tenantId: number): Promise<void> {
  const token = signSession({ uid: user.id, tid: tenantId, exp: Date.now() + MAX_AGE_S * 1000 }, env().SESSION_SECRET)
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_S,
  })
}

export async function endSession(): Promise<void> {
  ;(await cookies()).delete(COOKIE)
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const payload = verifySession((await cookies()).get(COOKIE)?.value, env().SESSION_SECRET)
  if (!payload) return null
  const tenant = await getCurrentTenant()
  // A session is only valid on the academy that issued it.
  if (payload.tid !== tenant.id) return null
  // E-029 (E2, T5): an ended sandbox has no sessions, whatever the cookie says.
  if (tenant.isSandbox && sandboxState(tenant) !== 'active') return null
  const client = await getPayloadClient()
  try {
    const user = await client.findByID({ collection: 'users', id: payload.uid, depth: 0, overrideAccess: true })
    // Suspended or archived accounts lose their session at once (E-021).
    return (user.status ?? 'active') === 'active' ? user : null
  } catch {
    return null
  }
})

export async function requireUser(next: string): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`)
  return user
}
