import { NextResponse, type NextRequest } from 'next/server'
import { checkPreviewGate, parsePreviewGate } from '@edvora/core/previewGate'
import { ADMIN_DEFAULT_LANG, ADMIN_LANG_COOKIE, withDefaultAdminLanguage } from './lib/adminLanguage'
import { sandboxGate } from './lib/sandbox/proxyGate'

/**
 * Next proxy. Two independent jobs, no tenant logic:
 *
 * 1. Private preview hosts (E-030): a client demo on a public URL (e.g. a Railway domain mapped to the `iba` tenant)
 *    must not be indexed and may sit behind HTTP basic auth. Configured only by env — see docs/runbooks/deploy-railway.md.
 *      PRIVATE_PREVIEW_HOSTS     comma list of hosts, or * for every host
 *      PRIVATE_PREVIEW_USER      basic-auth user     } both set → basic auth on those hosts
 *      PRIVATE_PREVIEW_PASSWORD  basic-auth password }
 *    A user without a password locks the hosts (fail closed) until the password is set. Hosts not listed are untouched.
 *
 * 2. /admin only (E-035): Persian is the default admin language whatever the browser sends. Without a `payload-lng`
 *    cookie Payload would follow Accept-Language and render an English/LTR admin for an English browser. The cookie is
 *    added to this request (so the first render is already fa/RTL) and set on the response. English stays available:
 *    choosing it in Account sets the cookie, which this proxy then leaves alone.
 *
 * 3. Demo sandboxes (E-029, ADR 013): see lib/sandbox/proxyGate.ts. Only requests with the signed sandbox cookie on
 *    the platform host are affected (ended sandbox → sessions cleared + ended state; live sandbox → /admin closed).
 */
const gate = parsePreviewGate(process.env)

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

export function proxy(req: NextRequest) {
  const result = checkPreviewGate(gate, req.headers.get('host'), req.headers.get('authorization'))
  if (result === 'challenge') {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Edvora preview", charset="UTF-8"', 'X-Robots-Tag': 'noindex, nofollow' },
    })
  }

  const sandbox = sandboxGate(req)
  if (sandbox) return sandbox

  let res = NextResponse.next()
  if (isAdminPath(req.nextUrl.pathname)) {
    const { cookie, changed } = withDefaultAdminLanguage(req.headers.get('cookie'))
    if (changed) {
      const headers = new Headers(req.headers)
      headers.set('cookie', cookie)
      res = NextResponse.next({ request: { headers } })
      res.cookies.set(ADMIN_LANG_COOKIE, ADMIN_DEFAULT_LANG, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
    }
  }
  if (result === 'noindex') res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

export const config = {
  // Every page (for the preview gate); skip Next internals for speed. Static assets still get the header from the
  // page that loads them.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
