import { handleWebhook } from '../../../../../lib/live'
import { getRequestOrigin } from '../../../../../lib/origin'

/**
 * Provider callbacks (ADR 012): participant joined/left, room started/ended, recording ready, end-of-class report.
 * The raw body is read before anything else (signatures cover it), and the signed URL is rebuilt from the public
 * origin, not `req.url`, because proxies rewrite scheme and host. Never throws into the provider.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const rawBody = await req.text()
  const { provider } = await params
  const incoming = new URL(req.url)
  const url = `${await getRequestOrigin()}${incoming.pathname}${incoming.search}`
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v
  })
  try {
    const { status } = await handleWebhook(provider, { url, headers, rawBody })
    return new Response(null, { status })
  } catch (err) {
    console.error('[live] webhook error', provider, err)
    return new Response(null, { status: 500 })
  }
}
