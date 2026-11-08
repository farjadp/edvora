/**
 * Write-only API keys at rest (ADR 018 §3): AES-256-GCM, key derived with scrypt from a server secret.
 * Format: `v1.<salt>.<iv>.<tag>.<ciphertext>` (base64url). Server code only.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const b64 = (b: Buffer) => b.toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url')

function keyFrom(secret: string, salt: Buffer): Buffer {
  if (!secret || secret.length < 8) throw new Error('AI secrets key is not configured')
  return scryptSync(`ai-key:${secret}`, salt, 32)
}

export function sealAiKey(plain: string, secret: string): string {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret, salt), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', b64(salt), b64(iv), b64(cipher.getAuthTag()), b64(enc)].join('.')
}

/** The plain key, or null when the value is missing, tampered with or sealed with another secret. */
export function openAiKey(sealed: string | null | undefined, secret: string): string | null {
  if (!sealed) return null
  const parts = sealed.split('.')
  if (parts.length !== 5 || parts[0] !== 'v1') return null
  try {
    const [, salt, iv, tag, enc] = parts as [string, string, string, string, string]
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret, unb64(salt)), unb64(iv))
    decipher.setAuthTag(unb64(tag))
    return Buffer.concat([decipher.update(unb64(enc)), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** What the UI may show about a stored key: never the key, only its last four characters. */
export function keyHint(plain: string | null): string | null {
  if (!plain) return null
  return plain.length <= 8 ? '••••' : `••••${plain.slice(-4)}`
}
