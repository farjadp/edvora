import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  RateWindow,
  clampMembershipExpiry,
  clientIpFrom,
  countdownTone,
  decideCreation,
  formatRemainingFa,
  isPlatformHost,
  leadingZeroBits,
  mockGatewayAllowed,
  parseSandboxConfig,
  remainingMs,
  sandboxExpiresAt,
  sandboxPurgeAt,
  sandboxState,
  selectForPurge,
  selectForRevoke,
  type CreationInput,
  type PurgeCandidate,
} from './sandbox'
import {
  generateSandboxPassword,
  hashCreatorKey,
  hashIp,
  issueChallenge,
  randomCertificatePrefix,
  randomSandboxSlug,
  signSandboxSelector,
  solveChallenge,
  verifyChallenge,
  verifySandboxSelector,
} from './sandboxSecurity'
import { signSession } from './auth'

const H = 60 * 60 * 1000
const SECRET = 'test-secret-123'

describe('parseSandboxConfig', () => {
  it('defaults: off, 3 h, 20 active, 24 h grace, 3/IP/day, 1 active per IP, 5 MB', () => {
    const c = parseSandboxConfig({}, 'https://web-production-39ee1.up.railway.app')
    expect(c).toMatchObject({ enabled: false, ttlHours: 3, maxActive: 20, graceHours: 24, ipDailyMax: 3, ipActiveMax: 1, requestsPerMinute: 10, trustedProxyHops: 1, e2eHooks: false })
    expect(c.uploadBytes).toBe(5 * 1024 * 1024)
    expect(c.platformHosts).toEqual(['web-production-39ee1.up.railway.app'])
  })

  it('reads values, clamps out-of-range numbers and ignores junk', () => {
    const c = parseSandboxConfig({ SANDBOX_ENABLED: 'TRUE', SANDBOX_TTL_HOURS: '1.5', SANDBOX_MAX_ACTIVE: '-4', SANDBOX_IP_DAILY_MAX: 'abc', SANDBOX_POW_BITS: '99' })
    expect(c.enabled).toBe(true)
    expect(c.ttlHours).toBe(1.5)
    expect(c.maxActive).toBe(0)
    expect(c.ipDailyMax).toBe(3)
    expect(c.powBits).toBe(24)
  })

  it('only the literal "true" turns the kill switch on', () => {
    expect(parseSandboxConfig({ SANDBOX_ENABLED: '1' }).enabled).toBe(false)
    expect(parseSandboxConfig({ SANDBOX_ENABLED: 'yes' }).enabled).toBe(false)
    expect(parseSandboxConfig({ SANDBOX_E2E_HOOKS: 'false' }).e2eHooks).toBe(false)
  })

  it('platform hosts: explicit list wins, ports and www. stripped', () => {
    const c = parseSandboxConfig({ SANDBOX_PLATFORM_HOSTS: 'Demo.Edvora.ir:443, www.edvora.ir' }, 'http://localhost:3000')
    expect(c.platformHosts).toEqual(['demo.edvora.ir', 'edvora.ir'])
    expect(isPlatformHost('demo.edvora.ir:3000', c)).toBe(true)
    expect(isPlatformHost('iranbrandacademy.com', c)).toBe(false)
    expect(isPlatformHost('', c)).toBe(false)
  })
})

describe('expiry math', () => {
  const created = new Date('2026-11-06T10:00:00.000Z')
  it('expires after TTL and purges after grace', () => {
    const exp = sandboxExpiresAt(created, 3)
    expect(exp.toISOString()).toBe('2026-11-06T13:00:00.000Z')
    expect(sandboxPurgeAt(exp, 24).toISOString()).toBe('2026-11-07T13:00:00.000Z')
  })

  it('state flips exactly at expiresAt (now ≥ expiresAt is expired)', () => {
    const t = { isSandbox: true, expiresAt: '2026-11-06T13:00:00.000Z' }
    expect(sandboxState(t, new Date('2026-11-06T12:59:59.999Z'))).toBe('active')
    expect(sandboxState(t, new Date('2026-11-06T13:00:00.000Z'))).toBe('expired')
  })

  it('real academies are never sandboxes, even with an expiresAt', () => {
    expect(sandboxState({ isSandbox: false, expiresAt: '2000-01-01T00:00:00Z' })).toBe('none')
    expect(sandboxState({ expiresAt: '2000-01-01T00:00:00Z' })).toBe('none')
  })

  it('a sandbox with no or broken expiry fails closed', () => {
    expect(sandboxState({ isSandbox: true, expiresAt: null })).toBe('expired')
    expect(sandboxState({ isSandbox: true, expiresAt: 'not a date' })).toBe('expired')
  })

  it('remainingMs never goes negative', () => {
    expect(remainingMs('2026-11-06T13:00:00.000Z', new Date('2026-11-06T14:00:00.000Z'))).toBe(0)
    expect(remainingMs('2026-11-06T13:00:00.000Z', new Date('2026-11-06T12:00:00.000Z'))).toBe(H)
    expect(remainingMs(null)).toBe(0)
  })

  it('membership expiry is clamped to the sandbox expiry (E3, S5)', () => {
    const cap = '2026-11-06T13:00:00.000Z'
    expect(clampMembershipExpiry(null, cap)).toBe(cap)
    expect(clampMembershipExpiry('2027-01-01T00:00:00.000Z', cap)).toBe(cap)
    expect(clampMembershipExpiry('2026-11-06T12:00:00.000Z', cap)).toBe('2026-11-06T12:00:00.000Z')
    expect(clampMembershipExpiry('garbage', cap)).toBe(cap)
  })
})

