import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createLocalReq, logoutOperation } from 'payload'
import { generateExpiredPayloadCookie } from 'payload/shared'
import { getRequestOrigin } from '../../../../lib/origin'
import { getPayloadClient } from '../../../../lib/payload'

/**
 * Staff sign-out: ends this Payload session (removes its `sid`, so the token is dead even if copied) and clears
 * the cookie, then 303 to /staff/login (ADR 005). POST only; SameSite=Lax keeps other sites from triggering it.
 */
export async function POST() {
  const payload = await getPayloadClient()
  try {
    const { user } = await payload.auth({ headers: await headers() })
    if (user && user.collection === 'users') {
      const req = await createLocalReq({ user }, payload)
      await logoutOperation({ collection: payload.collections.users, req })
    }
  } catch (err) {
    // The cookie is cleared below either way.
    payload.logger.error({ err, msg: 'staff logout failed' })
  }
  const res = NextResponse.redirect(new URL('/staff/login', await getRequestOrigin()), 303)
  const expired = generateExpiredPayloadCookie({ collectionAuthConfig: payload.collections.users.config.auth, cookiePrefix: payload.config.cookiePrefix })
  res.headers.append('Set-Cookie', expired)
  return res
}
