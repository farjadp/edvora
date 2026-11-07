import { meets } from '@edvora/core/staff'
import { getPayloadClient } from '../../../../../../../lib/payload'
import { getStaffSession } from '../../../../../../../lib/staff'
import { findJob } from '../../../../../../../lib/wpimport/service'
import type { ImportReport } from '../../../../../../../lib/wpimport/report'

export const dynamic = 'force-dynamic'

const cell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"` : v)

/**
 * Redirect list as CSV (W6b, W16) for the host's own redirect rules: written redirects after the import, the preview
 * from the dry-run report before it. Same academy + `import.view`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ job: string }> }): Promise<Response> {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !meets(s, { any: ['import.view'] })) return new Response('Not found', { status: 404 })
  const { job: raw } = await params
  if (!/^\d{1,12}$/.test(raw)) return new Response('Not found', { status: 404 })
  const payload = await getPayloadClient()
  const job = await findJob(payload, s.tenant.id, Number(raw))
  if (!job) return new Response('Not found', { status: 404 })
  let rows: { from: string; to: string; code: number }[]
  if (job.status === 'done') {
    const res = await payload.find({ collection: 'redirects', where: { and: [{ tenant: { equals: s.tenant.id } }, { job: { equals: job.id } }] }, pagination: false, depth: 0, overrideAccess: true, sort: 'from' })
    rows = res.docs.map((r) => ({ from: r.from, to: r.to, code: r.code }))
  } else {
    rows = ((job.report as ImportReport | null)?.redirects ?? []).map((r) => ({ from: r.from, to: r.to, code: r.code }))
  }
  const csv = `﻿from,to,code\n${rows.map((r) => `${cell(r.from)},${cell(r.to)},${r.code}`).join('\n')}\n`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="redirects-${job.id}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
