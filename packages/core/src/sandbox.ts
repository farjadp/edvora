/**
 * Self-serve sandbox demo (E-029, ADR 010). Pure rules only: no I/O, no node:crypto, safe for client components
 * via `@edvora/core/sandbox`. Signing, proof-of-work verification and password generation live in
 * `./sandboxSecurity.ts` (server only).
 */
import { z } from 'zod'
import { toPersianDigits } from './digits'

const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** The banner turns to its warning state at or below this. */
export const SANDBOX_WARNING_MS = 15 * MINUTE_MS

/**
 * Tenants that are never treated as sandboxes, whatever their flags say. Cleanup checks this on top of
 * `isSandbox === true` so a mis-set flag on a real academy cannot get it hard-deleted.
 */
export const PROTECTED_TENANT_SLUGS: readonly string[] = ['iba', 'demo']

// ---------------------------------------------------------------- Config

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? fallback : v.trim().toLowerCase() === 'true'))

const int = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return fallback
      const n = Number(v)
      if (!Number.isFinite(n)) return fallback
      return Math.min(max, Math.max(min, Math.floor(n)))
    })

const num = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return fallback
      const n = Number(v)
      if (!Number.isFinite(n)) return fallback
      return Math.min(max, Math.max(min, n))
    })

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  )

const configSchema = z.object({
  SANDBOX_ENABLED: bool(false),
  SANDBOX_TTL_HOURS: num(3, 0.05, 72),
  SANDBOX_MAX_ACTIVE: int(20, 0, 1000),
  SANDBOX_GRACE_HOURS: num(24, 0, 24 * 30),
  SANDBOX_IP_DAILY_MAX: int(3, 0, 1000),
  SANDBOX_IP_ACTIVE_MAX: int(1, 0, 1000),
  SANDBOX_UPLOAD_MB: num(5, 0, 1024),
  SANDBOX_REQUESTS_PER_MINUTE: int(10, 1, 10_000),
  SANDBOX_POW_BITS: int(14, 0, 24),
  SANDBOX_MIN_FILL_MS: int(3000, 0, 60_000),
  SANDBOX_CHALLENGE_TTL_MINUTES: int(15, 1, 24 * 60),
  SANDBOX_TRUSTED_PROXY_HOPS: int(1, 0, 10),
  SANDBOX_PLATFORM_HOSTS: list,
  SANDBOX_E2E_HOOKS: bool(false),
})

export type SandboxConfig = {
  enabled: boolean
  ttlHours: number
  maxActive: number
  graceHours: number
  ipDailyMax: number
  ipActiveMax: number
  uploadBytes: number
  requestsPerMinute: number
  powBits: number
  minFillMs: number
  challengeTtlMs: number
  trustedProxyHops: number
  /** Hosts (no port, lowercase) that serve /demo and honour the sandbox cookie. Empty = the site URL's host. */
  platformHosts: string[]
  /** Test-only routes (simulate expiry). Off unless explicitly enabled. */
  e2eHooks: boolean
}

/**
 * Reads the SANDBOX_* variables with safe defaults. Never throws: an unparsable value falls back to its default and
 * out-of-range numbers are clamped, so a typo in an env var cannot take the site down or open the floodgates.
 * The kill switch defaults to off.
 */
export function parseSandboxConfig(env: Record<string, string | undefined>, siteUrl?: string): SandboxConfig {
  const e = configSchema.parse({
    SANDBOX_ENABLED: env.SANDBOX_ENABLED,
    SANDBOX_TTL_HOURS: env.SANDBOX_TTL_HOURS,
    SANDBOX_MAX_ACTIVE: env.SANDBOX_MAX_ACTIVE,
    SANDBOX_GRACE_HOURS: env.SANDBOX_GRACE_HOURS,
    SANDBOX_IP_DAILY_MAX: env.SANDBOX_IP_DAILY_MAX,
    SANDBOX_IP_ACTIVE_MAX: env.SANDBOX_IP_ACTIVE_MAX,
    SANDBOX_UPLOAD_MB: env.SANDBOX_UPLOAD_MB,
    SANDBOX_REQUESTS_PER_MINUTE: env.SANDBOX_REQUESTS_PER_MINUTE,
    SANDBOX_POW_BITS: env.SANDBOX_POW_BITS,
    SANDBOX_MIN_FILL_MS: env.SANDBOX_MIN_FILL_MS,
    SANDBOX_CHALLENGE_TTL_MINUTES: env.SANDBOX_CHALLENGE_TTL_MINUTES,
    SANDBOX_TRUSTED_PROXY_HOPS: env.SANDBOX_TRUSTED_PROXY_HOPS,
    SANDBOX_PLATFORM_HOSTS: env.SANDBOX_PLATFORM_HOSTS,
    SANDBOX_E2E_HOOKS: env.SANDBOX_E2E_HOOKS,
  })
  let platformHosts = e.SANDBOX_PLATFORM_HOSTS.map(stripPort)
  if (platformHosts.length === 0 && siteUrl) {
    try {
      platformHosts = [stripPort(new URL(siteUrl).host.toLowerCase())]
    } catch {
      platformHosts = []
    }
  }
  return {
    enabled: e.SANDBOX_ENABLED,
    ttlHours: e.SANDBOX_TTL_HOURS,
    maxActive: e.SANDBOX_MAX_ACTIVE,
    graceHours: e.SANDBOX_GRACE_HOURS,
    ipDailyMax: e.SANDBOX_IP_DAILY_MAX,
    ipActiveMax: e.SANDBOX_IP_ACTIVE_MAX,
    uploadBytes: Math.floor(e.SANDBOX_UPLOAD_MB * 1024 * 1024),
    requestsPerMinute: e.SANDBOX_REQUESTS_PER_MINUTE,
    powBits: e.SANDBOX_POW_BITS,
    minFillMs: e.SANDBOX_MIN_FILL_MS,
    challengeTtlMs: e.SANDBOX_CHALLENGE_TTL_MINUTES * MINUTE_MS,
    trustedProxyHops: e.SANDBOX_TRUSTED_PROXY_HOPS,
    platformHosts,
    e2eHooks: e.SANDBOX_E2E_HOOKS,
  }
}