describe('cleanup selection (E4, E5)', () => {
  const now = new Date('2026-11-08T00:00:00.000Z')
  const longAgo = '2026-11-01T00:00:00.000Z'
  const tenants: PurgeCandidate[] = [
    { id: 1, slug: 'iba', isSandbox: false, expiresAt: longAgo, purgeAt: longAgo },
    { id: 2, slug: 'demo', isSandbox: false, expiresAt: longAgo },
    { id: 3, slug: 'sandbox-looking', isSandbox: false, expiresAt: longAgo, purgeAt: longAgo },
    { id: 4, slug: 'sbx-real-flagless', expiresAt: longAgo, purgeAt: longAgo },
    { id: 5, slug: 'sbx-due', isSandbox: true, expiresAt: longAgo, purgeAt: '2026-11-02T00:00:00.000Z' },
    { id: 6, slug: 'sbx-in-grace', isSandbox: true, expiresAt: '2026-11-07T12:00:00.000Z', purgeAt: '2026-11-08T12:00:00.000Z' },
    { id: 7, slug: 'sbx-active', isSandbox: true, expiresAt: '2026-11-08T02:00:00.000Z', purgeAt: '2026-11-09T02:00:00.000Z' },
    { id: 8, slug: 'sbx-no-purge-date', isSandbox: true, expiresAt: '2026-11-06T00:00:00.000Z' },
    { id: 9, slug: 'sbx-no-dates', isSandbox: true },
    // A protected slug is never selected, even with the sandbox flag set by mistake.
    { id: 10, slug: 'IBA', isSandbox: true, expiresAt: longAgo, purgeAt: longAgo },
    { id: 11, slug: 'demo', isSandbox: true, expiresAt: longAgo, purgeAt: longAgo },
  ]

  it('selects only isSandbox === true tenants past purgeAt (or expiry + grace)', () => {
    expect(selectForPurge(tenants, now, 24)).toEqual([5, 8])
  })

  it('never selects iba, demo or any non-sandbox tenant, whatever their dates or slug', () => {
    const picked = selectForPurge(tenants, new Date('2100-01-01T00:00:00.000Z'), 0)
    expect(picked).not.toContain(1)
    expect(picked).not.toContain(2)
    expect(picked).not.toContain(3)
    expect(picked).not.toContain(4)
    expect(picked).not.toContain(10)
    expect(picked).not.toContain(11)
  })

  it('"delete now" = purgeAt set to now', () => {
    const t: PurgeCandidate[] = [{ id: 7, slug: 'sbx-active', isSandbox: true, expiresAt: '2026-11-08T02:00:00.000Z', purgeAt: now.toISOString() }]
    expect(selectForPurge(t, now, 24)).toEqual([7])
  })

  it('revocation sweep picks expired sandboxes only', () => {
    expect(selectForRevoke(tenants, now)).toEqual([5, 6, 8, 9])
  })
})

