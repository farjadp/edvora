import { NextResponse } from 'next/server'
import { endSession, loadSession } from '../../../../../lib/live'
import { currentHost } from '../../../../../lib/liveAccess'
import { getRequestOrigin } from '../../../../../lib/origin'
import { getPayloadClient } from '../../../../../lib/payload'
import { getCurrentTenant } from '../../../../../lib/tenant'

/** The host ends the class for everyone (form POST from /staff/teaching). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = await getRequestOrigin()
  const [tenant, payload] = await Promise.all([getCurrentTenant(), getPayloadClient()])
  const session = await loadSession(payload, tenant.id, Number((await params).id))
  if (!session || !(await currentHost(tenant, session))) return new Response('Not found', { status: 404 })
  await endSession(session, origin)
  return NextResponse.redirect(new URL('/staff/teaching?live=ended-ok', origin), 303)
}
