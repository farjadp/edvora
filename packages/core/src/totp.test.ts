import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, generateTotpSecret, hotp, openSecret, otpauthUri, sealSecret, totp, verifyTotp } from './totp'

// RFC 6238 Appendix B, SHA-1, secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('base32', () => {
  it('round-trips and matches RFC 4648', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
    expect(base32Decode('mzxw6ytboi').toString()).toBe('foobar')
    expect(base32Decode('MZXW 6YTB OI======').toString()).toBe('foobar')
    expect(() => base32Decode('MZ1!')).toThrow()
  })
})

describe('HOTP (RFC 4226 Appendix D)', () => {
  it('matches the test vectors', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314']
    expected.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code))
  })
})

describe('TOTP (RFC 6238 Appendix B)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('T=%i → %s', (t, code) => {
    expect(totp(RFC_SECRET, t * 1000, { digits: 8 })).toBe(code)
  })
})

describe('verifyTotp', () => {
  const now = 1_700_000_000_000
  const code = totp(RFC_SECRET, now)
  it('accepts the current code and returns its step', () => {
    expect(verifyTotp(RFC_SECRET, code, { now })).toEqual({ ok: true, step: Math.floor(now / 30_000) })
  })
  it('accepts ±1 step of clock drift, not more', () => {
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 30_000), { now }).ok).toBe(true)
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now + 30_000), { now }).ok).toBe(true)
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 90_000), { now }).ok).toBe(false)
  })
  it('rejects replay of an already used step', () => {
    const step = Math.floor(now / 30_000)
    expect(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: step }).ok).toBe(false)
  })
  it('accepts Persian digits and spaces, rejects junk', () => {
    const fa = code.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)
    expect(verifyTotp(RFC_SECRET, ` ${fa.slice(0, 3)} ${fa.slice(3)} `, { now }).ok).toBe(true)
    expect(verifyTotp(RFC_SECRET, 'abcdef', { now }).ok).toBe(false)
    expect(verifyTotp(RFC_SECRET, '', { now }).ok).toBe(false)
  })
})

describe('secrets', () => {
  it('generates 160-bit base32 secrets', () => {
    const s = generateTotpSecret()
    expect(s).toMatch(/^[A-Z2-7]{32}$/)
    expect(generateTotpSecret()).not.toBe(s)
  })
  it('seals and opens with the same key only', () => {
    const sealed = sealSecret('JBSWY3DPEHPK3PXP', 'server-key')
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP')
    expect(openSecret(sealed, 'server-key')).toBe('JBSWY3DPEHPK3PXP')
    expect(openSecret(sealed, 'other-key')).toBeNull()
    expect(openSecret('garbage', 'server-key')).toBeNull()
  })
  it('builds an otpauth URI for authenticator apps', () => {
    expect(otpauthUri({ issuer: 'Edvora', account: 'a@b.c', secret: 'JBSWY3DPEHPK3PXP' })).toBe(
      'otpauth://totp/Edvora:a%40b.c?secret=JBSWY3DPEHPK3PXP&issuer=Edvora&algorithm=SHA1&digits=6&period=30',
    )
  })
})
