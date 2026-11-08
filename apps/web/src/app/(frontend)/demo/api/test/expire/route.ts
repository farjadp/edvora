import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sandboxConfig } from '../../../../../../access/sandbox'
import { SYSTEM_CONTEXT } from '../../../../../../access/permissions'
import { getPayloadClient } from '../../../../../../lib/payload'
import { SELECTOR_COOKIE, cookieOptions, readSelector, signSelector } from '../../../../../../lib/sandbox/cookies'
import { cronAuthorized } from '../../../../../../lib/sandbox/guard'

export const dynamic = 'force-dynamic'

/**
 * E2E HOOK — POST /demo/api/test/expire (ADR 013 §e2e). Exists only with SANDBOX_E2E_HOOKS=true, and needs the cron
 * secret. Ends the sandbox selected by this browser now, exactly like the clock would: tenant + memberships expire,
 * and the selector cookie is re-issued with the past expiry so the proxy path is exercised too.
 * `?purge=1` also sets purgeAt = now, so the next cleanup run hard-deletes it (E4/E6 tests).
 */
export async function POST(request: Request) {
  if (!sandboxConfig().e2eHooks || !cronAuthorized(request)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const sel = readSelector((await cookies()).get(SELECTOR_COOKIE)?.value, true)
  if (!sel) return NextResponse.json({ error: 'no sandbox selected' }, { status: 400 })
  const payload = await getPayloadClient()
  const tenant = await payload.findByID({ collection: 'tenants', id: sel.tid, depth: 0, overrideAccess: true, disableErrors: true })
  if (!tenant || tenant.isSandbox !== true) return NextResponse.json({ error: 'not a sandbox' }, { status: 400 })
  const now = new Date(Date.now() - 1000).toISOString()
  const purge = new URL(request.url).searchParams.get('purge') === '1'
  const ctx = { [SYSTEM_CONTEXT]: true }
  await payload.update({ collection: 'tenants', id: tenant.id, overrideAccess: true, depth: 0, context: ctx, data: { expiresAt: now, ...(purge ? { purgeAt: now } : {}) } })
  await payload.update({ collection: 'memberships', where: { tenant: { equals: tenant.id } }, overrideAccess: true, depth: 0, context: ctx, data: { expiresAt: now } })
  await payload.update({ collection: 'demo-sandboxes', where: { tenant: { equals: tenant.id } }, overrideAccess: true, depth: 0, data: { expiresAt: now } })
  const res = NextResponse.json({ ok: true, tenant: tenant.id, expiresAt: now, purge })
  res.cookies.set(SELECTOR_COOKIE, signSelector({ tid: tenant.id, exp: Date.parse(now) }), cookieOptions(3600))
  return res
}
