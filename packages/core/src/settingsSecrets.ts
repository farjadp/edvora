/**
 * Integration keys at rest (E-047, ADR 019 §5). AES-256-GCM through `sealSecret`, with the server key bound to the
 * academy and the provider kind, so a sealed value copied into another academy's (or another kind's) row does not
 * open. Server only (node:crypto).
 */
import { openSecret, sealSecret } from './totp'

export type SecretBinding = { tenantId: number | string; kind: string }

const MIN_KEY = 16

/** The settings key: SETTINGS_SECRETS_KEY, else PAYLOAD_SECRET. Throws when neither is long enough. */
export function settingsServerKey(env: { SETTINGS_SECRETS_KEY?: string | undefined; PAYLOAD_SECRET?: string | undefined }): string {
  const k = env.SETTINGS_SECRETS_KEY?.trim() || env.PAYLOAD_SECRET?.trim() || ''
  if (k.length < MIN_KEY) throw new Error(`SETTINGS_SECRETS_KEY (or PAYLOAD_SECRET) must be at least ${MIN_KEY} characters`)
  return k
}

const bound = (b: SecretBinding, serverKey: string) => `settings:${String(b.tenantId)}:${b.kind}:${serverKey}`

export function sealSettingSecret(plain: string, binding: SecretBinding, serverKey: string): string {
  if (!plain) throw new Error('Refusing to seal an empty secret')
  return sealSecret(plain, bound(binding, serverKey))
}

/** The secret, or null when there is none or it does not open (wrong academy, wrong kind, rotated key, tampered). */
export function openSettingSecret(sealed: string | null | undefined, binding: SecretBinding, serverKey: string): string | null {
  if (!sealed) return null
  return openSecret(sealed, bound(binding, serverKey))
}
