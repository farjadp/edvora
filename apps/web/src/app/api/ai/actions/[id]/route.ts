import { z } from 'zod'
import { decideProposal, targetHref } from '../../../../../lib/ai/proposals'
import { aiSession, sameOrigin } from '../../../../../lib/ai/session'

export const dynamic = 'force-dynamic'

const Body = z.object({ decision: z.enum(['confirm', 'reject']) })

/** E-046 · confirm or reject an assistant proposal. Runs as the signed-in person; see lib/ai/proposals.ts. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'cross-origin' }, { status: 403 })
  const auth = await aiSession()
  if (!auth.ok) return Response.json({ error: auth.status === 401 ? 'unauthenticated' : 'forbidden', message: 'دسترسی شما به دستیار هوشمند در این آکادمی برقرار نیست.' }, { status: auth.status })
  const id = Number((await params).id)
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!Number.isInteger(id) || id <= 0 || !parsed.success) return Response.json({ error: 'invalid input' }, { status: 400 })
  const { s } = auth
  try {
    const r = await decideProposal(s.req, s.ctx, s.tenant.id, id, parsed.data.decision)
    if (!r.ok) return Response.json(r, { status: 409 })
    return Response.json({ ...r, href: r.target ? targetHref(r.target) : null })
  } catch (err) {
    s.req.payload.logger.error({ err, msg: 'ai proposal decision failed' })
    return Response.json({ ok: false, message: 'ثبت تصمیم ناموفق بود؛ دوباره امتحان کنید.' }, { status: 500 })
  }
}
