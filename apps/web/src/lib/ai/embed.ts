import 'server-only'
import { LOCAL_EMBEDDING_MODEL, localEmbedding } from '@edvora/core/ai'
import type { Payload } from 'payload'
import { effectiveProviderName, providerFor, type AiConfig } from './settings'

/** Which embedding model this academy uses now (the same one must embed the question and the passages). */
export function embeddingModelFor(c: AiConfig): string {
  const name = effectiveProviderName(c)
  if (name === 'mock' || name === 'anthropic') return LOCAL_EMBEDDING_MODEL
  return c.embeddingModel || (name === 'gemini' ? 'gemini-embedding-001' : 'text-embedding-3-small')
}

/**
 * Embeds with the academy's provider; the local embedding when the provider has none. A provider failure is logged
 * and reported (`fallback: true`) — the caller decides: documents fail visibly, chat search just finds less.
 */
export async function embedTexts(payload: Payload, c: AiConfig & { sealed: string | null }, texts: string[]): Promise<{ model: string; vectors: number[][]; error?: string }> {
  const model = embeddingModelFor(c)
  if (model === LOCAL_EMBEDDING_MODEL) return { model, vectors: texts.map(localEmbedding) }
  try {
    const provider = providerFor(c)
    if (!provider.embed) return { model: LOCAL_EMBEDDING_MODEL, vectors: texts.map(localEmbedding) }
    const vectors: number[][] = []
    for (let i = 0; i < texts.length; i += 64) vectors.push(...(await provider.embed({ model, texts: texts.slice(i, i + 64) })))
    return { model, vectors }
  } catch (err) {
    payload.logger.error({ err, msg: 'ai: embedding failed' })
    return { model, vectors: [], error: (err as Error).message }
  }
}
