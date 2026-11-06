import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getPayloadClient } from '../../../../lib/payload'
import { getRequestOrigin } from '../../../../lib/origin'
import { CREATOR_COOKIE, SELECTOR_COOKIE } from '../../../../lib/sandbox/cookies'
import { generateExpiredPayloadCookie } from 'payload/shared'

export const dynamic = 'force-dynamic'

/** POST /demo/leave — leave the sandbox on this browser: drops the selector, creator and session cookies (303). */
export async function POST() {
  const payload = await getPayloadClient()
  const jar = await cookies()
  for (const name of [SELECTOR_COOKIE, CREATOR_COOKIE, 'edvora_session']) jar.delete(name)
  const res = NextResponse.redirect(new URL('/demo', await getRequestOrigin()), 303)
  res.headers.append('Set-Cookie', generateExpiredPayloadCookie({ collectionAuthConfig: payload.collections.users.config.auth, cookiePrefix: payload.config.cookiePrefix }))
  return res
}
