import { IntegrationError } from '../errors'
import type { CredentialKey, GatewayCredentials } from './types'

export const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' } as const

/** Returns a trimmed credential or throws an `IntegrationError` naming the missing key. */
export function requireCredential(provider: string, credentials: GatewayCredentials, key: CredentialKey): string {
  const v = credentials[key]?.trim()
  if (!v) throw new IntegrationError(provider, `${key} is missing`)
  return v
}

/** An integer amount (rials) from a number or a digit string; anything else (floats, junk) is `undefined`. */
export function toIntAmount(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : undefined
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
    const n = Number(v.trim())
    return Number.isSafeInteger(n) ? n : undefined
  }
  return undefined
}

/** Copies the given params (when present and non-empty) into a plain record. */
export function pickParams(params: URLSearchParams, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of keys) {
    const v = params.get(k)
    if (v !== null && v !== '') out[k] = v
  }
  return out
}

/** Optional string from a string-or-number field. */
export const str = (v: string | number | null | undefined): string | undefined => (v === null || v === undefined || v === '' ? undefined : String(v))

/** Fails when the gateway reports an order id different from the attempt we created. */
export function orderMismatch(reported: string | undefined, attemptId: string): { ok: false; code: string; message: string } | null {
  if (reported !== undefined && reported !== attemptId) {
    return { ok: false, code: 'ORDER_MISMATCH', message: `Gateway order ${reported} does not match attempt ${attemptId}` }
  }
  return null
}