const stripPort = (host: string) => host.split(':')[0]!.replace(/^www\./, '')

export function isPlatformHost(host: string, cfg: Pick<SandboxConfig, 'platformHosts'>): boolean {
  const h = stripPort(host.toLowerCase())
  return h !== '' && cfg.platformHosts.includes(h)
}

// ---------------------------------------------------------------- Time

/** TTL is fixed at creation (no extension, Farjad default pending): changing the env only affects new sandboxes. */
export function sandboxExpiresAt(createdAt: Date, ttlHours: number): Date {
  return new Date(createdAt.getTime() + Math.round(ttlHours * HOUR_MS))
}

/** When cleanup may hard-delete it: expiry + grace. */
export function sandboxPurgeAt(expiresAt: Date, graceHours: number): Date {
  return new Date(expiresAt.getTime() + Math.round(graceHours * HOUR_MS))
}

const toTime = (v: Date | string | null | undefined): number => {
  if (v === null || v === undefined || v === '') return NaN
  return (v instanceof Date ? v : new Date(v)).getTime()
}

export type SandboxFlags = { isSandbox?: boolean | null; expiresAt?: Date | string | null }

/**
 * `none` = a real academy. A sandbox without a valid expiry counts as expired (fail closed).
 * The server clock decides; the browser countdown is display only.
 */
export function sandboxState(t: SandboxFlags, now: Date = new Date()): 'none' | 'active' | 'expired' {
  if (t.isSandbox !== true) return 'none'
  const exp = toTime(t.expiresAt)
  if (!Number.isFinite(exp)) return 'expired'
  return now.getTime() < exp ? 'active' : 'expired'
}

export const isSandboxExpired = (t: SandboxFlags, now: Date = new Date()) => sandboxState(t, now) === 'expired'

export function remainingMs(expiresAt: Date | string | null | undefined, now: Date = new Date()): number {
  const exp = toTime(expiresAt)
  return Number.isFinite(exp) ? Math.max(0, exp - now.getTime()) : 0
}

/** A membership in a sandbox never outlives the sandbox: missing or later expiry → the sandbox's. */
export function clampMembershipExpiry(requested: Date | string | null | undefined, sandboxExpiresAt: Date | string): string {
  const cap = toTime(sandboxExpiresAt)
  const want = toTime(requested)
  const t = Number.isFinite(want) && want < cap ? want : cap
  return new Date(t).toISOString()
}

// ---------------------------------------------------------------- Cleanup selection

export type PurgeCandidate = {
  id: number
  slug?: string | null
  isSandbox?: boolean | null
  expiresAt?: Date | string | null
  purgeAt?: Date | string | null
}

const eligible = (t: PurgeCandidate) => t.isSandbox === true && !PROTECTED_TENANT_SLUGS.includes((t.slug ?? '').toLowerCase())

/**
 * Tenants the cleanup job may hard-delete: `isSandbox === true` (strictly), not a protected slug, and past
 * `purgeAt` (or `expiresAt + grace` when purgeAt is missing). Never anything else — a real academy with an
 * `expiresAt` or a slug that starts with "sandbox" is not selected.
 */
