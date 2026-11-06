import { isPlatformHost, parseSandboxConfig, verifySandboxSelector, type SandboxConfig } from '@edvora/core'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * E-029 / ADR 010 — demo sandbox gate. Only requests carrying the signed sandbox selector cookie on the platform host
 * are touched; everything else passes straight through (no DB, no work).
 *  - live sandbox: `/admin` is closed (C4) → rewritten to the real 403 page.
 *  - ended sandbox (cookie expiry = sandbox expiry, no extension): session cookies are cleared on this very response
 *    (E2), page GETs are 303'd to the ended state on /demo, everything else (API, server actions, form posts) gets 403.
 * The DB-side checks (tenant expiry, membership expiry, beforeLogin, student session) refuse the same requests
 * independently; this layer makes the cookie go away at once and gives the visitor the right screen.
 */
const SELECTOR_COOKIE = 'edvora_sbx'
// Payload's auth cookie is `${cookiePrefix}-token`; cookiePrefix is the default "payload" (payload.config.ts).
const SESSION_COOKIES = ['edvora_session', 'payload-token']

let cached: SandboxConfig | undefined
const sandboxCfg = () => (cached ??= parseSandboxConfig(process.env, process.env.NEXT_PUBLIC_SITE_URL))

function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.includes('.localhost') ? 'http' : 'https')
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${proto}://${host}` : req.nextUrl.origin
}

function clearSessions(res: NextResponse): NextResponse {
  for (const name of SESSION_COOKIES) res.cookies.set(name, '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' })
  return res
}

/** Returns a response when the sandbox gate decides; null = not a sandbox request, carry on. No `server-only` here. */
export function sandboxGate(req: NextRequest): NextResponse | null {
  const token = req.cookies.get(SELECTOR_COOKIE)?.value
  const secret = process.env.SESSION_SECRET
  if (!token || !secret) return null
  const host = (req.headers.get('host') ?? '').toLowerCase()
  if (!isPlatformHost(host, sandboxCfg())) return null
  const sel = verifySandboxSelector(token, `${secret}:sandbox`, Date.now(), true)
  if (!sel) return null

  const path = req.nextUrl.pathname
  if (!sel.expired) {
    if (path === '/admin' || path.startsWith('/admin/')) return NextResponse.rewrite(new URL('/demo/closed', req.url))
    return null
  }

  // Ended: the demo page itself shows the ended state.
  if (path === '/demo' || path.startsWith('/demo/')) return clearSessions(NextResponse.next())
  const isPage = (req.method === 'GET' || req.method === 'HEAD') && !path.startsWith('/api/') && !req.headers.has('next-action')
  if (isPage) return clearSessions(NextResponse.redirect(new URL('/demo?state=ended', originOf(req)), 303))
  return clearSessions(NextResponse.json({ error: 'sandbox ended' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }))
}