describe('decideCreation (cap, per-IP limits, kill switch)', () => {
  const base: CreationInput = { enabled: true, activeCount: 0, maxActive: 20, ipCount24h: 0, ipDailyMax: 3, ipActiveCount: 0, ipActiveMax: 1 }

  it('allows when under every limit', () => expect(decideCreation(base)).toEqual({ ok: true }))
  it('kill switch wins', () => expect(decideCreation({ ...base, enabled: false })).toEqual({ ok: false, reason: 'disabled' }))
  it('daily IP cap (V11)', () => expect(decideCreation({ ...base, ipCount24h: 3 })).toEqual({ ok: false, reason: 'rate-limited' }))
  it('one live sandbox per IP (C3)', () => expect(decideCreation({ ...base, ipActiveCount: 1 })).toEqual({ ok: false, reason: 'rate-limited' }))
  it('full with the soonest free slot (F1)', () =>
    expect(decideCreation({ ...base, activeCount: 20, soonestExpiry: '2026-11-06T13:00:00.000Z' })).toEqual({ ok: false, reason: 'full', nextFreeAt: '2026-11-06T13:00:00.000Z' }))
  it('max 0 = always full', () => expect(decideCreation({ ...base, maxActive: 0 })).toMatchObject({ reason: 'full' }))

  it('serialised reservations never overshoot the cap (what the DB advisory lock guarantees)', async () => {
    // 20 concurrent submits at cap − 1: each runs check + reserve as one critical section.
    let active = 19
    let lock = Promise.resolve()
    const reserve = () => {
      const run = lock.then(async () => {
        const d = decideCreation({ ...base, activeCount: active })
        await new Promise((r) => setTimeout(r, 1))
        if (d.ok) active++
        return d.ok
      })
      lock = run.then(() => undefined)
      return run
    }
    const results = await Promise.all(Array.from({ length: 20 }, reserve))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(active).toBe(20)
  })
})

describe('clientIpFrom (trusted proxy hop, A4)', () => {
  it('takes the hops-th entry from the right and ignores spoofed entries to its left', () => {
    expect(clientIpFrom('6.6.6.6, 203.0.113.9', null, 1)).toBe('203.0.113.9')
    expect(clientIpFrom('1.1.1.1, 6.6.6.6, 203.0.113.9, 10.0.0.2', null, 2)).toBe('203.0.113.9')
  })
  it('falls back to X-Real-IP only when the chain is shorter than the trusted hops', () => {
    expect(clientIpFrom('', '198.51.100.4', 1)).toBe('198.51.100.4')
    expect(clientIpFrom('6.6.6.6', null, 2)).toBeNull()
  })
  it('hops = 0 trusts no header except X-Real-IP', () => {
    expect(clientIpFrom('6.6.6.6', null, 0)).toBeNull()
    expect(clientIpFrom('6.6.6.6', '198.51.100.4', 0)).toBe('198.51.100.4')
  })
  it('rejects junk values', () => expect(clientIpFrom('<script>', null, 1)).toBeNull())
})

describe('RateWindow (A3)', () => {
  it('allows N per window, then blocks, then recovers', () => {
    const w = new RateWindow(3, 60_000)
    expect([w.hit('a', 0), w.hit('a', 1), w.hit('a', 2), w.hit('a', 3)]).toEqual([true, true, true, false])
    expect(w.hit('b', 3)).toBe(true)
    expect(w.hit('a', 60_001)).toBe(true)
  })
  it('bounds memory', () => {
    const w = new RateWindow(1, 60_000, 2)
    w.hit('a', 0)
    w.hit('b', 0)
    w.hit('c', 0)
    expect(w.hit('a', 1)).toBe(true) // 'a' was evicted
  })
})

