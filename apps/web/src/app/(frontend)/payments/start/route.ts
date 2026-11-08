import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getRequestOrigin } from '../../../../lib/origin'
import { getPayloadClient } from '../../../../lib/payload'
import { PaymentError, loadStudentOrder, startGatewayPayment } from '../../../../lib/payments'
import { getCurrentUser } from '../../../../lib/session'
import { getCurrentTenant } from '../../../../lib/tenant'

const Input = z.object({
  orderId: z.coerce.number().int().positive(),
  method: z.union([z.literal('env'), z.coerce.number().int().positive()]).default('env'),
  pick: z.enum(['next', 'all']).default('next'),
})

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

/**
 * A same-origin page that posts the bank's form (Mellat, Saman need a POST). The small inline script submits it;
 * without JavaScript the button does. No external script is loaded (AGENTS.md).
 */
function postForm(url: string, fields: Record<string, string>): Response {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('')
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>در حال انتقال به درگاه بانک</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:4rem 1rem;line-height:2"><form id="go" method="post" action="${esc(url)}">${inputs}<p>در حال انتقال به صفحهٔ امن بانک…</p><button type="submit">ادامه</button></form><script>document.getElementById('go').submit()</script></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

/** Starts an online gateway payment for the student's order (form POST from /pay/<order>). */
export async function POST(req: NextRequest) {
  const origin = await getRequestOrigin()
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/login?next=/dashboard', origin), 303)
  const parsed = Input.safeParse(Object.fromEntries(await req.formData()))
  if (!parsed.success) return NextResponse.redirect(new URL('/dashboard', origin), 303)
  const { orderId, method, pick } = parsed.data
  try {
    const [payload, tenant] = await Promise.all([getPayloadClient(), getCurrentTenant()])
    const order = await loadStudentOrder(payload, tenant.id, user.id, orderId)
    const { redirect } = await startGatewayPayment({ payload, tenant, order, user, method, pick, origin })
    if (redirect.method === 'POST') return postForm(redirect.url, redirect.fields)
    return NextResponse.redirect(redirect.url, 303)
  } catch (err) {
    if (!(err instanceof PaymentError)) console.error('[payments/start]', err)
    const url = new URL(`/pay/${orderId}`, origin)
    // A code, not text: the page shows its own copy (no message injection through the URL).
    url.searchParams.set('error', 'gateway')
    return NextResponse.redirect(url, 303)
  }
}
