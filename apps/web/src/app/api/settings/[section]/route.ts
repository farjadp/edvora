import { getSettingsActor, saveSection } from '../../../../lib/settings'
import { sectionByKey } from '../../../../lib/settingsRegistry'
import { getPayloadClient } from '../../../../lib/payload'

export const dynamic = 'force-dynamic'

const MAX_BODY = 6_000_000
const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** Same-origin only: the form posts from /admin on this host (SameSite cookies are the first line, this the second). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Relative 303: the browser resolves it against its own URL, so the academy (Host) never changes (ADR 005). */
const back = (path: string) => new Response(null, { status: 303, headers: { Location: path, ...NO_STORE } })

/**
 * POST /api/settings/<section> (E-047, ADR 019 §1): one settings form. Answers 303 back to the section with
 * `saved=1` / `error=…`, 401 without a session and 403 when the person may not edit that section in that academy.
 */
export async function POST(request: Request, { params }: { params: Promise<{ section: string }> }): Promise<Response> {
  const { section } = await params
  if (!sectionByKey(section) || sectionByKey(section)?.href) return new Response('Not found', { status: 404, headers: NO_STORE })
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403, headers: NO_STORE })
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return new Response('Too large', { status: 413, headers: NO_STORE })

  const payload = await getPayloadClient()
  const actor = await getSettingsActor(payload, request.headers)
  if (!actor) return new Response('Unauthorized', { status: 401, headers: NO_STORE })

  let fd: FormData
  try {
    fd = await request.formData()
  } catch {
    return new Response('Bad request', { status: 400, headers: NO_STORE })
  }
  const asked = Number(fd.get('academy'))
  const tenantId = Number.isInteger(asked) && asked > 0 ? asked : null

  const result = await saveSection(actor, section, tenantId, fd)
  if (!result.ok && result.error === 'forbidden') return new Response('Forbidden', { status: 403, headers: NO_STORE })

  const q = new URLSearchParams()
  if (tenantId !== null) q.set('academy', String(tenantId))
  if (result.ok) {
    q.set('saved', '1')
    if (result.notice) q.set('notice', result.notice)
  } else q.set('error', result.error)
  const anchor = fd.get('kind') ? `#${String(fd.get('kind')).replace(/[^a-z]/g, '')}` : ''
  return back(`/admin/settings/${section}?${q.toString()}${anchor}`)
}