export function selectForPurge(tenants: readonly PurgeCandidate[], now: Date, graceHours: number): number[] {
  return tenants
    .filter((t) => {
      if (!eligible(t)) return false
      const purge = toTime(t.purgeAt)
      if (Number.isFinite(purge)) return purge <= now.getTime()
      const exp = toTime(t.expiresAt)
      if (!Number.isFinite(exp)) return false // no dates at all: leave it for a human, never guess
      return sandboxPurgeAt(new Date(exp), graceHours).getTime() <= now.getTime()
    })
    .map((t) => t.id)
}

/** Expired sandboxes still inside their grace period: their accounts get suspended and sessions cleared. */
export function selectForRevoke(tenants: readonly PurgeCandidate[], now: Date): number[] {
  return tenants.filter((t) => eligible(t) && sandboxState(t, now) === 'expired').map((t) => t.id)
}

// ---------------------------------------------------------------- Limits

export type CreationInput = {
  enabled: boolean
  /** Sandboxes reserved or active and not yet expired. */
  activeCount: number
  maxActive: number
  /** Sandboxes created from this IP (hash) in the last 24 h, failed attempts excluded. */
  ipCount24h: number
  ipDailyMax: number
  /** Not-yet-expired sandboxes from this IP. */
  ipActiveCount: number
  ipActiveMax: number
  /** Soonest expiry among active sandboxes (for the "full" copy). */
  soonestExpiry?: Date | string | null
}

export type CreationDecision =
  | { ok: true }
  | { ok: false; reason: 'disabled' }
  | { ok: false; reason: 'rate-limited' }
  | { ok: false; reason: 'full'; nextFreeAt: string | null }

/**
 * Must be evaluated inside the DB lock that also inserts the reservation (see lib/sandbox/limits.ts), otherwise
 * concurrent requests can all see `activeCount = max − 1` and overshoot.
 */
export function decideCreation(i: CreationInput): CreationDecision {
  if (!i.enabled) return { ok: false, reason: 'disabled' }
  if (i.ipCount24h >= i.ipDailyMax || i.ipActiveCount >= i.ipActiveMax) return { ok: false, reason: 'rate-limited' }
  if (i.activeCount >= i.maxActive) {
    const t = toTime(i.soonestExpiry)
    return { ok: false, reason: 'full', nextFreeAt: Number.isFinite(t) ? new Date(t).toISOString() : null }
  }
  return { ok: true }
}

/**
 * Client IP behind `hops` trusted reverse proxies. Each proxy appends the address it received the request from to
 * X-Forwarded-For, so the client is the `hops`-th entry from the right; anything left of it is client-supplied and
 * ignored (A4: spoofed X-Forwarded-For does not move the limiter). `hops = 0` = no proxy: only X-Real-IP is used
 * when present, else null (callers bucket nulls together, which fails closed).
 */
export function clientIpFrom(xff: string | null | undefined, realIp: string | null | undefined, hops: number): string | null {
  const valid = (s: string | undefined) => (s && /^[0-9a-f:.]{2,45}$/i.test(s) ? s.toLowerCase() : null)
  if (hops <= 0) return valid(realIp?.trim())
  const parts = (xff ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  // Fewer entries than trusted hops: the chain is not what we expect, so nothing in it is trustworthy.
  if (parts.length < hops) return valid(realIp?.trim())
  return valid(parts[parts.length - hops])
}

/** Fixed-size sliding window per key (A3: requests per minute). In-process; the daily cap lives in the DB. */
export class RateWindow {
  private hits = new Map<string, number[]>()
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Records a hit; false = over the limit (do not serve). */
  hit(key: string, now: number = Date.now()): boolean {
    const from = now - this.windowMs
    const list = (this.hits.get(key) ?? []).filter((t) => t > from)
    const allowed = list.length < this.limit
    if (allowed) list.push(now)
    this.hits.delete(key)
    this.hits.set(key, list)
    if (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value
      if (oldest !== undefined) this.hits.delete(oldest)
    }
    return allowed
  }
}

// ---------------------------------------------------------------- Proof of work (shared by worker and server)

export { leadingZeroBits, powMessage } from './pow'

// ---------------------------------------------------------------- Display

/** «۲ ساعت و ۴۱ دقیقه», «۴۰ دقیقه», «کمتر از ۱ دقیقه». Rounds minutes up so it never reads 0 while time is left. */
export function formatRemainingFa(ms: number): string {
  if (ms <= 0) return '۰ دقیقه'
  const totalMin = Math.ceil(ms / MINUTE_MS)
  if (ms < MINUTE_MS) return 'کمتر از ۱ دقیقه'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${toPersianDigits(m)} دقیقه`
  if (m === 0) return `${toPersianDigits(h)} ساعت`
  return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`
}

export function countdownTone(ms: number): 'normal' | 'warning' | 'over' {
  if (ms <= 0) return 'over'
  return ms <= SANDBOX_WARNING_MS ? 'warning' : 'normal'
}
