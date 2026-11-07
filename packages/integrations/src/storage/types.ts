import type { Readable } from 'node:stream'

/**
 * Object storage (E-017). One private bucket per Edvora instance; keys are namespaced by tenant id.
 * Real: any S3-compatible service (ArvanCloud Object Storage in production, SeaweedFS locally). Mock: in memory.
 * Pick with `STORAGE_PROVIDER` (`mock` | `s3`).
 */
export type PutObjectInput = {
  key: string
  /** A Node stream (large recordings, uploaded in parts) or bytes. */
  body: Readable | Uint8Array
  contentType: string
  /** Known size in bytes, when available. */
  size?: number
}

export type StoredObject = { key: string; size: number; contentType?: string }

export interface ObjectStorage {
  readonly name: string
  putObject(input: PutObjectInput): Promise<StoredObject>
  /** Metadata, or null when the key doesn't exist. */
  headObject(key: string): Promise<StoredObject | null>
  /** Short-lived GET URL (default 300 s). Never put it in cached HTML. */
  signedGetUrl(key: string, opts?: { expiresInSec?: number; downloadName?: string }): Promise<string>
  deleteObject(key: string): Promise<void>
}

/** Keys are `<tenantId>/<area>/<rest>`: only digits, letters, `-`, `_`, `.` and `/` (no `..`). */
export function objectKey(tenantId: number, area: string, ...parts: (string | number)[]): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_')
  return [String(tenantId), clean(area), ...parts.map((p) => clean(String(p)))].join('/')
}
