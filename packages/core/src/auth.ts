import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/** Numeric one-time code for SMS login. */
export function generateOtp(length = 5): string {
  if (length < 4 || length > 8) throw new RangeError('OTP length must be 4–8')
  return Array.from({ length }, () => randomInt(0, 10)).join('')
}

/** OTPs are never stored in plain text. */
export function hashOtp(code: string, phone: string, secret: string): string {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export type SessionPayload = { uid: string | number; tid?: string | number; exp: number }

const b64 = (s: string) => Buffer.from(s).toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString()

/** Minimal signed session token: base64url(json).hmac */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = b64(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifySession(token: string | undefined | null, secret: string, now = Date.now()): SessionPayload | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  if (!safeEqual(sig, expected)) return null
  try {
    const payload = JSON.parse(unb64(body)) as SessionPayload
    if (typeof payload.exp !== 'number' || payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}
