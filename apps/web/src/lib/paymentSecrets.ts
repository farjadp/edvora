import { openSecret, sealSecret } from '@edvora/core'

/**
 * Gateway credentials at rest (ADR 017 §4): AES-256-GCM via `sealSecret`, keyed from PAYMENT_SECRETS_KEY (set a
 * dedicated one in production) or PAYLOAD_SECRET. Only server code opens them; they are never sent to a browser.
 */
export const CREDENTIAL_KEYS = ['merchantId', 'terminalId', 'username', 'password', 'apiKey'] as const
export type CredentialKey = (typeof CREDENTIAL_KEYS)[number]
export type Credentials = Partial<Record<CredentialKey, string>>

const key = (): string => {
  const k = process.env.PAYMENT_SECRETS_KEY?.trim() || process.env.PAYLOAD_SECRET || ''
  if (k.length < 8) throw new Error('PAYMENT_SECRETS_KEY / PAYLOAD_SECRET is not configured')
  return `payments:${k}`
}

export function sealCredentials(c: Credentials): string {
  const clean = Object.fromEntries(CREDENTIAL_KEYS.filter((k) => c[k]).map((k) => [k, c[k]]))
  return sealSecret(JSON.stringify(clean), key())
}

/** The stored credentials, or null when there are none or the sealed value does not open (wrong key, tampered). */
export function openCredentials(sealed: string | null | undefined): Credentials | null {
  if (!sealed) return null
  const plain = openSecret(sealed, key())
  if (!plain) return null
  try {
    const obj = JSON.parse(plain) as Record<string, unknown>
    return Object.fromEntries(CREDENTIAL_KEYS.filter((k) => typeof obj[k] === 'string').map((k) => [k, obj[k] as string]))
  } catch {
    return null
  }
}
