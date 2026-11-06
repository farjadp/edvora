/**
 * Server-only sandbox security helpers (E-029, ADR 010): signed tokens, proof-of-work verification, IP hashing and
 * credential generation. Uses node:crypto, so it is exported from the package root only (never import it in a
 * client component).
 */
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto'
import { safeEqual } from './auth'
import { leadingZeroBits, powMessage } from './sandbox'

const b64 = (s: string) => Buffer.from(s).toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString()
const mac = (body: string, secret: string, purpose: string) => createHmac('sha256', `${purpose}:${secret}`).update(body).digest('base64url')

function sign(payload: object, secret: string, purpose: string): string {
  const body = b64(JSON.stringify(payload))
  return `${body}.${mac(body, secret, purpose)}`
}

function open(token: string | null | undefined, secret: string, purpose: string): unknown {
  if (!token || token.length > 4096) return null
  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return null
  if (!safeEqual(sig, mac(body, secret, purpose))) return null
  try {
    return JSON.parse(unb64(body)) as unknown
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- Tenant selector cookie

export type SandboxSelector = { tid: number; exp: number }

/**
 * The cookie that makes the platform host render one sandbox (ADR 010 routing). Signed with a purpose-bound key,
 * so a student session token can never be replayed as a selector or the other way round.
 */
export const signSandboxSelector = (s: SandboxSelector, secret: string) => sign({ k: 'sbx', tid: s.tid, exp: s.exp }, secret, 'sandbox-selector')

/** `allowExpired` lets the proxy and /demo recognise an ended sandbox (to show the expired state). */
export function verifySandboxSelector(token: string | null | undefined, secret: string, now = Date.now(), allowExpired = false): (SandboxSelector & { expired: boolean }) | null {
  const p = open(token, secret, 'sandbox-selector') as { k?: unknown; tid?: unknown; exp?: unknown } | null
  if (!p || p.k !== 'sbx' || typeof p.tid !== 'number' || !Number.isInteger(p.tid) || typeof p.exp !== 'number') return null
  const expired = p.exp <= now
  if (expired && !allowExpired) return null
  return { tid: p.tid, exp: p.exp, expired }
}

// ---------------------------------------------------------------- Proof of work + time check

export type PowChallenge = { token: string; nonce: string; bits: number; issuedAt: number }

/** A signed challenge, issued when the form renders. Its `iat` is the time check (A2: ≥ minFillMs before submit). */
export function issueChallenge(secret: string, bits: number, now = Date.now()): PowChallenge {
  const nonce = randomBytes(16).toString('base64url')
  return { token: sign({ k: 'pow', n: nonce, b: bits, iat: now }, secret, 'sandbox-pow'), nonce, bits, issuedAt: now }
}

export type ChallengeCheck =
  | { ok: true; nonce: string }
  | { ok: false; reason: 'invalid' | 'too-fast' | 'stale' | 'weak' | 'unsolved' }

/**
 * Verifies a signed challenge + solution. Single use is the caller's job (the nonce is stored on the sandbox record
 * with a unique index, plus an in-process seen-set for cheap rejects).
 */
export function verifyChallenge(
  token: string | null | undefined,
  counter: unknown,
  secret: string,
  opts: { minBits: number; minFillMs: number; ttlMs: number },
  now = Date.now(),
): ChallengeCheck {
  const p = open(token, secret, 'sandbox-pow') as { k?: unknown; n?: unknown; b?: unknown; iat?: unknown } | null
  if (!p || p.k !== 'pow' || typeof p.n !== 'string' || typeof p.b !== 'number' || typeof p.iat !== 'number') return { ok: false, reason: 'invalid' }
  if (p.b < opts.minBits) return { ok: false, reason: 'weak' }
  const age = now - p.iat
  if (age < opts.minFillMs) return { ok: false, reason: 'too-fast' }
  if (age > opts.ttlMs) return { ok: false, reason: 'stale' }
  if (typeof counter !== 'number' || !Number.isSafeInteger(counter) || counter < 0) return { ok: false, reason: 'unsolved' }
  const digest = createHash('sha256').update(powMessage(p.n, counter)).digest()
  if (leadingZeroBits(digest) < p.b) return { ok: false, reason: 'unsolved' }
  return { ok: true, nonce: p.n }
}

/** Reference solver (tests, scripts). The browser uses the same message format in a Web Worker. */
export function solveChallenge(nonce: string, bits: number, maxTries = 50_000_000): number {
  for (let c = 0; c < maxTries; c++) {
    if (leadingZeroBits(createHash('sha256').update(powMessage(nonce, c)).digest()) >= bits) return c
  }
  throw new Error('proof of work not solved')
}

// ---------------------------------------------------------------- Identifiers and credentials

/** Stable, non-reversible IP key for limits and logs (no raw IPs stored). */
export const hashIp = (ip: string | null, secret: string) => createHmac('sha256', `sandbox-ip:${secret}`).update(ip ?? 'unknown').digest('hex').slice(0, 32)

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const PASSWORD_ALPHABETS = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789'] as const

const pick = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[randomInt(0, alphabet.length)]).join('')

/** `sbx-` + 10 random characters. Unguessable enough that a slug is not a way to find other people's sandboxes. */
export const randomSandboxSlug = () => `sbx-${pick(SLUG_ALPHABET, 10)}`

/** Certificate codes are unique across Edvora, so every sandbox gets its own prefix: S + 4 capitals. */
export const randomCertificatePrefix = () => `S${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)}`

/**
 * 3 groups of 4 from an unambiguous alphabet (no 0/O, 1/l/I), e.g. `k7Fq-9mPx-3TzR`: ~68 bits, easy to read and
 * type on a phone. Every group class (lower, upper, digit) appears at least once.
 */
export function generateSandboxPassword(): string {
  const all = PASSWORD_ALPHABETS.join('')
  for (;;) {
    const chars = pick(all, 12)
    if (PASSWORD_ALPHABETS.every((a) => [...chars].some((c) => a.includes(c)))) return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`
  }
}

/** Visitor key in the creator cookie; only its hash is stored on the sandbox record. */
export const randomCreatorKey = () => randomBytes(18).toString('base64url')
export const hashCreatorKey = (key: string) => createHash('sha256').update(`sandbox-creator:${key}`).digest('hex')
