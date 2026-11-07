/** Private-preview gate (E-030): which hosts are noindex / behind basic auth. Used by apps/web/src/proxy.ts. */

export interface PreviewGate {
  hosts: Set<string> | 'all'
  /** user:password; 'locked' = user set but no password yet (fail closed: nobody gets in). */
  credentials: string | 'locked' | null
}

export function parsePreviewGate(env: Record<string, string | undefined>): PreviewGate {
  const raw = (env.PRIVATE_PREVIEW_HOSTS ?? '').trim()
  const hosts: PreviewGate['hosts'] = raw === '*' ? 'all' : new Set(raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean))
  const user = env.PRIVATE_PREVIEW_USER?.trim()
  const password = env.PRIVATE_PREVIEW_PASSWORD
  return { hosts, credentials: user && password ? `${user}:${password}` : user ? 'locked' : null }
}

const normalizeHost = (host: string | null) => (host ?? '').toLowerCase().split(':')[0]!.replace(/^www\./, '')

/** Constant-time string compare (no early exit on the first differing character). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/**
 * 'pass'      — host is not private: do nothing
 * 'noindex'   — private host, allowed: serve with X-Robots-Tag noindex
 * 'challenge' — private host with basic auth and missing/wrong credentials: 401
 */
export function checkPreviewGate(gate: PreviewGate, host: string | null, authorization: string | null): 'pass' | 'noindex' | 'challenge' {
  const h = normalizeHost(host)
  const isPrivate = gate.hosts === 'all' || gate.hosts.has(h)
  if (!isPrivate) return 'pass'
  if (!gate.credentials) return 'noindex'
  if (gate.credentials === 'locked') return 'challenge'
  const m = /^Basic\s+(.+)$/i.exec(authorization ?? '')
  if (!m) return 'challenge'
  let decoded = ''
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(m[1]!.trim()), (ch) => ch.charCodeAt(0)))
  } catch {
    return 'challenge'
  }
  return safeEqual(decoded, gate.credentials) ? 'noindex' : 'challenge'
}
