/**
 * Mock AI provider for CI, e2e and local dev (ADR 018): no network, deterministic.
 *  - Keywords in the last user message trigger tools, if the tool was offered (so permission filtering is visible).
 *  - With numbered sources in the system prompt it answers from source [1] and cites it.
 *  - "__fail__" in the message throws, to exercise error handling.
 */
import { LOCAL_EMBEDDING_MODEL, estimateTokens, localEmbedding } from '@edvora/core/ai'
import { AiError, type AiChatRequest, type AiProvider, type AiStreamEvent, type AiToolCall } from './types'

function firstSource(system: string): string | null {
  const at = system.indexOf('منبع‌ها:\n[1]')
  if (at < 0) return null
  const rest = system.slice(at).split('\n').slice(2) // skip "منبع‌ها:" and the "[1] (…)" header
  const lines: string[] = []
  for (const l of rest) {
    if (/^\[\d+\] \(/.test(l)) break
    lines.push(l)
  }
  const text = lines.join(' ').replace(/\s+/g, ' ').trim()
  return text ? (text.length > 240 ? `${text.slice(0, 240)}…` : text) : null
}

function pickTool(text: string, offered: Set<string>): { name: string; args: Record<string, unknown> } | null {
  const has = (n: string) => offered.has(n)
  const memory = text.match(/(?:به خاطر بسپار|یادت باشد|remember that)[:：،,]?\s*(.+)/i)
  if (memory && has('propose_memory')) return { name: 'propose_memory', args: { text: memory[1]!.trim() } }
  if (/کد تخفیف|coupon/i.test(text) && has('propose_coupon')) {
    const code = text.match(/\b[A-Z][A-Z0-9_-]{2,}\b/)?.[0] ?? 'MOCK10'
    const pct = text.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/(\d{1,3})\s*(?:٪|%|درصد)/)
    return { name: 'propose_coupon', args: { code, kind: 'percent', value: pct ? Number(pct[1]) : 10 } }
  }
  if (/سرنخ|lead/i.test(text) && has('search_leads')) return { name: 'search_leads', args: {} }
  if (/سفارش|order/i.test(text) && has('search_orders')) return { name: 'search_orders', args: {} }
  if (/(دوره|course)/i.test(text) && /(فهرست|جست|نشان|list|search)/i.test(text) && has('search_courses')) return { name: 'search_courses', args: {} }
  return null
}

function answerFor(req: AiChatRequest): { text: string; call?: AiToolCall } {
  const last = req.messages[req.messages.length - 1]
  if (!last) return { text: 'سلام!' }
  if (last.role === 'tool') {
    if (last.name.startsWith('propose_')) {
      return { text: last.name === 'propose_memory' ? 'یادداشت حافظه پیشنهاد شد؛ مدیر آکادمی باید آن را تأیید کند.' : 'پیشنهاد آماده است. برای انجام، دکمهٔ «تأیید» را بزنید؛ تا تأیید نکنید چیزی تغییر نمی‌کند.' }
    }
    let count = 0
    try {
      const v = JSON.parse(last.content) as { items?: unknown[]; error?: string }
      if (v.error) return { text: `این ابزار در دسترس نبود: ${v.error}` }
      count = v.items?.length ?? 0
    } catch {
      /* not JSON */
    }
    return { text: `نتیجهٔ جست‌وجو: ${count} مورد پیدا شد.` }
  }
  if (last.role !== 'user') return { text: '' }
  if (last.content.includes('__fail__')) throw new AiError('server', 'mock provider: requested failure')
  const tool = pickTool(last.content, new Set((req.tools ?? []).map((t) => t.name)))
  if (tool) return { text: '', call: { id: `mock_${tool.name}_${req.messages.length}`, name: tool.name, arguments: JSON.stringify(tool.args) } }
  const src = firstSource(req.system)
  if (src) return { text: `بر اساس منبع‌های آکادمی: ${src} [1]` }
  return { text: `این پاسخ ارائه‌دهندهٔ آزمایشی است (بدون اتصال به هوش مصنوعی واقعی). پرسش شما: «${last.content.slice(0, 120)}»` }
}

export function createMockAiProvider(): AiProvider {
  async function* chat(req: AiChatRequest): AsyncGenerator<AiStreamEvent> {
    const { text, call } = answerFor(req)
    for (let i = 0; i < text.length; i += 12) {
      if (req.signal?.aborted) return
      yield { type: 'text', delta: text.slice(i, i + 12) }
    }
    const input = estimateTokens(req.system) + req.messages.reduce((n, m) => n + estimateTokens(m.content), 0)
    yield { type: 'usage', inputTokens: input, outputTokens: estimateTokens(text) + (call ? 20 : 0) }
    if (call) yield { type: 'tool_call', call }
    yield { type: 'done', finish: call ? 'tool_calls' : 'stop' }
  }
  return {
    name: 'mock',
    chat,
    defaultEmbeddingModel: LOCAL_EMBEDDING_MODEL,
    embed: async ({ texts }) => texts.map(localEmbedding),
    test: async () => ({ ok: true }),
  }
}
