import { IntegrationError } from '../errors'
import { createBigBlueButtonProvider, type BbbChecksumAlgorithm } from './bigbluebutton'
import { createMockLiveClassProvider } from './mock'
import type { LiveClassProvider } from './types'

export * from './types'
export { LiveEventSchema, LiveRoleSchema } from './schema'
export { createMockLiveClassProvider, createBigBlueButtonProvider }
export type { MockLiveClassProvider } from './mock'
export type { BbbChecksumAlgorithm, BigBlueButtonOptions, WebhookKind } from './bigbluebutton'

export type LiveClassConfig =
  | {
      provider: 'mock' | undefined
      /** Mock only: the app page that stands in for the classroom. */
      mockRoomUrl: string
      mockSecret?: string
    }
  | {
      provider: 'bigbluebutton'
      /** `https://<host>/bigbluebutton/` or `…/bigbluebutton/api`. */
      baseUrl: string
      secret: string
      /** Default sha256; must be in the server's `supportedChecksumAlgorithms`. */
      checksumAlgorithm?: BbbChecksumAlgorithm
    }

/**
 * Picks the live-class provider (ADR 012): `mock` (default) or `bigbluebutton`.
 * Credentials are passed in by the caller (one BBB server per Edvora instance).
 * Client components import `@edvora/integrations/live-class` types only, never the package root (node:crypto).
 */
export function createLiveClassProvider(cfg: LiveClassConfig): LiveClassProvider {
  switch (cfg.provider) {
    case undefined:
    case 'mock':
      return createMockLiveClassProvider({ mockRoomUrl: cfg.mockRoomUrl, secret: cfg.mockSecret ?? '' })
    case 'bigbluebutton':
      return createBigBlueButtonProvider({ baseUrl: cfg.baseUrl, secret: cfg.secret, checksumAlgorithm: cfg.checksumAlgorithm })
    default: {
      const unknown: never = cfg
      throw new IntegrationError('live', `Unknown or not yet implemented LIVE_CLASS_PROVIDER: ${String((unknown as { provider?: unknown }).provider)}`)
    }
  }
}