describe('proof of work + time check (A2)', () => {
  const opts = { minBits: 8, minFillMs: 3000, ttlMs: 15 * 60_000 }
  const t0 = 1_800_000_000_000

  it('leadingZeroBits', () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 0x0f]))).toBe(20)
    expect(leadingZeroBits(new Uint8Array([0x80]))).toBe(0)
    expect(leadingZeroBits(new Uint8Array([0, 0]))).toBe(16)
  })

  it('accepts a solved, signed, unexpired challenge submitted after the minimum fill time', () => {
    const ch = issueChallenge(SECRET, 8, t0)
    const counter = solveChallenge(ch.nonce, 8)
    const digest = createHash('sha256').update(`${ch.nonce}:${counter}`).digest()
    expect(leadingZeroBits(digest)).toBeGreaterThanOrEqual(8)
    expect(verifyChallenge(ch.token, counter, SECRET, opts, t0 + 3000)).toEqual({ ok: true, nonce: ch.nonce })
  })

  it('rejects too fast, stale, wrong solution, forged or weakened tokens', () => {
    const ch = issueChallenge(SECRET, 8, t0)
    const counter = solveChallenge(ch.nonce, 8)
    expect(verifyChallenge(ch.token, counter, SECRET, opts, t0 + 2999)).toEqual({ ok: false, reason: 'too-fast' })
    expect(verifyChallenge(ch.token, counter, SECRET, opts, t0 + 15 * 60_000 + 1)).toEqual({ ok: false, reason: 'stale' })
    expect(verifyChallenge(ch.token, 'x', SECRET, opts, t0 + 5000)).toEqual({ ok: false, reason: 'unsolved' })
    expect(verifyChallenge(ch.token, counter, 'other-secret', opts, t0 + 5000)).toEqual({ ok: false, reason: 'invalid' })
    expect(verifyChallenge(`${ch.token}x`, counter, SECRET, opts, t0 + 5000)).toEqual({ ok: false, reason: 'invalid' })
    const weak = issueChallenge(SECRET, 2, t0)
    expect(verifyChallenge(weak.token, solveChallenge(weak.nonce, 2), SECRET, opts, t0 + 5000)).toEqual({ ok: false, reason: 'weak' })
    expect(verifyChallenge(null, 0, SECRET, opts, t0)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('finds a wrong counter unsolved (most counters fail at 8 bits)', () => {
    const ch = issueChallenge(SECRET, 8, t0)
    const good = solveChallenge(ch.nonce, 8)
    let bad = 0
    for (let c = 0; c < good; c++) if (!verifyChallenge(ch.token, c, SECRET, opts, t0 + 5000).ok) bad++
    expect(bad).toBe(good)
  })
})

describe('selector cookie', () => {
  it('round-trips and rejects other tokens', () => {
    const tok = signSandboxSelector({ tid: 42, exp: 2000 }, SECRET)
    expect(verifySandboxSelector(tok, SECRET, 1000)).toEqual({ tid: 42, exp: 2000, expired: false })
    expect(verifySandboxSelector(tok, SECRET, 2000)).toBeNull()
    expect(verifySandboxSelector(tok, SECRET, 2000, true)).toEqual({ tid: 42, exp: 2000, expired: true })
    expect(verifySandboxSelector(tok, 'nope', 1000)).toBeNull()
    // A student session token signed with the same secret is not a selector.
    expect(verifySandboxSelector(signSession({ uid: 1, tid: 42, exp: 2000 }, SECRET), SECRET, 1000)).toBeNull()
  })
})

describe('credentials and identifiers', () => {
  it('passwords: 3×4 groups, every class, no ambiguous characters, unique', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const p = generateSandboxPassword()
      expect(p).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/)
      expect(p).not.toMatch(/[01OIl]/)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[2-9]/)
      seen.add(p)
    }
    expect(seen.size).toBe(200)
  })

  it('slug, certificate prefix (valid tenant prefix) and hashes', () => {
    expect(randomSandboxSlug()).toMatch(/^sbx-[a-z2-9]{10}$/)
    expect(randomCertificatePrefix()).toMatch(/^S[A-Z]{4}$/)
    expect(hashIp('203.0.113.9', SECRET)).toHaveLength(32)
    expect(hashIp('203.0.113.9', SECRET)).not.toBe(hashIp('203.0.113.10', SECRET))
    expect(hashIp(null, SECRET)).toBe(hashIp(null, SECRET))
    expect(hashCreatorKey('a')).not.toBe(hashCreatorKey('b'))
  })
})

describe('display', () => {
  it('formats remaining time in Persian', () => {
    expect(formatRemainingFa(2 * H + 41 * 60_000)).toBe('۲ ساعت و ۴۱ دقیقه')
    expect(formatRemainingFa(3 * H)).toBe('۳ ساعت')
    expect(formatRemainingFa(40 * 60_000)).toBe('۴۰ دقیقه')
    expect(formatRemainingFa(30_000)).toBe('کمتر از ۱ دقیقه')
    expect(formatRemainingFa(0)).toBe('۰ دقیقه')
  })
  it('tone: warning at ≤ 15 minutes', () => {
    expect(countdownTone(16 * 60_000)).toBe('normal')
    expect(countdownTone(15 * 60_000)).toBe('warning')
    expect(countdownTone(0)).toBe('over')
  })
})

describe('mockGatewayAllowed (BUG-1)', () => {
  it('open on a mock instance, and for sandboxes on a real-gateway instance', () => {
    expect(mockGatewayAllowed('mock', { isSandbox: false })).toBe(true)
    expect(mockGatewayAllowed(undefined, {})).toBe(true)
    expect(mockGatewayAllowed('zarinpal', { isSandbox: true, expiresAt: '2099-01-01T00:00:00Z' })).toBe(true)
  })
  it('closed for a real academy on a real gateway', () => {
    expect(mockGatewayAllowed('zarinpal', { isSandbox: false })).toBe(false)
    expect(mockGatewayAllowed('zarinpal', {})).toBe(false)
  })
})
