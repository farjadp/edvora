import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { idOf } from '../../../../../lib/ids'
import { getPayloadClient } from '../../../../../lib/payload'
import { paymentReceiptsDir } from '../../../../../lib/privateUploads'
import { getCurrentUser } from '../../../../../lib/session'
import { getStaff } from '../../../../../lib/staff'
import { getCurrentTenant } from '../../../../../lib/tenant'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'" }
const notFound = () => new Response('Not found', { status: 404, headers: NO_STORE })

/**
 * The only way to open a card-to-card receipt (ADR 017, ADR 009 rules). The owner student on this academy's host,
 * or staff of the receipt's academy who can review payments. Everyone else: 404. Never cached.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return notFound()
  const [student, staff, tenant] = await Promise.all([getCurrentUser(), getStaff(), getCurrentTenant()])
  if (!student && !staff) return new Response('Sign in required', { status: 401, headers: NO_STORE })

  const payload = await getPayloadClient()
  const file = await payload.findByID({ collection: 'payment-receipts', id, depth: 0, overrideAccess: true, disableErrors: true })
  if (!file?.filename) return notFound()
  const fileTenant = idOf(file.tenant)
  const ownerOk = Boolean(student && fileTenant === tenant.id && idOf(file.owner) === student.id)
  let staffOk = false
  if (!ownerOk && staff && fileTenant !== null) {
    const [rec, app] = await Promise.all([staff.can(fileTenant, 'payments.manual.record'), staff.can(fileTenant, 'payments.manual.approve')])
    staffOk = rec || app
  }
  if (!ownerOk && !staffOk) return notFound()

  const dir = paymentReceiptsDir()
  const full = path.resolve(dir, path.basename(file.filename))
  if (!full.startsWith(dir + path.sep)) return notFound()
  let data: Buffer
  try {
    data = await readFile(full)
  } catch (err) {
    console.error('[receipt] missing on disk', id, err)
    return notFound()
  }
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': file.mimeType ?? 'application/octet-stream',
      'Content-Length': String(data.length),
      'Content-Disposition': `inline; filename="receipt-${file.id}${path.extname(file.filename)}"`,
    },
  })
}
