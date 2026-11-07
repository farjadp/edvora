import { IntegrationError } from '../errors'
import { createMockStorage } from './mock'
import { createS3Storage, ensureS3Bucket, type S3StorageOptions } from './s3'
import type { ObjectStorage } from './types'

export * from './types'
export { createMockStorage, createS3Storage, ensureS3Bucket }
export type { S3StorageOptions }

export type StorageConfig = ({ provider: 's3' } & S3StorageOptions) | { provider: 'mock' | undefined; mockBaseUrl?: string }

/** Picks object storage (E-017). Server code only: the S3 SDK must never reach a client bundle. */
export function createObjectStorage(cfg: StorageConfig): ObjectStorage {
  switch (cfg.provider) {
    case undefined:
    case 'mock':
      return createMockStorage({ mockBaseUrl: cfg.mockBaseUrl })
    case 's3':
      return createS3Storage(cfg)
    default: {
      const unknown: never = cfg
      throw new IntegrationError('storage', `Unknown STORAGE_PROVIDER: ${String((unknown as { provider?: unknown }).provider)}`)
    }
  }
}
