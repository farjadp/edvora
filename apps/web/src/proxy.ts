import { NextResponse, type NextRequest } from 'next/server'
import { checkPreviewGate, parsePreviewGate } from '@edvora/core/previewGate'

/**
 * Private preview hosts (E-030): a client demo on a public URL (e.g. a Railway domain mapped to the `iba` tenant)
 * must not be indexed and may sit behind HTTP basic auth. Configured only by env — see docs/runbooks/deploy-railway.md.
 *   PRIVATE_PREVIEW_HOSTS     comma list of hosts, or * for every host
 *   PRIVATE_PREVIEW_USER      basic-auth user     } both set → basic auth on those hosts
 *   PRIVATE_PREVIEW_PASSWORD  basic-auth password }
 * Hosts not listed are untouched.
 */
const gate = parsePreviewGate(process.env)

export function proxy(req: NextRequest) {
  const result = checkPreviewGate(gate, req.headers.get('host'), req.headers.get('authorization'))
  if (result === 'pass') return NextResponse.next()
  if (result === 'challenge') {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Edvora preview", charset="UTF-8"', 'X-Robots-Tag': 'noindex, nofollow' },
    })
  }
  const res = NextResponse.next()
  res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

export const config = {
  // Static assets still get the header from the page that loads them; skip Next internals for speed.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
