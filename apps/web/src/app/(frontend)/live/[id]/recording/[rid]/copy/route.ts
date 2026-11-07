import { NextResponse, after } from 'next/server'
import { loadSession } from '../../../../../../../lib/live'
import { currentHost } from '../../../../../../../lib/liveAccess'
import { copyRecording } from '../../../../../../../lib/liveRecordings'
import { getRequestOrigin } from '../../../../../../../lib/origin'
import { getPayloadClient } from '../../../../../../../lib/payload'
import { getCurrentTenant } from '../../../../../../../lib/tenant'

/** D4f: the host retries copying a recording (waiting for MP4 or failed). Runs after the 303 is sent. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const origin = await getRequestOrigin()
  const { id, rid } = await params
  const [tenant, payload] = await Promise.all([getCurrentTenant(), getPayloadClient()])
  const session = await loadSession(payload, tenant.id, Number(id))
  if (!session || !(await currentHost(tenant, session))) return new Response('Not found', { status: 404 })
  const recordingId = decodeURIComponent(rid)
  if (!session.recordings?.some((r) => r.providerRecordingId === recordingId)) return new Response('Not found', { status: 404 })
  after(() => copyRecording(session.id, recordingId))
  return NextResponse.redirect(new URL('/staff/teaching?live=copy-started', origin), 303)
}
