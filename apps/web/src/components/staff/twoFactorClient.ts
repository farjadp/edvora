/**
 * Thin typed client for POST /api/users/2fa/{setup,enable,verify,disable}.
 * Maps HTTP outcomes to UI states. No UI here. Safe to import from client components.
 */
export type TwoFactorEndpoint = 'setup' | 'enable' | 'verify' | 'disable'

export type TwoFactorSetupData = {
  /** Base32 secret, Latin. */
  secret: string
  otpauthUri: string
  /** Server-rendered QR as an inline SVG string (trusted). Optional: the manual key still works without it. */
  qrSvg?: string
}

export type TwoFactorResult<T = undefined> =
  | { kind: 'ok'; data: T }
  | { kind: 'wrong'; attemptsLeft?: number }
  | { kind: 'locked'; lockedUntil: number }
  | { kind: 'conflict' }
  | { kind: 'network' }
  | { kind: 'error' }

export type CodeSubmit = (code: string) => Promise<TwoFactorResult>
export type SetupSubmit = () => Promise<TwoFactorResult<TwoFactorSetupData>>

const FIFTEEN_MIN = 15 * 60 * 1000

function parseLockedUntil(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string') {
    const t = Date.parse(value)
    if (!Number.isNaN(t)) return t
  }
  return Date.now() + FIFTEEN_MIN
}

async function post<T>(endpoint: TwoFactorEndpoint, body: Record<string, unknown>): Promise<TwoFactorResult<T>> {
  let res: Response
  try {
    res = await fetch(`/api/users/2fa/${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { kind: 'network' }
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.ok) return { kind: 'ok', data: json as T }
  if (res.status === 401) {
    return { kind: 'wrong', attemptsLeft: typeof json.attemptsLeft === 'number' ? json.attemptsLeft : undefined }
  }
  if (res.status === 429) return { kind: 'locked', lockedUntil: parseLockedUntil(json.lockedUntil) }
  if (res.status === 409) return { kind: 'conflict' }
  return { kind: 'error' }
}

export const submitCode =
  (endpoint: 'enable' | 'verify' | 'disable'): CodeSubmit =>
  (code) =>
    post<undefined>(endpoint, { code })

export const requestSetup: SetupSubmit = () => post<TwoFactorSetupData>('setup', {})
