/**
 * Anthropic Claude via the official SDK (`@anthropic-ai/sdk`), streamed Messages API with client tools.
 * Anthropic has no embeddings API: `embed` is null and the caller uses the local embedding.
 *
 * Within one chat turn the assistant's native content (thinking + tool_use blocks) is passed back unchanged through
 * `AiMessage.raw` while tools run; earlier turns are replayed as plain text (thinking blocks dropped from the front of
 * the history only, which the API accepts).
 */
import Anthropic from '@anthropic-ai/sdk'
import { AiError, errorFromStatus, type AiChatRequest, type AiMessage, type AiProvider, type AiStreamEvent, type FetchLike } from './types'

type Block = Anthropic.Beta.BetaContentBlockParam
type Param = Anthropic.Beta.BetaMessageParam

/** Assistant content to replay as-is in the same turn (set by this adapter on `tool_call` events). */
export const RAW_KEY = 'anthropicContent'

function toAnthropic(messages: AiMessage[]): Param[] {
  const out: Param[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') {
      const raw = m.raw?.[RAW_KEY] as Block[] | undefined
      if (raw?.length) out.push({ role: 'assistant', content: raw })
      else {
        const blocks: Block[] = []
        if (m.content) blocks.push({ type: 'text', text: m.content })
        for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: safeObject(c.arguments) })
        if (blocks.length) out.push({ role: 'assistant', content: blocks })
      }
    } else {
      const result: Block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }
      const last = out[out.length - 1]
      // All results of one assistant turn go back in a single user message.
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) last.content.push(result)
      else out.push({ role: 'user', content: [result] })
    }
  }
  return out
}

function safeObject(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function mapError(err: unknown): unknown {
  if (err instanceof Anthropic.APIConnectionError) return new AiError('network', err.message)
  if (err instanceof Anthropic.APIError && typeof err.status === 'number') return errorFromStatus(err.status, err.message)
  return err
}

const FINISH: Record<string, 'stop' | 'tool_calls' | 'length' | 'refusal'> = { end_turn: 'stop', tool_use: 'tool_calls', max_tokens: 'length', refusal: 'refusal', stop_sequence: 'stop' }

export function createAnthropicProvider(opts: { apiKey: string; fetch?: FetchLike; baseUrl?: string | null }): AiProvider {
  if (!opts.apiKey) throw new AiError('config', 'anthropic: API key is not set')
  const client = new Anthropic({
    apiKey: opts.apiKey,
    maxRetries: 1,
    ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}),
    ...(opts.fetch ? { fetch: opts.fetch as unknown as typeof fetch } : {}),
  })

  async function* chat(req: AiChatRequest): AsyncGenerator<AiStreamEvent> {
    const params = {
      model: req.model,
      max_tokens: 16000,
      system: req.system,
      messages: toAnthropic(req.messages),
      ...(req.tools?.length
        ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema, eager_input_streaming: true })) }
        : {}),
      // Server-side fallback when the model declines (routes by refusal category); not yet in the SDK's types.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as Anthropic.Beta.MessageCreateParamsStreaming
    let final: Anthropic.Beta.BetaMessage
    try {
      const stream = client.beta.messages.stream(params, { signal: req.signal })
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield { type: 'text', delta: ev.delta.text }
      }
      final = await stream.finalMessage()
    } catch (err) {
      throw mapError(err)
    }
    const finish = FINISH[final.stop_reason ?? ''] ?? 'other'
    yield { type: 'usage', inputTokens: final.usage.input_tokens ?? 0, outputTokens: final.usage.output_tokens ?? 0 }
    // A refused or truncated turn never runs its tools (the input may be cut off).
    if (finish === 'tool_calls') {
      const raw = final.content as unknown as Block[]
      for (const b of final.content) {
        if (b.type === 'tool_use') yield { type: 'tool_call', call: { id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}), raw: { [RAW_KEY]: raw } } }
      }
    }
    yield { type: 'done', finish }
  }

  return {
    name: 'anthropic',
    chat,
    embed: null,
    defaultEmbeddingModel: null,
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
