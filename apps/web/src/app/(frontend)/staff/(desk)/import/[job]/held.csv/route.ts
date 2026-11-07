import { meets } from '@edvora/core/staff'
import { getPayloadClient } from '../../../../../../../lib/payload'
import { getStaffSession } from '../../../../../../../lib/staff'
import type { ImportReport } from '../../../../../../../lib/wpimport/report'
import { auditImport, findJob } from '../../../../../../../lib/wpimport/service'

export const dynamic = 'force-dynamic'

const cell = (v: string) => (/[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"` : v)
const REASON: Record<string, string> = { no_phone: 'شماره ندارد', duplicate_phone: 'شمارهٔ تکراری' }

/**
 * W8b: the "needs phone" list as CSV, to collect phones from students. Contains personal data, so it needs
 * `import.run` in this academy and every download is audit-logged.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ job: string }> }): Promise<Response> {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !s.user || !meets(s, { any: ['import.run'] })) return new Response('Not found', { status: 404 })
  const { job: raw } = await params
  if (!/^\d{1,12}$/.test(raw)) return new Response('Not found', { status: 404 })
  const payload = await getPayloadClient()
  const job = await findJob(payload, s.tenant.id, Number(raw))
  if (!job) return new Response('Not found', { status: 404 })
  const held = (job.report as ImportReport | null)?.heldUsers ?? []
  await auditImport(payload, { tenant: s.tenant.id, actor: { id: s.user.id, email: s.user.email }, action: 'import.held.export', collection: 'import-jobs', docId: job.id, note: `${held.length} rows` })
  const rows = held.map((u) => [u.wpId, u.name ?? '', u.contactEmail ?? '', REASON[u.reason] ?? u.reason, u.phone ?? '', ''].map(cell).join(','))
  const csv = `﻿wp_user_id,name,email,reason,shared_phone,new_phone\n${rows.join('\n')}\n`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="held-users-${job.id}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
