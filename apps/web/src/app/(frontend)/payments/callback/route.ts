import { NextResponse, type NextRequest } from 'next/server'
import { handlePaymentCallback } from '../../../../lib/checkout'
import { getRequestOrigin } from '../../../../lib/origin'
import { getPayloadClient } from '../../../../lib/payload'

/** Gateway callback: verify the payment, then send the buyer to the result page on the same academy site. */
export async function GET(req: NextRequest) {
  const origin = await getRequestOrigin()
  const orderId = Number(req.nextUrl.searchParams.get('order'))
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.redirect(new URL('/payments/result?status=failed', origin))
  }
  try {
    const payload = await getPayloadClient()
    const outcome = await handlePaymentCallback(payload, orderId, req.nextUrl.searchParams)
    const url = new URL('/payments/result', origin)
    url.searchParams.set('status', outcome.status)
    url.searchParams.set('order', String(orderId))
    return NextResponse.redirect(url)
  } catch (err) {
    console.error('[payments/callback]', err)
    return NextResponse.redirect(new URL(`/payments/result?status=failed&order=${orderId}`, origin))
  }
}
