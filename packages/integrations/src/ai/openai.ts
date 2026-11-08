/**
 * OpenAI Chat Completions (streamed) and Embeddings — also the "custom" provider: any OpenAI-compatible endpoint
 * (AvalAI, GapGPT, …) with its own base URL and key.
 */
import { AiError, type AiChatRequest, type AiMessage, type AiProvider, type AiStreamEvent, type FetchLike } from './types'
import { parseJson, postJson, sseData } from './sse'

type Delta = {
  choices?: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
}

function toOpenAi(system: string, messages: AiMessage[]): unknown[] {
  const out: unknown[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant')
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}),
      })
    else out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
  }
  return out
}

const FINISH: Record<string, 'stop' | 'tool_calls' | 'length' | 'refusal'> = { stop: 'stop', tool_calls: 'tool_calls', length: 'length', content_filter: 'refusal' }

export function createOpenAiProvider(opts: { apiKey: string; baseUrl?: string | null; name?: 'openai' | 'custom'; fetch?: FetchLike }): AiProvider {
  const name = opts.name ?? 'openai'
  const base = (opts.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const fetchFn = opts.fetch ?? ((u, i) => fetch(u, i))
  if (!opts.apiKey) throw new AiError('config', `${name}: API key is not set`)
  if (name === 'custom' && !/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${base}/`)) {
    throw new AiError('config', 'custom endpoint must be an https:// URL')
  }
  const auth = { authorization: `Bearer ${opts.apiKey}` }

  async function* chat(req: AiChatRequest): AsyncGenerator<AiStreamEvent> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAi(req.system, req.messages),
      stream: true,
      stream_options: { include_usage: true },
    }
    if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
    const res = await postJson(fetchFn, `${base}/chat/completions`, auth, body, req.signal)
    const calls = new Map<number, { id: string; name: string; arguments: string }>()
    let finish: AiStreamEvent & { type: 'done' } = { type: 'done', finish: 'stop' }
    for await (const data of sseData(res)) {
      if (data === '[DONE]') break
      const chunk = parseJson<Delta>(data)
      if (!chunk) continue
      const choice = chunk.choices?.[0]
      const text = choice?.delta?.content
      if (text) yield { type: 'text', delta: text }
      for (const tc of choice?.delta?.tool_calls ?? []) {
        const cur = calls.get(tc.index) ?? { id: '', name: '', arguments: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name += tc.function.name
        if (tc.function?.arguments) cur.arguments += tc.function.arguments
        calls.set(tc.index, cur)
      }
      if (choice?.finish_reason) finish = { type: 'done', finish: FINISH[choice.finish_reason] ?? 'other' }
      if (chunk.usage) yield { type: 'usage', inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 }
    }
    for (const [i, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
      yield { type: 'tool_call', call: { id: c.id || `call_${i}`, name: c.name, arguments: c.arguments || '{}' } }
    }
    if (calls.size && finish.finish === 'stop') finish = { type: 'done', finish: 'tool_calls' }
    yield finish
  }

  return {
    name,
    chat,
    defaultEmbeddingModel: 'text-embedding-3-small',
    embed: async ({ model, texts, signal }) => {
      const res = await postJson(fetchFn, `${base}/embeddings`, auth, { model, input: texts }, signal)
      const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] }
      const rows = [...(json.data ?? [])].sort((a, b) => a.index - b.index).map((d) => d.embedding)
      if (rows.length !== texts.length) throw new AiError('server', `embeddings: expected ${texts.length}, got ${rows.length}`)
      return rows
    },
    test: async (model) => {
      try {
        for await (const _ of chat({ model, system: 'Reply with OK.', messages: [{ role: 'user', content: 'ping' }] })) void _
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  }
}
