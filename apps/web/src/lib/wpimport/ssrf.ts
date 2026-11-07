/**
 * Media pull guard (ADR 011 §Media pull). Edvora fetches files from the academy's WordPress host only:
 * the site's own hosts or hosts the admin approved in the dry run, never private/loopback addresses (checked on the
 * address actually connected to, so DNS rebinding cannot slip past), size-capped, type decided by magic bytes.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isPrivateAddress } from '@edvora/integrations/wordpress'
import { isIP, type LookupFunction } from 'node:net'

export { isPrivateAddress }

export type MediaKind = { ext: 'jpg' | 'png' | 'gif' | 'webp' | 'pdf'; mime: string; image: boolean }

export const MEDIA_LIMITS = { imageBytes: 10 * 1024 * 1024, fileBytes: 50 * 1024 * 1024 } as const

// ---------------------------------------------------------------- URL rule

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: 'bad_url' | 'scheme' | 'credentials' | 'host_not_allowed' | 'private_address' }

/** Hosts (`host[:port]`, lower-case) a job may pull from: home/site/uploads hosts plus admin-approved ones. */
export function allowedHosts(urls: readonly (string | null | undefined)[], approved: readonly string[] = []): Set<string> {
  const out = new Set<string>()
  for (const u of urls) {
    if (!u) continue
    try {
      out.add(new URL(u).host.toLowerCase())
    } catch {
      /* ignore */
    }
  }
  for (const h of approved) if (h) out.add(h.toLowerCase())
  return out
}

export function checkMediaUrl(raw: string, hosts: ReadonlySet<string>): UrlCheck {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'bad_url' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'scheme' }
  if (url.username || url.password) return { ok: false, reason: 'credentials' }
  if (!hosts.has(url.host.toLowerCase())) return { ok: false, reason: 'host_not_allowed' }
  // Literal private IPs are refused before any network access.
  if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(url.hostname)) return { ok: false, reason: 'private_address' }
  return { ok: true, url }
}

// ---------------------------------------------------------------- content

/** Allow-list by magic bytes. SVG (scriptable), HTML, video and audio are refused. */
export function sniffMedia(bytes: Uint8Array): MediaKind | null {
  const b = (i: number) => bytes[i] ?? -1
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { ext: 'jpg', mime: 'image/jpeg', image: true }
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return { ext: 'png', mime: 'image/png', image: true }
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38 && (b(4) === 0x37 || b(4) === 0x39) && b(5) === 0x61) return { ext: 'gif', mime: 'image/gif', image: true }
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return { ext: 'webp', mime: 'image/webp', image: true }
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d) return { ext: 'pdf', mime: 'application/pdf', image: false }
  return null
}

// ---------------------------------------------------------------- fetch

export class PullError extends Error {
  constructor(
    public readonly code: 'refused' | 'private_address' | 'http' | 'too_large' | 'type' | 'timeout' | 'network' | 'redirect',
    message: string,
    /** Worth retrying (network/5xx/timeout). */
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'PullError'
  }
}

/** DNS lookup that refuses private addresses; used as the socket's `lookup`, so the checked IP is the one dialled. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4)
    const list = (addresses as unknown as LookupAddress[]) ?? []
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error(`Refusing private address for ${hostname}`), { code: 'EPRIVATE' }), '', 4)
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list)
    const first = list[0]!
    callback(null, first.address, first.family)
  })
}

export type PullResult = { bytes: Buffer; kind: MediaKind; finalUrl: string }

export type PullOptions = {
  hosts: ReadonlySet<string>
  timeoutMs?: number
  maxRedirects?: number
  /** For tests: replaces the network. */
  get?: (url: URL) => Promise<{ status: number; headers: Record<string, string | undefined>; body: AsyncIterable<Buffer> }>
}

function nodeGet(url: URL, timeoutMs: number): Promise<{ status: number; headers: Record<string, string | undefined>; body: AsyncIterable<Buffer> }> {
  return new Promise((resolve, reject) => {
    const fn = url.protocol === 'https:' ? httpsRequest : httpRequest
    const req = fn(url, { method: 'GET', lookup: guardedLookup, timeout: timeoutMs, headers: { 'User-Agent': 'Edvora-Import/1.0', Accept: 'image/*,application/pdf' } }, (res: IncomingMessage) => {
      const headers: Record<string, string | undefined> = {}
      for (const [k, v] of Object.entries(res.headers)) headers[k] = Array.isArray(v) ? v[0] : v
      resolve({ status: res.statusCode ?? 0, headers, body: res })
    })
    req.on('timeout', () => req.destroy(new PullError('timeout', 'Timed out', true)))
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof PullError) return reject(err)
      if (err.code === 'EPRIVATE') return reject(new PullError('private_address', err.message))
      reject(new PullError('network', err.message, true))
    })
    req.end()
  })
}

/** One guarded download (redirects re-checked against the same rules). */
export async function pullMedia(raw: string, opts: PullOptions): Promise<PullResult> {
  const get = opts.get ?? ((u: URL) => nodeGet(u, opts.timeoutMs ?? 20_000))
  let current = raw
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const check = checkMediaUrl(current, opts.hosts)
    if (!check.ok) throw new PullError(check.reason === 'private_address' ? 'private_address' : 'refused', `Refused ${check.reason}`)
    const res = await get(check.url)
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.location
      if (!loc) throw new PullError('redirect', 'Redirect without location')
      current = new URL(loc, check.url).toString()
      continue
    }
    if (res.status !== 200) throw new PullError('http', `HTTP ${res.status}`, res.status >= 500 || res.status === 429)
    const declared = Number(res.headers['content-length'] ?? NaN)
    if (Number.isFinite(declared) && declared > MEDIA_LIMITS.fileBytes) throw new PullError('too_large', `${declared} bytes`)
    const chunks: Buffer[] = []
    let total = 0
    for await (const chunk of res.body) {
      total += chunk.byteLength
      if (total > MEDIA_LIMITS.fileBytes) throw new PullError('too_large', `> ${MEDIA_LIMITS.fileBytes} bytes`)
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)
    const kind = sniffMedia(bytes)
    if (!kind) throw new PullError('type', 'File type not allowed')
    if (kind.image && bytes.byteLength > MEDIA_LIMITS.imageBytes) throw new PullError('too_large', `image ${bytes.byteLength} bytes`)
    return { bytes, kind, finalUrl: check.url.toString() }
  }
  throw new PullError('redirect', 'Too many redirects')
}

/** `pullMedia` with up to 3 attempts and exponential backoff on retryable errors. */
export async function pullMediaWithRetry(raw: string, opts: PullOptions & { attempts?: number; backoffMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<PullResult> {
  const attempts = opts.attempts ?? 3
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await pullMedia(raw, opts)
    } catch (err) {
      lastErr = err
      if (!(err instanceof PullError) || !err.retryable || i === attempts - 1) throw err
      await sleep((opts.backoffMs ?? 500) * 2 ** i)
    }
  }
  throw lastErr
}
