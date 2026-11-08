export class IntegrationError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(`[${provider}] ${message}`)
    this.name = 'IntegrationError'
  }
}

export async function fetchJson(provider: string, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> {
  const { timeoutMs = 15_000, ...rest } = init
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal })
    const text = await res.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new IntegrationError(provider, `Non-JSON response (HTTP ${res.status})`, text.slice(0, 500))
    }
    return body
  } catch (err) {
    if (err instanceof IntegrationError) throw err
    throw new IntegrationError(provider, err instanceof Error ? err.message : 'Network error', err)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Like `fetchJson` (same timeout and error wrapping) but returns the raw body text, for SOAP/XML gateways.
 * `requireOk` turns a non-2xx HTTP status into an `IntegrationError` (chain APIs: a 429/5xx must not look like "not found").
 */
export async function fetchText(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number; requireOk?: boolean } = {},
): Promise<string> {
  const { timeoutMs = 15_000, requireOk = false, ...rest } = init
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal })
    const text = await res.text()
    if (requireOk && !res.ok) throw new IntegrationError(provider, `HTTP ${res.status}`, text.slice(0, 500))
    return text
  } catch (err) {
    if (err instanceof IntegrationError) throw err
    throw new IntegrationError(provider, err instanceof Error ? err.message : 'Network error', err)
  } finally {
    clearTimeout(timer)
  }
}
