import { describe, expect, it } from 'vitest'
import { AiError, createAiProvider, createMockAiProvider, geminiSchema, type AiStreamEvent, type FetchLike } from './index'

const sse = (events: unknown[], opts: { named?: (e: unknown) => string } = {}) =>
  events.map((e) => (opts.named ? `event: ${opts.named(e)}\n` : '') + `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('')

type Call = { url: string; init: RequestInit }
function fakeFetch(body: string, status = 200, contentType = 'text/event-stream'): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init: init ?? {} })
      // Split the body in odd places to exercise the SSE buffer.
      const bytes = new TextEncoder().encode(body)
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7))
          c.close()
        },
      })
      return new Response(stream, { status, headers: { 'content-type': contentType, 'request-id': 'req_test' } })
    },
  }
}

async function collect(it: AsyncIterable<AiStreamEvent>): Promise<AiStreamEvent[]> {
  const out: AiStreamEvent[] = []
  for await (const e of it) out.push(e)
  return out
}
const textOf = (ev: AiStreamEvent[]) => ev.flatMap((e) => (e.type === 'text' ? [e.delta] : [])).join('')
const tool = { name: 'search_courses', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false } }

describe('openai / custom', () => {
  it('streams text and assembles tool calls from deltas', async () => {
    const f = fakeFetch(
      sse([
        { choices: [{ delta: { content: 'سلا' } }] },
        { choices: [{ delta: { content: 'م' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search_', arguments: '{"que' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'courses', arguments: 'ry":"x"}' } }] }, finish_reason: 'tool_calls' }] },
        { choices: [], usage: { prompt_tokens: 11, completion_tokens: 4 } },
        '[DONE]',
      ]),
    )
    const p = createAiProvider({ provider: 'custom', apiKey: 'k-1', baseUrl: 'https://gw.example/v1/', fetch: f.fetch })
    const ev = await collect(p.chat({ model: 'gpt-x', system: 'sys', messages: [{ role: 'user', content: 'hi' }], tools: [tool] }))
    expect(textOf(ev)).toBe('سلام')
    expect(ev).toContainEqual({ type: 'tool_call', call: { id: 'call_1', name: 'search_courses', arguments: '{"query":"x"}' } })
    expect(ev).toContainEqual({ type: 'usage', inputTokens: 11, outputTokens: 4 })
    expect(ev.at(-1)).toEqual({ type: 'done', finish: 'tool_calls' })
    expect(f.calls[0]!.url).toBe('https://gw.example/v1/chat/completions')
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer k-1')
    const body = JSON.parse(String(f.calls[0]!.init.body)) as { messages: { role: string }[]; tools: unknown[]; stream: boolean }
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(body.stream).toBe(true)
    expect(body.tools).toHaveLength(1)
  })

  it('maps HTTP errors, including a region block', async () => {
    const auth = createAiProvider({ provider: 'openai', apiKey: 'bad', fetch: fakeFetch('{"error":"invalid key"}', 401, 'application/json').fetch })
    await expect(collect(auth.chat({ model: 'm', system: 's', messages: [] }))).rejects.toMatchObject({ code: 'auth' })
    const blocked = createAiProvider({ provider: 'openai', apiKey: 'k', fetch: fakeFetch('{"error":{"code":"unsupported_country_region_territory"}}', 403, 'application/json').fetch })
    await expect(collect(blocked.chat({ model: 'm', system: 's', messages: [] }))).rejects.toMatchObject({ code: 'blocked' })
    expect(await blocked.test('m')).toMatchObject({ ok: false })
  })

  it('refuses missing config', () => {
    expect(() => createAiProvider({ provider: 'openai', apiKey: '' })).toThrow(AiError)
    expect(() => createAiProvider({ provider: 'custom', apiKey: 'k' })).toThrow(/base URL/)
    expect(() => createAiProvider({ provider: 'custom', apiKey: 'k', baseUrl: 'http://gw.example/v1' })).toThrow(/https/)
  })

  it('embeds in order', async () => {
    const f = fakeFetch(JSON.stringify({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }), 200, 'application/json')
    const p = createAiProvider({ provider: 'openai', apiKey: 'k', fetch: f.fetch })
    expect(await p.embed!({ model: 'text-embedding-3-small', texts: ['a', 'b'] })).toEqual([[1, 0], [0, 1]])
  })
})

describe('anthropic (official SDK)', () => {
  const name = (e: unknown) => (e as { type: string }).type
  it('streams text, reports usage and returns tool calls with the native content for replay', async () => {
    const events = [
      { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 20, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'جست‌وجو می‌کنم' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'search_courses', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"برند"}' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 15 } },
      { type: 'message_stop' },
    ]
    const f = fakeFetch(sse(events, { named: name }))
    const p = createAiProvider({ provider: 'anthropic', apiKey: 'sk-ant-test', fetch: f.fetch })
    const ev = await collect(p.chat({ model: 'claude-opus-5-5', system: 'sys', messages: [{ role: 'user', content: 'دوره‌ها' }], tools: [tool] }))
    expect(textOf(ev)).toBe('جست‌وجو می‌کنم')
    expect(ev).toContainEqual({ type: 'usage', inputTokens: 20, outputTokens: 15 })
    const call = ev.find((e) => e.type === 'tool_call')
    expect(call && call.type === 'tool_call' && call.call).toMatchObject({ id: 'toolu_1', name: 'search_courses', arguments: '{"query":"برند"}' })
    expect(call && call.type === 'tool_call' && call.call.raw).toBeTruthy()
    expect(ev.at(-1)).toEqual({ type: 'done', finish: 'tool_calls' })
    const body = JSON.parse(String(f.calls[0]!.init.body)) as Record<string, unknown>
    expect(body.system).toBe('sys')
    expect(body.fallbacks).toBe('default')
    expect((body.tools as { input_schema: unknown; eager_input_streaming: boolean }[])[0]).toMatchObject({ eager_input_streaming: true })
    expect(f.calls[0]!.url).toContain('/v1/messages')
  })

  it('has no embeddings and maps a bad key to auth', async () => {
    const p = createAiProvider({ provider: 'anthropic', apiKey: 'bad', fetch: fakeFetch('{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', 401, 'application/json').fetch })
    expect(p.embed).toBeNull()
    await expect(collect(p.chat({ model: 'claude-opus-5-5', system: 's', messages: [{ role: 'user', content: 'x' }] }))).rejects.toMatchObject({ code: 'auth' })
  })
})

describe('gemini', () => {
  it('streams text, function calls and usage; sends a cleaned schema', async () => {
    const f = fakeFetch(
      sse([
        { candidates: [{ content: { parts: [{ text: 'باشه' }] } }] },
        { candidates: [{ content: { parts: [{ functionCall: { name: 'search_courses', args: { query: 'x' } }, thoughtSignature: 'sig' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3 } },
      ]),
    )
    const p = createAiProvider({ provider: 'gemini', apiKey: 'g-key', fetch: f.fetch })
    const ev = await collect(p.chat({ model: 'gemini-2.5-flash', system: 'sys', messages: [{ role: 'user', content: 'q' }], tools: [tool] }))
    expect(textOf(ev)).toBe('باشه')
    expect(ev).toContainEqual({ type: 'usage', inputTokens: 9, outputTokens: 3 })
    expect(ev.find((e) => e.type === 'tool_call')).toMatchObject({ call: { name: 'search_courses', arguments: '{"query":"x"}' } })
    expect(f.calls[0]!.url).toContain('models/gemini-2.5-flash:streamGenerateContent?alt=sse')
    const body = JSON.parse(String(f.calls[0]!.init.body)) as { tools: { functionDeclarations: { parameters: Record<string, unknown> }[] }[] }
    expect(body.tools[0]!.functionDeclarations[0]!.parameters).not.toHaveProperty('additionalProperties')
    expect(geminiSchema({ type: 'object', $schema: 'x', properties: { a: { type: 'string', default: 'z' } } })).toEqual({ type: 'object', properties: { a: { type: 'string' } } })
  })
})

describe('mock', () => {
  const p = createMockAiProvider()
  it('answers from the first source with a citation', async () => {
    const system = 'rules\n\nمنبع‌ها:\n[1] (سند: آیین‌نامه)\nبازپرداخت تا ۱۴ روز ممکن است.\n\n[2] (سند: x)\nدیگر'
    const ev = await collect(p.chat({ model: 'mock-1', system, messages: [{ role: 'user', content: 'سیاست بازپرداخت؟' }] }))
    expect(textOf(ev)).toContain('بازپرداخت تا ۱۴ روز ممکن است. [1]')
    expect(textOf(ev)).not.toContain('دیگر')
  })

  it('only calls tools it was offered', async () => {
    const offered = [{ name: 'propose_coupon', description: '', parameters: {} }]
    const yes = await collect(p.chat({ model: 'm', system: '', messages: [{ role: 'user', content: 'یک کد تخفیف ALUMNI20 با ۲۰ درصد بساز' }], tools: offered }))
    expect(yes.find((e) => e.type === 'tool_call')).toMatchObject({ call: { name: 'propose_coupon', arguments: JSON.stringify({ code: 'ALUMNI20', kind: 'percent', value: 20 }) } })
    const no = await collect(p.chat({ model: 'm', system: '', messages: [{ role: 'user', content: 'یک کد تخفیف ALUMNI20 بساز' }], tools: [] }))
    expect(no.some((e) => e.type === 'tool_call')).toBe(false)
  })

  it('fails on request and embeds locally', async () => {
    await expect(collect(p.chat({ model: 'm', system: '', messages: [{ role: 'user', content: '__fail__' }] }))).rejects.toBeInstanceOf(AiError)
    const [v] = await p.embed!({ model: 'local-hash-v2-1024', texts: ['سلام'] })
    expect(v).toHaveLength(1024)
  })
})
