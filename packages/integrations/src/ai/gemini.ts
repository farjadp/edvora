/**
 * Google Gemini (generativelanguage v1beta): streamGenerateContent over SSE with function declarations, and
 * batchEmbedContents. The model's own parts (with thought signatures) are replayed unchanged within a turn.
 */
import { AiError, type AiChatRequest, type AiMessage, type AiProvider, type AiStreamEvent, type FetchLike } from './types'
import { parseJson, postJson, sseData } from './sse'

type Part = { text?: string; thought?: boolean; functionCall?: { name: string; args?: Record<string, unknown>; id?: string }; functionResponse?: unknown; thoughtSignature?: string }
type Chunk = {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
}

export const RAW_KEY = 'geminiParts'
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Gemini accepts an OpenAPI subset: drop keywords it rejects (additionalProperties, $schema, default, …). */
export function geminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(geminiSchema)
  if (!s || typeof s !== 'object') return s
  const keep = new Set(['type', 'description', 'properties', 'required', 'items', 'enum', 'format', 'nullable', 'minimum', 'maximum', 'minItems', 'maxItems', 'anyOf'])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (!keep.has(k)) continue
    if (k === 'properties' && v && typeof v === 'object') out[k] = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)]))
    else if (k === 'format' && !['enum', 'date-time'].includes(String(v))) continue
    else out[k] = geminiSchema(v)
  }
  return out
}

function toGemini(messages: AiMessage[]): unknown[] {
  const out: { role: 'user' | 'model'; parts: unknown[] }[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.content }] })
    else if (m.role === 'assistant') {
      const raw = m.raw?.[RAW_KEY] as Part[] | undefined
      const parts: unknown[] = raw?.length ? raw : [...(m.content ? [{ text: m.content }] : []), ...(m.toolCalls ?? []).map((c) => ({ functionCall: { name: c.name, args: JSON.parse(c.arguments || '{}') as unknown } }))]
      if (parts.length) out.push({ role: 'model', parts })
    } else {
      const part = { functionResponse: { name: m.name, response: { content: m.content } } }
      const last = out[out.length - 1]
      if (last?.role === 'user' && last.parts.every((p) => typeof p === 'object' && p !== null && 'functionResponse' in p)) last.parts.push(part)
      else out.push({ role: 'user', parts: [part] })
    }
  }
  return out
}

const FINISH: Record<string, 'stop' | 'length' | 'refusal'> = { STOP: 'stop', MAX_TOKENS: 'length', SAFETY: 'refusal', PROHIBITED_CONTENT: 'refusal', BLOCKLIST: 'refusal' }

export function createGeminiProvider(opts: { apiKey: string; fetch?: FetchLike; baseUrl?: string | null }): AiProvider {
  if (!opts.apiKey) throw new AiError('config', 'gemini: API key is not set')
  const base = (opts.baseUrl?.trim() || BASE).replace(/\/+$/, '')
  const fetchFn = opts.fetch ?? ((u, i) => fetch(u, i))
  const headers = { 'x-goog-api-key': opts.apiKey }
  const modelPath = (m: string) => (m.startsWith('models/') ? m : `models/${m}`)

  async function* chat(req: AiChatRequest): AsyncGenerator<AiStreamEvent> {
    const body: Record<string, unknown> = { systemInstruction: { parts: [{ text: req.system }] }, contents: toGemini(req.messages) }
    if (req.tools?.length) body.tools = [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) })) }]
    const res = await postJson(fetchFn, `${base}/${modelPath(req.model)}:streamGenerateContent?alt=sse`, headers, body, req.signal)
    const parts: Part[] = []
    let finish: 'stop' | 'tool_calls' | 'length' | 'refusal' | 'other' = 'stop'
    let usage: { inputTokens: number; outputTokens: number } | null = null
    for await (const data of sseData(res)) {
      const chunk = parseJson<Chunk>(data)
      if (!chunk) continue
      const cand = chunk.candidates?.[0]
      for (const p of cand?.content?.parts ?? []) {
        parts.push(p)
        if (p.text && !p.thought) yield { type: 'text', delta: p.text }
      }
      if (cand?.finishReason) finish = FINISH[cand.finishReason] ?? 'other'
      if (chunk.usageMetadata) {
        const u = chunk.usageMetadata
        usage = { inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) }
      }
    }
    if (usage) yield { type: 'usage', ...usage }
    const calls = parts.filter((p) => p.functionCall)
    for (let i = 0; i < calls.length; i++) {
      const fc = calls[i]!.functionCall!
      yield { type: 'tool_call', call: { id: fc.id ?? `gemini_${i}`, name: fc.name, arguments: JSON.stringify(fc.args ?? {}), raw: { [RAW_KEY]: parts } } }
    }
    yield { type: 'done', finish: calls.length ? 'tool_calls' : finish }
  }

  return {
    name: 'gemini',
    chat,
    defaultEmbeddingModel: 'gemini-embedding-001',
    embed: async ({ model, texts, signal }) => {
      const res = await postJson(fetchFn, `${base}/${modelPath(model)}:batchEmbedContents`, headers, { requests: texts.map((t) => ({ model: modelPath(model), content: { parts: [{ text: t }] } })) }, signal)
      const json = (await res.json()) as { embeddings?: { values: number[] }[] }
      const rows = (json.embeddings ?? []).map((e) => e.values)
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
