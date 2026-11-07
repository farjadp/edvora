/**
 * Where a job's records come from: a verified bundle in private storage, chunks the plugin pushed (stored by the push
 * API), or the REST fallback. `withPhoneOverrides` lets an admin release a held user by entering a phone: the phone
 * is injected as the highest-priority phone meta (`digits_phone`) before planning, so the mappers stay pure.
 */
import {
  BundleSource,
  MemorySource,
  RestSource,
  SourceRecordSchema,
  type Manifest,
  type ManifestInput,
  type ReadResult,
  type RestSourceConfig,
  type SourceRecord,
  type WordPressSource,
} from '@edvora/integrations/wordpress'
import { listChunks, readStored, streamStored } from './storage'

/** One NDJSON chunk → records (the envelope `type` may be omitted by older clients). */
export function parseChunk(text: string): SourceRecord[] {
  const out: SourceRecord[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    out.push(SourceRecordSchema.parse({ type: 'record', ...(JSON.parse(line) as object) }))
  }
  return out
}

/** Push mode: the manifest + every stored chunk of the job's directory, re-validated record by record. */
export async function pushedSource(manifest: ManifestInput | Manifest, dir: string): Promise<WordPressSource> {
  const records: SourceRecord[] = []
  for (const c of await listChunks(dir)) records.push(...parseChunk((await readStored(c.file)).toString('utf8')))
  return new MemorySource(manifest, records)
}

export async function bundleSource(file: string, secret: string): Promise<BundleSource> {
  return BundleSource.open(streamStored(file), secret)
}

export function restSource(config: RestSourceConfig): RestSource {
  return new RestSource(config)
}

/** Applies admin-entered phones to `wp.user` records (meta `digits_phone`, which the phone picker reads first). */
export function withPhoneOverrides(source: WordPressSource, overrides: Record<string, string> | undefined): WordPressSource {
  if (!overrides || Object.keys(overrides).length === 0) return source
  const patch = (r: SourceRecord): SourceRecord => {
    const phone = r.kind === 'wp.user' ? overrides[r.wpId] : undefined
    return phone ? { ...r, meta: { ...(r.meta ?? {}), digits_phone: phone } } : r
  }
  return {
    manifest: () => source.manifest(),
    read: async (kind: string, cursor: string | null, limit: number): Promise<ReadResult> => {
      const page = await source.read(kind, cursor, limit)
      return kind === 'wp.user' ? { ...page, records: page.records.map(patch) } : page
    },
    missingKinds: source.missingKinds ? () => source.missingKinds!() : undefined,
  }
}
