import { exportRange } from '@edvora/core/finance'
import { meets } from '@edvora/core/staff'
import { canIn } from '../../../../../../access/permissions'
import { auditExport, financeExport } from '../../../../../../lib/finance'
import { getStaffSession } from '../../../../../../lib/staff'
import { XLSX_MIME, buildXlsx } from '../../../../../../lib/xlsx'

export const dynamic = 'force-dynamic'

const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' } })

/**
 * E-023 (ADR 021): payments, instalments and refunds of this academy for a date range, as .xlsx built on the server.
 * Contains personal data: needs `finance.export` in this academy (checked from the session and again against the
 * database), the academy comes from the Host header, and the audit row is written before the file is sent.
 * Anyone else gets 404 (no hint that the route exists).
 */
export async function GET(req: Request): Promise<Response> {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !s.user || !s.req || !meets(s, { any: ['finance.export'] })) return text('Not found', 404)
  if (!(await canIn(s.req, s.tenant.id, 'finance.export'))) return text('Not found', 404)
  const url = new URL(req.url)
  const range = exportRange(url.searchParams.get('from') ?? '', url.searchParams.get('to') ?? '')
  if (!range.ok) return text(range.message, 400)
  const ctx = { tenant: s.tenant, user: s.user, req: s.req }
  const { sheets, counts } = await financeExport(ctx, range.from, range.to)
  const from = url.searchParams.get('from')!
  const to = url.searchParams.get('to')!
  try {
    await auditExport(ctx, `${from}..${to}: ${counts.payments} payments, ${counts.instalments} instalments, ${counts.refunds} refunds`)
  } catch (err) {
    console.error('[finance] export audit failed; export refused', err)
    return text('Export could not be logged, so it was not sent.', 500)
  }
  const body = buildXlsx(sheets)
  return new Response(Buffer.from(body), {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="finance-${s.tenant.slug}-${from}_${to}.xlsx"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
