/**
 * Staff second factor: TOTP (RFC 6238 over RFC 4226 HOTP), self-hosted with node:crypto.
 * Works with any authenticator app offline; nothing calls an outside service.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { safeEqual } from './auth'
import { toLatinDigits } from './digits'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) throw new RangeError('Invalid base32 character')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** 160-bit random secret, base32 (what authenticator apps expect). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function hotp(secretBase32: string, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest()
  const offset = mac[mac.length - 1]! & 0x0f
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export type TotpOptions = { digits?: number; periodSeconds?: number }

export const totpStep = (nowMs: number, periodSeconds = 30) => Math.floor(nowMs / 1000 / periodSeconds)

export function totp(secretBase32: string, nowMs: number = Date.now(), opts: TotpOptions = {}): string {
  return hotp(secretBase32, totpStep(nowMs, opts.periodSeconds), opts.digits ?? 6)
}

/**
 * Accepts ±`window` steps of clock drift. Returns the matched step so the caller can store it:
 * a step at or below `lastUsedStep` is refused (no replay of a code already used).
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: TotpOptions & { now?: number; window?: number; lastUsedStep?: number | null } = {},
): { ok: true; step: number } | { ok: false } {
  const digits = opts.digits ?? 6
  const clean = toLatinDigits(code).replace(/\s/g, '')
  if (!new RegExp(`^\\d{${digits}}$`).test(clean)) return { ok: false }
  const current = totpStep(opts.now ?? Date.now(), opts.periodSeconds)
  const window = opts.window ?? 1
  for (let d = -window; d <= window; d++) {
    const step = current + d
    if (opts.lastUsedStep != null && step <= opts.lastUsedStep) continue
    if (safeEqual(hotp(secretBase32, step, digits), clean)) return { ok: true, step }
  }
  return { ok: false }
}

export function otpauthUri(input: { issuer: string; account: string; secret: string }): string {
  const issuer = encodeURIComponent(input.issuer)
  return `otpauth://totp/${issuer}:${encodeURIComponent(input.account)}?secret=${input.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
}

// ---------------------------------------------------------------- Secret at rest

const keyFrom = (serverSecret: string) => createHash('sha256').update(`edvora:totp:${serverSecret}`).digest()

/** AES-256-GCM: `v1.iv.tag.ciphertext` (base64url). The TOTP secret never sits in the DB in plain text. */
export function sealSecret(plain: string, serverSecret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(serverSecret), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.')
}

export function openSecret(sealed: string, serverSecret: string): string | null {
  const [v, iv, tag, enc] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !enc) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(serverSecret), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(enc, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
