import { requirePlatformAdmin } from '../../../../../lib/sandbox/ops'

export const dynamic = 'force-dynamic'

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  // CSV + spreadsheet formula injection safe.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

/** GET /demo/ops/leads.csv — platform demo leads export (O3), super-admin only. */
export async function GET() {
  const admin = await requirePlatformAdmin()
  if (!admin) return new Response('Not found', { status: 404 })
  const res = await admin.payload.find({ collection: 'demo-leads', sort: '-createdAt', limit: 10_000, pagination: false, depth: 0, overrideAccess: true })
  const lines = [['createdAt', 'name', 'email', 'consent', 'source', 'sandbox'].join(',')]
  for (const d of res.docs) lines.push([d.createdAt, d.name, d.email, d.consent, d.source, typeof d.sandbox === 'object' ? d.sandbox?.id : d.sandbox].map(cell).join(','))
  return new Response(`﻿${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="edvora-demo-leads.csv"', 'Cache-Control': 'private, no-store' },
  })
}
