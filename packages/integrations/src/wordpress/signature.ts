/**
 * HMAC-SHA256 signatures for push requests and bundles (FORMAT.md §1, §5). Server-only (node:crypto).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  HEADER_CONNECTION,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  NONCE_TTL_SECONDS,
  SIGNATURE_WINDOW_SECONDS,
} from './format'

type Bytes = string | Uint8Array

const toBuffer = (b: Bytes): Buffer => (typeof b === 'string' ? Buffer.from(b, 'utf8') : Buffer.from(b.buffer, b.byteOffset, b.byteLength))

export function sha256Hex(data: Bytes): string {
  return createHash('sha256').update(toBuffer(data)).digest('hex')
}

export function hmacHex(secret: string, data: Bytes): string {
  return createHmac('sha256', Buffer.from(secret, 'utf8')).update(toBuffer(data)).digest('hex')
}

/** Constant-time comparison of two lower-case hex digests (false on any length/format mismatch). */
export function safeEqualHex(expected: string, given: string): boolean {
  if (!/^[0-9a-f]+$/.test(given) || given.length !== expected.length || given.length % 2 !== 0) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'))
}

export type CanonicalRequestInput = {
  method: string
  /** Exactly as sent, e.g. `/api/import/push/records?kind=wp.user&seq=3`. */
  pathWithQuery: string
  timestamp: number | string
  nonce: string
  body?: Bytes | null
}

/** `METHOD\nPATH_WITH_QUERY\nTIMESTAMP\nNONCE\nhex(sha256(body))` */
export function canonicalRequest(i: CanonicalRequestInput): string {
  return [i.method.toUpperCase(), i.pathWithQuery, String(i.timestamp), i.nonce, sha256Hex(i.body ?? '')].join('\n')
}

export type SignedHeaders = {
  'X-Edvora-Connection': string
  'X-Edvora-Timestamp': string
  'X-Edvora-Nonce': string
  'X-Edvora-Signature': string
}

/** Signs a push request (used by tests and any TS client; the PHP plugin implements the same). */
export function signRequest(input: {
  secret: string
  connectionId: string
  method: string
  pathWithQuery: string
  body?: Bytes | null
  timestamp?: number
  nonce?: string
}): SignedHeaders {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)
  const nonce = input.nonce ?? randomBytes(16).toString('hex')
  const signature = hmacHex(input.secret, canonicalRequest({ ...input, timestamp, nonce }))
  return {
    'X-Edvora-Connection': input.connectionId,
    'X-Edvora-Timestamp': String(timestamp),
    'X-Edvora-Nonce': nonce,
    'X-Edvora-Signature': signature,
  }
}

export type HeaderBag = Headers | Readonly<Record<string, string | readonly string[] | undefined>>

function header(h: HeaderBag, name: string): string | null {
  if (typeof (h as Headers).get === 'function') return (h as Headers).get(name)
  const bag = h as Readonly<Record<string, string | readonly string[] | undefined>>
  const key = Object.keys(bag).find((k) => k.toLowerCase() === name)
  const v = key === undefined ? undefined : bag[key]
  if (v === undefined) return null
  return typeof v === 'string' ? v : (v[0] ?? null)
}

export type VerifyFailure = 'missing_header' | 'wrong_connection' | 'bad_timestamp' | 'expired' | 'bad_nonce' | 'bad_signature' | 'replay'
export type VerifyResult = { ok: true; connectionId: string; nonce: string; timestamp: number } | { ok: false; code: VerifyFailure }

/**
 * Verifies a signed push request. Order: headers → timestamp window → signature (constant time) → nonce.
 * The nonce is checked last so an unsigned request cannot burn nonces. `seenNonce(connectionId, nonce)` must
 * atomically record the nonce (≥ `NONCE_TTL_SECONDS`) and return true when it was already recorded.
 */
export async function verifyRequest(input: {
  secret: string
  method: string
  pathWithQuery: string
  body?: Bytes | null
  headers: HeaderBag
  seenNonce: (connectionId: string, nonce: string) => boolean | Promise<boolean>
  /** When set, the connection header must equal it. */
  expectedConnectionId?: string
  nowSeconds?: number
  windowSeconds?: number
}): Promise<VerifyResult> {
  const connectionId = header(input.headers, HEADER_CONNECTION)
  const ts = header(input.headers, HEADER_TIMESTAMP)
  const nonce = header(input.headers, HEADER_NONCE)
  const signature = header(input.headers, HEADER_SIGNATURE)
  if (!connectionId || !ts || !nonce || !signature) return { ok: false, code: 'missing_header' }
  if (input.expectedConnectionId !== undefined && connectionId !== input.expectedConnectionId) return { ok: false, code: 'wrong_connection' }
  if (!/^\d{1,12}$/.test(ts)) return { ok: false, code: 'bad_timestamp' }
  const timestamp = Number(ts)
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > (input.windowSeconds ?? SIGNATURE_WINDOW_SECONDS)) return { ok: false, code: 'expired' }
  if (!/^[0-9a-f]{32}$/.test(nonce)) return { ok: false, code: 'bad_nonce' }
  const expected = hmacHex(input.secret, canonicalRequest({ method: input.method, pathWithQuery: input.pathWithQuery, timestamp: ts, nonce, body: input.body ?? '' }))
  if (!safeEqualHex(expected, signature.toLowerCase())) return { ok: false, code: 'bad_signature' }
  if (await input.seenNonce(connectionId, nonce)) return { ok: false, code: 'replay' }
  return { ok: true, connectionId, nonce, timestamp }
}

/** In-memory nonce store for tests and single-process dev. Production should use the DB (shared by instances). */
export function memoryNonceStore(ttlSeconds = NONCE_TTL_SECONDS, now: () => number = () => Math.floor(Date.now() / 1000)) {
  const seen = new Map<string, number>()
  return (connectionId: string, nonce: string): boolean => {
    const t = now()
    for (const [k, exp] of seen) if (exp <= t) seen.delete(k)
    const key = `${connectionId}:${nonce}`
    if (seen.has(key)) return true
    seen.set(key, t + ttlSeconds)
    return false
  }
}

/** Bundle signature: hex HMAC over the uncompressed bytes of lines 1..n-1 (each with its trailing `\n`). */
export function signBundle(secret: string, signedContent: Bytes): string {
  return hmacHex(secret, signedContent)
}

export function verifyBundle(secret: string, signedContent: Bytes, signatureHex: string): boolean {
  return safeEqualHex(signBundle(secret, signedContent), signatureHex.toLowerCase())
}
