import { NextResponse } from 'next/server'
import { getRequestOrigin } from '../../../../../lib/origin'
import { deleteSandboxNow } from '../../../../../lib/sandbox/cleanup'
import { requirePlatformAdmin } from '../../../../../lib/sandbox/ops'

export const dynamic = 'force-dynamic'

/** POST /demo/ops/purge (form: tenant) — super-admin "delete now" (O1). SameSite=Lax blocks cross-site posts. 303 back. */
export async function POST(request: Request) {
  const admin = await requirePlatformAdmin()
  if (!admin) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const id = Number((await request.formData().catch(() => null))?.get('tenant'))
  if (Number.isInteger(id) && id > 0) {
    try {
      await deleteSandboxNow(admin.payload, id)
      admin.payload.logger.info({ msg: 'sandbox deleted by operator', tenant: id, by: admin.user.id })
    } catch (err) {
      admin.payload.logger.error({ err, msg: 'operator delete failed', tenant: id })
    }
  }
  return NextResponse.redirect(new URL('/demo/ops', await getRequestOrigin()), 303)
}
