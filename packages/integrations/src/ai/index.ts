import { createAnthropicProvider } from './anthropic'
import { createGeminiProvider } from './gemini'
import { createMockAiProvider } from './mock'
import { createOpenAiProvider } from './openai'
import { AiError, type AiProvider, type AiProviderConfig } from './types'

export * from './types'
export { createAnthropicProvider, createGeminiProvider, createMockAiProvider, createOpenAiProvider }
export { geminiSchema } from './gemini'

/** The academy's provider. Throws `AiError('config')` when a real provider has no key (or the custom one no URL). */
export function createAiProvider(cfg: AiProviderConfig): AiProvider {
  const key = cfg.apiKey ?? ''
  switch (cfg.provider) {
    case 'mock':
      return createMockAiProvider()
    case 'openai':
      return createOpenAiProvider({ apiKey: key, fetch: cfg.fetch })
    case 'custom':
      if (!cfg.baseUrl) throw new AiError('config', 'custom endpoint: base URL is not set')
      return createOpenAiProvider({ apiKey: key, baseUrl: cfg.baseUrl, name: 'custom', fetch: cfg.fetch })
    case 'anthropic':
      return createAnthropicProvider({ apiKey: key, fetch: cfg.fetch })
    case 'gemini':
      return createGeminiProvider({ apiKey: key, fetch: cfg.fetch })
    default:
      throw new AiError('config', `unknown AI provider: ${String(cfg.provider)}`)
  }
}
