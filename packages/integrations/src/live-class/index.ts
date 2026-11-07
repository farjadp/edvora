import { IntegrationError } from '../errors'
import { createMockLiveClassProvider } from './mock'
import type { LiveClassProvider } from './types'

export * from './types'
export { LiveEventSchema, LiveRoleSchema } from './schema'
export { createMockLiveClassProvider }
export type { MockLiveClassProvider } from './mock'

export type LiveClassConfig = {
  provider: string | undefined
  /** Mock only: the app page that stands in for the classroom. */
  mockRoomUrl: string
  mockSecret?: string
}

/**
 * Picks the live-class provider. Real adapters (BigBlueButton first, per ADR 012) arrive in Phase 3, after Farjad
 * approves build vs buy; the config then becomes a discriminated union per provider
 * (e.g. `{ provider: 'bigbluebutton'; baseUrl; secret; checksumAlg }`). Per-tenant credentials are passed in by the caller.
 * Client components import `@edvora/integrations/live-class` types only, never the package root (node:crypto).
 */
export function createLiveClassProvider(cfg: LiveClassConfig): LiveClassProvider {
  switch (cfg.provider ?? 'mock') {
    case 'mock':
      return createMockLiveClassProvider({ mockRoomUrl: cfg.mockRoomUrl, secret: cfg.mockSecret ?? '' })
    default:
      throw new IntegrationError('live', `Unknown or not yet implemented LIVE_CLASS_PROVIDER: ${cfg.provider}`)
  }
}
