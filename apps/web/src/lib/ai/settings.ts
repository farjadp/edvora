import 'server-only'
import { DEFAULT_RATE_LIMITS, assistantName, keyHint, openAiKey, privacyPolicy, sealAiKey, type BudgetSettings, type PrivacyPolicy, type RateLimits } from '@edvora/core/ai'
import { AiError, createAiProvider, type AiProvider, type AiProviderName } from '@edvora/integrations/ai'
import type { Payload } from 'payload'
import type { AiSetting } from '../../payload-types'

/** Key for sealing provider keys: AI_SECRETS_KEY (set a dedicated one in production) or PAYLOAD_SECRET. */
function secret(): string {
  const k = process.env.AI_SECRETS_KEY?.trim() || process.env.PAYLOAD_SECRET || ''
  if (k.length < 8) throw new AiError('config', 'AI_SECRETS_KEY / PAYLOAD_SECRET is not configured')
  return k
}

export const sealKey = (plain: string) => ({ apiKeySealed: sealAiKey(plain.trim(), secret()), apiKeyHint: keyHint(plain.trim()) })

export type AiConfig = {
  id: number | null
  enabled: boolean
  /** Resolved name («دانا» unless the academy renamed it). */
  name: string
  /** What the academy typed, for the settings form. */
  customName: string | null
  provider: AiProviderName
  model: string
  baseUrl: string | null
  hasKey: boolean
  keyHint: string | null
  embeddingModel: string | null
  privacy: PrivacyPolicy
  rate: RateLimits
  budget: BudgetSettings
  lastTest: { ok: boolean; at: string; error?: string } | null
}

type Stored = AiSetting & { apiKeySealed?: string | null }

/** The academy's settings (defaults when none were saved). Server only; the sealed key never leaves this module. */
export async function loadAiConfig(payload: Payload, tenantId: number): Promise<AiConfig & { sealed: string | null }> {
  const res = await payload.find({ collection: 'ai-settings', where: { tenant: { equals: tenantId } }, limit: 1, depth: 0, overrideAccess: true, showHiddenFields: true })
  const s = res.docs[0] as Stored | undefined
  return {
    id: s?.id ?? null,
    enabled: Boolean(s?.enabled),
    name: assistantName(s?.assistantName),
    customName: s?.assistantName ?? null,
    provider: (s?.provider ?? 'mock') as AiProviderName,
    model: s?.model || 'mock-1',
    baseUrl: s?.baseUrl ?? null,
    hasKey: Boolean(s?.apiKeySealed),
    keyHint: s?.apiKeyHint ?? null,
    embeddingModel: s?.embeddingModel || null,
    privacy: privacyPolicy(s?.privacy ?? null),
    rate: { perMinute: s?.limits?.perMinute ?? DEFAULT_RATE_LIMITS.perMinute, perDay: s?.limits?.perDay ?? DEFAULT_RATE_LIMITS.perDay },
    budget: {
      monthlyTokenLimit: s?.limits?.monthlyTokenLimit ?? null,
      monthlyCostLimitRial: s?.limits?.monthlyCostLimitRial ?? null,
      inputPricePerMillionRial: s?.limits?.inputPricePerMillionRial ?? null,
      outputPricePerMillionRial: s?.limits?.outputPricePerMillionRial ?? null,
    },
    lastTest: (s?.lastTest as AiConfig['lastTest']) ?? null,
    sealed: s?.apiKeySealed ?? null,
  }
}

/** Public view of the config (for pages): no sealed key. */
export function publicConfig(c: AiConfig & { sealed?: string | null }): AiConfig {
  const { sealed: _sealed, ...rest } = c
  void _sealed
  return rest
}

/** `AI_PROVIDER_OVERRIDE=mock` forces the mock everywhere (CI, e2e, local dev): no real key is ever used there. */
export function effectiveProviderName(c: AiConfig): AiProviderName {
  return process.env.AI_PROVIDER_OVERRIDE === 'mock' ? 'mock' : c.provider
}

export function providerFor(c: AiConfig & { sealed: string | null }): AiProvider {
  const name = effectiveProviderName(c)
  if (name === 'mock') return createAiProvider({ provider: 'mock' })
  const key = openAiKey(c.sealed, secret())
  if (!key) throw new AiError('config', 'API key is not set or cannot be opened')
  return createAiProvider({ provider: name, apiKey: key, baseUrl: c.baseUrl })
}

export function modelFor(c: AiConfig): string {
  return effectiveProviderName(c) === 'mock' ? 'mock-1' : c.model
}
