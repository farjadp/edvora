/**
 * Connection secrets (ADR 011 §Token security): 32 random bytes (base64url, 43 chars) shown once; stored as a
 * sha256 hash plus an AES-256-GCM sealed copy keyed from PAYLOAD_SECRET (same helper as TOTP secrets).
 */
import { openSecret, sealSecret } from '@edvora/core'
import { sha256Hex } from '@edvora/integrations/wordpress'
import { randomBytes } from 'node:crypto'

export const CONNECTION_TTL_HOURS = 72

const serverSecret = (): string => {
  const s = process.env.PAYLOAD_SECRET ?? ''
  if (s.length < 8) throw new Error('PAYLOAD_SECRET is not configured')
  return s
}

export function newConnectionId(): string {
  return `cnx_${randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').toLowerCase()}`
}

export function newSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function sealConnectionSecret(secret: string): { secretHash: string; secretSealed: string } {
  return { secretHash: sha256Hex(secret), secretSealed: sealSecret(secret, serverSecret()) }
}

/** The plain secret, or null when the sealed copy does not open or does not match its hash (tampered row). */
export function openConnectionSecret(row: { secretSealed?: string | null; secretHash?: string | null }): string | null {
  if (!row.secretSealed || !row.secretHash) return null
  const secret = openSecret(row.secretSealed, serverSecret())
  return secret && sha256Hex(secret) === row.secretHash ? secret : null
}

export function sealJson(value: unknown): string {
  return sealSecret(JSON.stringify(value), serverSecret())
}

export function openJson<T>(sealed: string | null | undefined): T | null {
  if (!sealed) return null
  const plain = openSecret(sealed, serverSecret())
  if (!plain) return null
  try {
    return JSON.parse(plain) as T
  } catch {
    return null
  }
}
