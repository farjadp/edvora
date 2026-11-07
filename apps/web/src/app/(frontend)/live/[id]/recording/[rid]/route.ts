import { NextResponse } from 'next/server'
import { idOf } from '../../../../../../lib/ids'
import { findEnrollment } from '../../../../../../lib/learning'
import { loadSession } from '../../../../../../lib/live'
import { currentHost } from '../../../../../../lib/liveAccess'
import { recordingUrl } from '../../../../../../lib/liveRecordings'
import { getPayloadClient } from '../../../../../../lib/payload'
import { getCurrentUser } from '../../../../../../lib/session'
import { getCurrentTenant } from '../../../../../../lib/tenant'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const notFound = () => new Response('Not found', { status: 404, headers: NO_STORE })

/**
 * D4: watch a session's recording. Only active students of that session's course and cohort, or its host, get a
 * 5-minute signed link to our private bucket (303). Everyone else: 404, so nothing leaks. The per-student
 * watermark arrives with the protected player (phase-2 B); this link is the plain file.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params
  const [tenant, payload] = await Promise.all([getCurrentTenant(), getPayloadClient()])
  const session = await loadSession(payload, tenant.id, Number(id))
  if (!session) return notFound()

  let allowed = Boolean(await currentHost(tenant, session))
  if (!allowed) {
    const user = await getCurrentUser()
    if (!user) return new Response('Sign in required', { status: 401, headers: NO_STORE })
    const e = await findEnrollment({ payload }, tenant.id, user.id, idOf(session.course) ?? -1)
    const cohort = idOf(session.cohort)
    allowed = Boolean(e && e.status === 'active' && (!cohort || idOf(e.cohort) === cohort))
  }
  if (!allowed) return notFound()

  const url = await recordingUrl(session, decodeURIComponent(rid))
  if (!url) return notFound()
  return NextResponse.redirect(url, { status: 303, headers: NO_STORE })
}
