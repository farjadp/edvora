/**
 * Idempotency checksums (ADR 011 §Idempotency): sha256 of canonical JSON (keys sorted, `undefined` dropped).
 * apps/web must use `fieldsChecksum` for `import-refs.writtenChecksum` and in `currentChecksum`, over values
 * read at depth 0 (relations as ids), so the comparison is like-for-like.
 */
import { sha256Hex } from './signature'

/** Bump when a mapper change should turn "unchanged" into "update" on the next run. */
export const MAPPING_VERSION = 2

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null'
    return JSON.stringify(value) ?? 'null'
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

export function checksum(value: unknown): string {
  return sha256Hex(canonicalJson(value))
}

/** Checksum of the named fields (missing → null), for `writtenChecksum` and conflict detection. */
export function fieldsChecksum(values: Record<string, unknown>, fields: readonly string[]): string {
  const picked: Record<string, unknown> = {}
  for (const f of [...fields].sort()) picked[f] = values[f] === undefined ? null : values[f]
  return checksum(picked)
}
