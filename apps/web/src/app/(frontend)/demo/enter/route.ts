import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getRequestOrigin } from '../../../../lib/origin'
import { getPayloadClient } from '../../../../lib/payload'
import { CREATOR_COOKIE } from '../../../../lib/sandbox/cookies'
import { isActive } from '../../../../lib/sandbox/demoState'
import { allowRequest, demoRequest } from '../../../../lib/sandbox/guard'
import { setSelector, signInSandboxAccount, verifiedCreator } from '../../../../lib/sandbox/signin'

export const dynamic = 'force-dynamic'

/**
 * POST /demo/enter (form: role=admin|student) — one-click «ورود» and «ادامه» (C1, C3). Uses the passwords sealed in
 * the creator cookie, so nothing is typed or shown again. Lands in /staff or /dashboard of THIS sandbox via 303
 * (ADR 005, V5): the selector cookie is (re)set on the same response.
 */
export async function POST(request: Request) {
  const origin = await getRequestOrigin()
  const go = (path: string) => NextResponse.redirect(new URL(path, origin), 303)
  const r = await demoRequest()
  if (!r) return go('/')
  if (!allowRequest(r)) return go('/demo?state=rate-limited')
  const role = String((await request.formData().catch(() => null))?.get('role') ?? '')
  if (role !== 'admin' && role !== 'student') return go('/demo')

  const payload = await getPayloadClient()
  const found = await verifiedCreator(payload, (await cookies()).get(CREATOR_COOKIE)?.value)
  if (!found) return go('/demo')
  if (!isActive(found.tenant)) return go('/demo?state=ended')
  const creds = role === 'admin' ? found.creator.admin : found.creator.student
  const res = await signInSandboxAccount(payload, found.tenant, creds.email, creds.password)
  // Password changed by the visitor, or locked: fall back to the login form.
  if (!res.ok) return res.error === 'ended' ? go('/demo?state=ended') : go(`/demo/login?error=${res.error}`)
  const out = go(res.to)
  const maxAgeS = (new Date(found.tenant.expiresAt ?? 0).getTime() - Date.now()) / 1000 + r.cfg.graceHours * 3600
  setSelector(out, found.tenant, maxAgeS)
  if (res.payloadCookie) out.headers.append('Set-Cookie', res.payloadCookie)
  return out
}
