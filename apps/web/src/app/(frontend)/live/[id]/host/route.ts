import { NextResponse } from 'next/server'
import { loadSession, startAsHost } from '../../../../../lib/live'
import { currentHost } from '../../../../../lib/liveAccess'
import { getRequestOrigin } from '../../../../../lib/origin'
import { getPayloadClient } from '../../../../../lib/payload'
import { getCurrentTenant } from '../../../../../lib/tenant'

/** D3: the instructor starts the class from /staff and joins as moderator (form POST, 303 per ADR 005). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = await getRequestOrigin()
  const [tenant, payload] = await Promise.all([getCurrentTenant(), getPayloadClient()])
  const session = await loadSession(payload, tenant.id, Number((await params).id))
  if (!session) return new Response('Not found', { status: 404 })
  const host = await currentHost(tenant, session)
  if (!host) return new Response('Not found', { status: 404 })

  const res = await startAsHost({ tenant, user: host.user, session, origin })
  if (res.ok && res.ticket.kind === 'redirect') return NextResponse.redirect(res.ticket.url, 303)
  return NextResponse.redirect(new URL(`/staff/teaching?live=${res.ok ? 'provider-down' : res.reason}`, origin), 303)
}
