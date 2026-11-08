import { ingestDocument } from '../../../../lib/ai/knowledge'
import { MAX_UPLOAD_BYTES } from '../../../../lib/ai/parse'
import { aiSession, sameOrigin } from '../../../../lib/ai/session'

export const dynamic = 'force-dynamic'

/** E-046 · upload a knowledge document (multipart `file`, optional `title`). Needs `ai.manage` in this academy. */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: 'cross-origin' }, { status: 403 })
  const auth = await aiSession()
  if (!auth.ok) return Response.json({ error: 'forbidden' }, { status: auth.status })
  if (!auth.s.manage) return Response.json({ error: 'forbidden', message: 'بارگذاری سند به دسترسی «تنظیم دستیار هوشمند» نیاز دارد.' }, { status: 403 })
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return Response.json({ ok: false, error: 'فایلی انتخاب نشده است.' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ ok: false, error: 'حجم فایل بیش از ۱۰ مگابایت است.' }, { status: 413 })
  const title = form?.get('title')
  try {
    const r = await ingestDocument(auth.s.req, auth.s.tenant.id, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }, typeof title === 'string' ? title : null)
    return Response.json(r, { status: r.ok ? 200 : 422 })
  } catch (err) {
    auth.s.req.payload.logger.error({ err, msg: 'ai document upload failed' })
    return Response.json({ ok: false, error: 'بارگذاری ناموفق بود؛ دوباره امتحان کنید.' }, { status: 500 })
  }
}
