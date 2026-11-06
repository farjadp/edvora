import { NextResponse, type NextRequest } from 'next/server'
import { CheckoutError, startInstalmentPayment } from '../../../../lib/checkout'
import { idOf } from '../../../../lib/ids'
import { getRequestOrigin } from '../../../../lib/origin'
import { getPayloadClient } from '../../../../lib/payload'
import { getCurrentUser } from '../../../../lib/session'
import { getCurrentTenant } from '../../../../lib/tenant'

/** Pays the next unpaid instalment of an order (form POST from the student dashboard). */
export async function POST(req: NextRequest) {
  const origin = await getRequestOrigin()
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/login?next=/dashboard', origin), 303)

  const orderId = Number((await req.formData()).get('orderId'))
  try {
    const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])
    const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, overrideAccess: true })
    if (idOf(order.user) !== user.id || idOf(order.tenant) !== tenant.id) {
      return NextResponse.redirect(new URL('/dashboard', origin), 303)
    }
    const url = await startInstalmentPayment({ payload, tenant, order, mobile: user.phone })
    return NextResponse.redirect(url, 303)
  } catch (err) {
    if (!(err instanceof CheckoutError)) console.error('[payments/start]', err)
    return NextResponse.redirect(new URL('/payments/result?status=failed', origin), 303)
  }
}
