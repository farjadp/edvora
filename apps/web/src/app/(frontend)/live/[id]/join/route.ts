import { NextResponse } from 'next/server'
import { idOf } from '../../../../../lib/ids'
import { joinAsStudent, loadSession } from '../../../../../lib/live'
import { getRequestOrigin } from '../../../../../lib/origin'
import { getPayloadClient } from '../../../../../lib/payload'
import { getCurrentUser } from '../../../../../lib/session'
import { getCurrentTenant } from '../../../../../lib/tenant'

/**
 * D2: "Join live class" (form POST from /learn). Checks academy, enrollment, cohort, window and that the host has
 * started, then 303s to the provider's per-user join URL. The URL never appears in page HTML (ADR 012) and this
 * handler, not a server action, does the redirect (ADR 005).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = await getRequestOrigin()
  const [tenant, user, payload] = await Promise.all([getCurrentTenant(), getCurrentUser(), getPayloadClient()])
  const id = Number((await params).id)
  if (!user) return NextResponse.redirect(new URL('/login?next=/dashboard', origin), 303)

  const session = await loadSession(payload, tenant.id, id)
  if (!session) return new Response('Not found', { status: 404 })
  const course = await payload.findByID({ collection: 'courses', id: idOf(session.course) ?? -1, depth: 0, overrideAccess: true, disableErrors: true })
  const back = (reason: string) => NextResponse.redirect(new URL(`/learn/${encodeURIComponent(course?.slug ?? '')}?live=${reason}#live`, origin), 303)

  const res = await joinAsStudent({ tenant, user, sessionId: id, origin })
  if (res.ok) {
    if (res.ticket.kind !== 'redirect') return back('provider-down') // token providers need a classroom page (not built)
    return NextResponse.redirect(res.ticket.url, 303)
  }
  // Not enrolled / other cohort: same answer as a missing session, so nothing leaks.
  if (res.reason === 'not-found' || res.reason === 'not-enrolled') return new Response('Not found', { status: 404 })
  return back(res.reason)
}
