import { meets } from '@edvora/core/staff'
import { getPayloadClient } from '../../../../../../../lib/payload'
import { getStaffSession } from '../../../../../../../lib/staff'
import { findJob } from '../../../../../../../lib/wpimport/service'

export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

/** Progress of one import job (`/staff/import/<id>/state`) (display only; the queue does the work). Same academy + `import.view`. */
export async function GET(_req: Request, { params }: { params: Promise<{ job: string }> }): Promise<Response> {
  const s = await getStaffSession()
  if (s.state !== 'ok') return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore })
  if (!meets(s, { any: ['import.view'] })) return Response.json({ error: 'forbidden' }, { status: 403, headers: noStore })
  const { job: raw } = await params
  if (!/^\d{1,12}$/.test(raw)) return Response.json({ error: 'not_found' }, { status: 404, headers: noStore })
  const job = await findJob(await getPayloadClient(), s.tenant.id, Number(raw))
  if (!job) return Response.json({ error: 'not_found' }, { status: 404, headers: noStore })
  const p = (job.progress ?? {}) as Record<string, unknown>
  return Response.json({ status: job.status, phase: p.phase ?? null, media: p.media ?? null, records: p.records ?? null, error: job.error ?? null }, { headers: noStore })
}
