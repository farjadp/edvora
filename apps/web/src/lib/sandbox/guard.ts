import 'server-only'
import { RateWindow, clientIpFrom, hashIp, isPlatformHost, safeEqual, type SandboxConfig } from '@edvora/core'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { sandboxConfig } from '../../access/sandbox'
import { env } from '../../env'
import { normalizeHost } from '../tenant'

/**
 * Request-level guards for the /demo endpoints: platform host only, per-IP request rate (A3, in-process sliding
 * window), and the client IP behind the configured number of trusted proxy hops (A4). The daily per-IP cap is
 * enforced in the DB inside the reservation lock (create.ts), so it holds across instances and restarts.
 */
let window: RateWindow | undefined
const seenNonces = new Map<string, number>()

export type DemoRequest = { cfg: SandboxConfig; ipHash: string; host: string }

export async function demoRequest(): Promise<DemoRequest | null> {
  const cfg = sandboxConfig()
  const h = await headers()
  const host = normalizeHost(h.get('host'))
  if (!isPlatformHost(host, cfg)) return null
  const ip = clientIpFrom(h.get('x-forwarded-for'), h.get('x-real-ip'), cfg.trustedProxyHops)
  return { cfg, host, ipHash: hashIp(ip, env().SESSION_SECRET) }
}

/** false = over SANDBOX_REQUESTS_PER_MINUTE for this IP. */
export function allowRequest(r: DemoRequest): boolean {
  window ??= new RateWindow(r.cfg.requestsPerMinute, 60_000)
  return window.hit(r.ipHash)
}

/** Cheap in-process single-use check for PoW nonces; the unique DB column is the real guarantee. */
export function claimNonce(nonce: string, ttlMs: number): boolean {
  const now = Date.now()
  if (seenNonces.size > 5000) for (const [n, t] of seenNonces) if (t < now) seenNonces.delete(n)
  if ((seenNonces.get(nonce) ?? 0) > now) return false
  seenNonces.set(nonce, now + ttlMs)
  return true
}

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })

export const tooMany = () => json({ state: 'rate-limited' }, 429)

/** Bearer SANDBOX_CRON_SECRET (≥ 24 chars) for the cron and e2e routes. No secret configured = they answer 404. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.SANDBOX_CRON_SECRET?.trim() ?? ''
  if (secret.length < 24) return false
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  return safeEqual(got, secret)
}
