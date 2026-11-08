import { NextResponse } from 'next/server'
import { getRequestOrigin } from '../../../../../lib/origin'
import { getPayloadClient } from '../../../../../lib/payload'
import { isActive } from '../../../../../lib/sandbox/demoState'
import { allowRequest, demoRequest } from '../../../../../lib/sandbox/guard'
import { setSelector } from '../../../../../lib/sandbox/signin'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

/**
 * GET /demo/s/<slug> — the «نشانی ورود» shown on the credentials screen (second device). Selects that sandbox on this
 * browser (signed selector cookie) and sends to the sandbox login form. Only sandboxes are selectable; the slug is
 * random, and selecting one gives no data by itself (accounts still need their password).
 */
export async function GET(_req: Request, { params }: Props) {
  const origin = await getRequestOrigin()
  const go = (path: string) => NextResponse.redirect(new URL(path, origin), 303)
  const r = await demoRequest()
  if (!r) return go('/')
  if (!allowRequest(r)) return go('/demo?state=rate-limited')
  const slug = (await params).slug
  if (!/^sbx-[a-z2-9]{10}$/.test(slug)) return go('/demo?state=ended')
  const payload = await getPayloadClient()
  const res = await payload.find({ collection: 'tenants', where: { and: [{ slug: { equals: slug } }, { isSandbox: { equals: true } }] }, limit: 1, depth: 0, overrideAccess: true })
  const tenant = res.docs[0]
  if (!tenant || !isActive(tenant)) return go('/demo?state=ended')
  const out = go('/demo/login')
  setSelector(out, tenant, (new Date(tenant.expiresAt ?? 0).getTime() - Date.now()) / 1000 + r.cfg.graceHours * 3600)
  return out
}
