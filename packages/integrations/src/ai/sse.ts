import { AiError, errorFromStatus, type FetchLike } from './types'

/** POST JSON; non-2xx and network failures become `AiError`. */
export async function postJson(fetchFn: FetchLike, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response
  try {
    res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal })
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw err
    throw new AiError('network', `network error: ${(err as Error)?.message ?? String(err)}`)
  }
  if (!res.ok) throw errorFromStatus(res.status, await res.text().catch(() => ''))
  return res
}

/** The `data:` payloads of a server-sent-events body, in order (`[DONE]` included as-is). */
export async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let data: string[] = []
  const flush = function* () {
    if (data.length) yield data.join('\n')
    data = []
  }
  for (;;) {
    const { value, done } = await reader.read()
    buf += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (line === '') yield* flush()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    if (done) break
  }
  if (buf.startsWith('data:')) data.push(buf.slice(5).replace(/^ /, ''))
  yield* flush()
}

export function parseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}
