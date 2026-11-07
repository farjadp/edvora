import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_DEFAULT_LANG, ADMIN_LANG_COOKIE, withDefaultAdminLanguage } from './lib/adminLanguage'

/**
 * Next proxy, /admin only (E-035): Persian is the default admin language whatever the browser sends. Without a
 * `payload-lng` cookie Payload would follow Accept-Language and render an English/LTR admin for an English browser.
 * The cookie is added to this request (so the first render is already fa/RTL) and set on the response. English stays
 * available: choosing it in Account sets the cookie, which this proxy then leaves alone. No tenant logic here.
 */
export function proxy(req: NextRequest) {
  const { cookie, changed } = withDefaultAdminLanguage(req.headers.get('cookie'))
  if (!changed) return NextResponse.next()
  const headers = new Headers(req.headers)
  headers.set('cookie', cookie)
  const res = NextResponse.next({ request: { headers } })
  res.cookies.set(ADMIN_LANG_COOKIE, ADMIN_DEFAULT_LANG, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  return res
}

export const config = { matcher: ['/admin', '/admin/:path*'] }
