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
