/**
 * AI chat providers (ADR 018). Every provider implements `AiProvider`; the academy picks one. Server-side only.
 * The orchestration loop (prompt, tools, confirmation) lives in the web app and is provider-neutral.
 */

export const AI_PROVIDERS = ['openai', 'anthropic', 'gemini', 'custom', 'mock'] as const
export type AiProviderName = (typeof AI_PROVIDERS)[number]

export type AiToolCall = {
  id: string
  name: string
  /** JSON object string */
  arguments: string
  /** Provider-native assistant content to replay unchanged within the same turn (e.g. Claude thinking blocks). */
  raw?: Record<string, unknown>
}

export type AiMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AiToolCall[]; raw?: Record<string, unknown> }
  | { role: 'tool'; toolCallId: string; name: string; content: string }

export type AiToolDef = { name: string; description: string; parameters: Record<string, unknown> }

export type AiChatRequest = {
  model: string
  system: string
  messages: AiMessage[]
  tools?: AiToolDef[]
  signal?: AbortSignal
}

export type AiStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: AiToolCall }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done'; finish: 'stop' | 'tool_calls' | 'length' | 'refusal' | 'other' }

export interface AiProvider {
  readonly name: AiProviderName
  /** One model turn, streamed. Throws `AiError` on failure (the caller logs it and shows a friendly message). */
  chat(req: AiChatRequest): AsyncIterable<AiStreamEvent>
  /** Embeddings, or null when the provider has none (Anthropic): the caller then uses the local embedding. */
  embed: ((input: { model: string; texts: string[]; signal?: AbortSignal }) => Promise<number[][]>) | null
  readonly defaultEmbeddingModel: string | null
  /** A tiny real request with the configured key and model. */
  test(model: string): Promise<{ ok: true } | { ok: false; error: string }>
}

export type AiErrorCode = 'auth' | 'blocked' | 'rate_limit' | 'bad_request' | 'server' | 'network' | 'config'

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

/** HTTP status (+ body) → error code. Region refusals (sanctions / unsupported country) count as `blocked`. */
export function errorFromStatus(status: number, body: string): AiError {
  const text = body.slice(0, 300)
  if (/unsupported_country|not available in your (country|region)|location is not supported|region/i.test(body) && (status === 403 || status === 400)) {
    return new AiError('blocked', `provider refuses this server's region (${status}): ${text}`, status)
  }
  if (status === 401 || status === 403) return new AiError('auth', `authentication failed (${status}): ${text}`, status)
  if (status === 429) return new AiError('rate_limit', `rate limited (${status}): ${text}`, status)
  if (status >= 500) return new AiError('server', `provider error (${status}): ${text}`, status)
  return new AiError('bad_request', `request rejected (${status}): ${text}`, status)
}

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  auth: 'کلید ارائه‌دهنده پذیرفته نشد. مدیر آکادمی باید کلید را در تنظیمات دستیار بررسی کند.',
  blocked: 'ارائه‌دهنده درخواست‌های این سرور را نمی‌پذیرد (محدودیت منطقه‌ای). از یک درگاه ایرانی سازگار با OpenAI استفاده کنید.',
  rate_limit: 'ارائه‌دهنده موقتاً درخواست‌ها را محدود کرده است؛ کمی بعد دوباره امتحان کنید.',
  bad_request: 'ارائه‌دهنده درخواست را نپذیرفت. نام مدل را در تنظیمات دستیار بررسی کنید.',
  server: 'ارائه‌دهنده الان پاسخ نمی‌دهد؛ کمی بعد دوباره امتحان کنید.',
  network: 'اتصال به ارائه‌دهنده برقرار نشد.',
  config: 'دستیار هنوز تنظیم نشده است.',
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type AiProviderConfig = {
  provider: AiProviderName
  apiKey?: string | null
  /** Custom endpoint base URL, e.g. https://api.avalai.ir/v1 */
  baseUrl?: string | null
  /** Injected in tests. */
  fetch?: FetchLike
}

/** Suggested models per provider (the academy may type any other). */
export const MODEL_SUGGESTIONS: Record<AiProviderName, { chat: string[]; embedding: string | null }> = {
  openai: { chat: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'], embedding: 'text-embedding-3-small' },
  anthropic: { chat: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], embedding: null },
  gemini: { chat: ['gemini-2.5-flash', 'gemini-2.5-pro'], embedding: 'gemini-embedding-001' },
  custom: { chat: ['gpt-5-mini', 'gpt-4.1-mini'], embedding: 'text-embedding-3-small' },
  mock: { chat: ['mock-1'], embedding: 'local-hash-256' },
}
