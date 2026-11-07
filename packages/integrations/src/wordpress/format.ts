/**
 * Edvora WordPress export, format v1 — Zod schemas and constants. FORMAT.md (same folder) is the contract;
 * keep this file and the PHP plugin in step with it.
 */
import { z } from 'zod'

export const FORMAT_NAME = 'edvora-wp-export'
export const FORMAT_VERSION = 1
export const ENVELOPE_VERSION = 1

/** Push mode limits (FORMAT.md §2). */
export const CHUNK_MAX_RECORDS = 500
export const CHUNK_MAX_BYTES = 8 * 1024 * 1024
/** Request signature (FORMAT.md §5). */
export const SIGNATURE_WINDOW_SECONDS = 300
export const NONCE_TTL_SECONDS = 600
export const HEADER_CONNECTION = 'x-edvora-connection'
export const HEADER_TIMESTAMP = 'x-edvora-timestamp'
export const HEADER_NONCE = 'x-edvora-nonce'
export const HEADER_SIGNATURE = 'x-edvora-signature'
export const SIGNATURE_ALG = 'HMAC-SHA256'

/** Record kinds in export order (FORMAT.md §4) — dependencies first. */
export const RECORD_KINDS = [
  'wp.user',
  'wp.term',
  'wp.attachment',
  'wp.post',
  'woo.product',
  'woo.coupon',
  'woo.order',
  'woo.membership_plan',
  'woo.membership',
  'lifterlms.course',
  'lifterlms.section',
  'lifterlms.lesson',
  'lifterlms.quiz',
  'lifterlms.question',
  'lifterlms.access_plan',
  'lifterlms.coupon',
  'lifterlms.order',
  'lifterlms.transaction',
  'lifterlms.membership',
  'lifterlms.certificate',
  'lifterlms.user_meta',
  'tutor.course',
  'tutor.topic',
  'tutor.lesson',
  'tutor.quiz',
  'tutor.enrollment',
  'tutor.question',
  'tutor.progress',
] as const
export type RecordKind = (typeof RECORD_KINDS)[number]

export function isRecordKind(kind: string): kind is RecordKind {
  return (RECORD_KINDS as readonly string[]).includes(kind)
}

/** Prefix the plugin puts on unserialised PHP values re-encoded as JSON strings. */
export const JSON_META_PREFIX = 'json:'

const looseString = z.union([z.string(), z.number()]).transform((v) => String(v))

export const PluginInfoSchema = z.looseObject({
  slug: z.string().min(1),
  folder: z.string().optional(),
  version: z.string().optional().default(''),
  active: z.boolean().optional().default(true),
})

export const SiteInfoSchema = z.looseObject({
  siteId: z.string().min(1),
  homeUrl: z.string().min(1),
  siteUrl: z.string().optional(),
  name: z.string().optional(),
  wpVersion: z.string().nullable().optional(),
  phpVersion: z.string().nullable().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  gmtOffset: z.coerce.number().optional().default(0),
  permalinkStructure: z.string().optional().default(''),
  uploadsBaseUrl: z.string().optional(),
})

/** Manifest: loose (backwards-compatible additions are allowed by FORMAT.md), required core fields strict. */
export const ManifestSchema = z.looseObject({
  type: z.literal('manifest').optional(),
  format: z.literal(FORMAT_NAME),
  formatVersion: z.literal(FORMAT_VERSION),
  pluginVersion: z.string(),
  createdAtGmt: z.string(),
  connectionId: z.string(),
  tenantSlug: z.string(),
  site: SiteInfoSchema,
  plugins: z.array(PluginInfoSchema).default([]),
  theme: z.looseObject({ stylesheet: z.string().optional(), template: z.string().optional(), version: z.string().optional() }).nullable().optional(),
  woo: z.looseObject({ currency: z.string(), hpos: z.boolean().optional(), priceDecimals: z.coerce.number().optional() }).nullable().optional(),
  lifterlms: z.looseObject({ currency: z.string() }).nullable().optional(),
  tutor: z.looseObject({ currency: z.string(), monetizeBy: z.string().optional() }).nullable().optional(),
  counts: z.record(z.string(), z.number()).default({}),
})
export type Manifest = z.output<typeof ManifestSchema>
export type ManifestInput = z.input<typeof ManifestSchema>

const MetaValueSchema = z.union([z.string(), z.array(z.string())])

/** Record envelope: strict (unknown envelope keys are a contract violation); `data`/`meta`/`items` pass through. */
export const SourceRecordSchema = z.strictObject({
  type: z.literal('record'),
  v: z.literal(ENVELOPE_VERSION),
  kind: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
  wpId: looseString.pipe(z.string().min(1)),
  data: z.record(z.string(), z.unknown()),
  meta: z.record(z.string(), MetaValueSchema).optional(),
  rel: z.record(z.string(), z.array(looseString)).optional(),
  items: z.array(z.record(z.string(), z.unknown())).optional(),
})
export type SourceRecord = z.output<typeof SourceRecordSchema>

export const SignatureLineSchema = z.strictObject({
  type: z.literal('signature'),
  alg: z.literal(SIGNATURE_ALG),
  value: z.string().regex(/^[0-9a-f]{64}$/),
})
export type SignatureLine = z.output<typeof SignatureLineSchema>

/** `finish` body in push mode (FORMAT.md §2). */
export const PushFinishSchema = z.strictObject({
  chunks: z.record(z.string(), z.number().int().min(0)),
  counts: z.record(z.string(), z.number().int().min(0)),
})

/** Builds a record envelope (tests, fixtures, RestSource). */
export function makeRecord(
  kind: string,
  wpId: string | number,
  data: Record<string, unknown>,
  extra: { meta?: Record<string, string | string[]>; rel?: Record<string, string[]>; items?: Record<string, unknown>[] } = {},
): SourceRecord {
  const r: SourceRecord = { type: 'record', v: ENVELOPE_VERSION, kind, wpId: String(wpId), data }
  if (extra.meta) r.meta = extra.meta
  if (extra.rel) r.rel = extra.rel
  if (extra.items) r.items = extra.items
  return r
}

/** Decodes a `json:`-prefixed meta value; plain strings come back unchanged. */
export function decodeMetaJson(value: string | readonly string[] | null | undefined): unknown {
  const v = Array.isArray(value) ? value[0] : value
  if (typeof v !== 'string') return v ?? null
  if (!v.startsWith(JSON_META_PREFIX)) return v
  try {
    return JSON.parse(v.slice(JSON_META_PREFIX.length)) as unknown
  } catch {
    return null
  }
}
