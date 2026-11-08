import { z } from 'zod'
import { runTurn, type ChatEvent } from '../../../../lib/ai/chat'
import { aiSession, sameOrigin } from '../../../../lib/ai/session'

export const dynamic = 'force-dynamic'

const Body = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.number().int().positive().nullable().optional(),
  page: z.object({ path: z.string().max(300).regex(/^\//), title: z.string().max(200).nullable().optional() }).nullable().optional(),
})

/**
 * E-046 · one chat turn, streamed as NDJSON (ADR 018). Server-side only: the browser never talks to a provider.
 * 401 not signed in · 403 no `ai.use` in this academy · 400 bad input.
 */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'cross-origin' }, { status: 403 })
  const auth = await aiSession()
  if (!auth.ok) return Response.json({ error: auth.status === 401 ? 'unauthenticated' : 'forbidden' }, { status: auth.status })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid input' }, { status: 400 })
  const { s } = auth
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`))
      try {
        for await (const e of runTurn({ req: s.req, ctx: s.ctx, tenant: s.tenant, user: s.user, message: parsed.data.message, conversationId: parsed.data.conversationId ?? null, page: parsed.data.page ?? null })) send(e)
      } catch (err) {
        s.req.payload.logger.error({ err, msg: 'ai chat stream failed' })
        send({ t: 'error', message: 'پاسخ دستیار با خطا روبه‌رو شد؛ دوباره امتحان کنید.' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } })
}
