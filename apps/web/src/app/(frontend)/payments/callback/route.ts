import { NextResponse, type NextRequest } from 'next/server'
import { getRequestOrigin } from '../../../../lib/origin'
import { getPayloadClient } from '../../../../lib/payload'
import { handleGatewayCallback } from '../../../../lib/payments'

/**
 * Gateway callback (GET for most intermediaries, form POST for Mellat/Saman/IDPay): verify, then send the buyer to
 * the result page on the same academy site. The callback needs no session; it is checked against the payment row.
 */
async function handle(req: NextRequest, params: URLSearchParams) {
  const origin = await getRequestOrigin()
  const paymentId = Number(req.nextUrl.searchParams.get('payment'))
  if (!Number.isInteger(paymentId) || paymentId <= 0) return NextResponse.redirect(new URL('/payments/result?status=failed', origin), 303)
  try {
    const payload = await getPayloadClient()
    const outcome = await handleGatewayCallback(payload, paymentId, params)
    const url = new URL('/payments/result', origin)
    url.searchParams.set('status', outcome.status)
    if (outcome.orderId) url.searchParams.set('order', String(outcome.orderId))
    return NextResponse.redirect(url, 303)
  } catch (err) {
    console.error('[payments/callback]', err)
    return NextResponse.redirect(new URL('/payments/result?status=failed', origin), 303)
  }
}

export async function GET(req: NextRequest) {
  return handle(req, req.nextUrl.searchParams)
}

export async function POST(req: NextRequest) {
  const params = new URLSearchParams(req.nextUrl.searchParams)
  try {
    const form = await req.formData()
    for (const [k, v] of form) if (typeof v === 'string') params.set(k, v)
  } catch {
    // Not a form body: query string only.
  }
  return handle(req, params)
}
