/**
 * Pure adapters between planner drafts and Payload documents (ADR 011 §Idempotency). No Payload import, unit-tested.
 *
 * - `toDocData` turns a draft's `fields` into Payload `data`: `{ $ref }`/`{ $id }` → ids, WordPress HTML → Lexical,
 *   fields Edvora has no column for are dropped, and a few are renamed (`pages.excerpt` → `intro`).
 * - `docValues` reads a stored doc back into the draft's field names, so `fieldsChecksum(docValues(doc), fields)` is
 *   computed the same way when a draft is written (`writtenChecksum`) and when a re-run checks for edits.
 */
import { fieldsChecksum, type EdvoraCollection } from '@edvora/integrations/wordpress'
import { htmlToLexical, type MediaResolver } from './htmlToLexical'

export type RefKeyParts = { siteId: string; kind: string; wpId: string }

/** `<siteId>:<kind>:<wpId>` (the wpId may itself contain `:`, `#` or `>`). */
export function parseRefKey(refKey: string): RefKeyParts | null {
  const a = refKey.indexOf(':')
  const b = a < 0 ? -1 : refKey.indexOf(':', a + 1)
  if (a <= 0 || b < 0 || b === refKey.length - 1) return null
  return { siteId: refKey.slice(0, a), kind: refKey.slice(a + 1, b), wpId: refKey.slice(b + 1) }
}

/** Collections the importer writes. `pages` came with E-030. */
export const WRITABLE: ReadonlySet<EdvoraCollection> = new Set<EdvoraCollection>([
  'users',
  'media',
  'courses',
  'lessons',
  'questions',
  'quizzes',
  'coupons',
  'orders',
  'enrollments',
  'certificates',
  'posts',
  'pages',
  'redirects',
])

/**
 * Draft fields carrying sanitised WordPress HTML → the E-031 rich-text (Lexical) field they are written to.
 * Covers every rich-text field the importer fills; the other E-031 fields (assignments, syllabus/FAQ, feedback, bio,
 * manifesto) have no WordPress source.
 */
const RICH_HTML: Partial<Record<EdvoraCollection, Readonly<Record<string, string>>>> = {
  posts: { bodyHtml: 'body' },
  pages: { bodyHtml: 'body' },
  lessons: { notesHtml: 'notes' },
  quizzes: { descriptionHtml: 'description' },
  questions: { explanationHtml: 'explanation' },
}

/** Draft fields never written as columns (kept on `import-refs` instead). `sourceUrl` is a column since E-030. */
const DROPPED: Partial<Record<EdvoraCollection, readonly string[]>> = {
  posts: ['bodyHtml'],
  media: ['filename', 'mimeType'],
  redirects: ['target'],
}

/** Draft field → Edvora field, where the names differ. */
const RENAMED: Partial<Record<EdvoraCollection, Readonly<Record<string, string>>>> = {
  pages: { excerpt: 'intro' },
}

export type Resolve = (refKey: string) => number | string | null

export class UnresolvedRef extends Error {
  constructor(public readonly refKey: string) {
    super(`Unresolved reference ${refKey}`)
    this.name = 'UnresolvedRef'
  }
}

/** Replaces relation markers recursively. Unresolvable soft refs are dropped; `strict` refs throw `UnresolvedRef`. */
export function resolveRelations(value: unknown, resolve: Resolve, strict: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => resolveRelations(v, resolve, strict)).filter((v) => v !== undefined)
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const o = value as Record<string, unknown>
    if (typeof o.$ref === 'string') {
      const id = resolve(o.$ref)
      if (id === null) {
        if (strict.has(o.$ref)) throw new UnresolvedRef(o.$ref)
        return undefined
      }
      return id
    }
    if ('$id' in o && (typeof o.$id === 'string' || typeof o.$id === 'number')) return o.$id
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(o)) {
      const r = resolveRelations(v, resolve, strict)
      if (r !== undefined) out[k] = r
    }
    // An array row whose only relation vanished (e.g. a quiz question that was skipped) is dropped by the caller.
    return out
  }
  return value
}

/** Payload `data` for a draft. Throws `UnresolvedRef` when a hard dependency has no Edvora doc. */
export function toDocData(
  collection: EdvoraCollection,
  fields: Record<string, unknown>,
  opts: { resolve: Resolve; dependsOn: readonly string[]; resolveMedia?: MediaResolver },
): Record<string, unknown> {
  const data = resolveRelations(fields, opts.resolve, new Set(opts.dependsOn)) as Record<string, unknown>
  for (const [htmlKey, field] of Object.entries(RICH_HTML[collection] ?? {})) {
    const html = typeof fields[htmlKey] === 'string' ? (fields[htmlKey] as string) : null
    delete data[htmlKey]
    const doc = htmlToLexical(html, opts.resolveMedia)
    if (doc) data[field] = doc
  }
  if (collection === 'quizzes' && Array.isArray(data.questions)) {
    data.questions = (data.questions as Record<string, unknown>[]).filter((row) => row.question !== undefined && row.question !== null)
  }
  if (collection === 'courses' && (data.price === null || data.price === undefined)) {
    // `price` is required; an LMS course without a price is imported as a 0-rial draft (warned in the dry run).
    data.price = 0
  }
  for (const [from, to] of Object.entries(RENAMED[collection] ?? {})) {
    if (from in data) {
      data[to] = data[from]
      delete data[from]
    }
  }
  for (const f of DROPPED[collection] ?? []) delete data[f]
  for (const [k, v] of Object.entries(data)) if (v === undefined) delete data[k]
  return data
}

/** Strips Payload-generated array row ids so the comparison only sees content. */
function stripRowIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripRowIds)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'id' && typeof v === 'string') continue
      out[k] = stripRowIds(v)
    }
    return out
  }
  return value
}

/** A depth-0 doc in the draft's field names (inverse of the renames in `toDocData`). */
export function docValues(collection: EdvoraCollection, doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(doc)) out[k] = stripRowIds(v)
  for (const [htmlKey, field] of Object.entries(RICH_HTML[collection] ?? {})) out[htmlKey] = out[field] ?? null
  for (const [from, to] of Object.entries(RENAMED[collection] ?? {})) out[from] = out[to] ?? null
  return out
}

export function docChecksum(collection: EdvoraCollection, doc: Record<string, unknown>, fields: readonly string[]): string {
  return fieldsChecksum(docValues(collection, doc), fields)
}

/** Set union of relation ids (progress never decreases on re-run, ADR 011 W11a). */
export function unionIds(current: unknown, incoming: unknown): (number | string)[] {
  const ids = (v: unknown): (number | string)[] =>
    Array.isArray(v)
      ? v.flatMap((x) => (typeof x === 'number' || typeof x === 'string' ? [x] : x && typeof x === 'object' && 'id' in x ? [(x as { id: number | string }).id] : []))
      : []
  const seen = new Set<string>()
  const out: (number | string)[] = []
  for (const id of [...ids(current), ...ids(incoming)]) {
    if (seen.has(String(id))) continue
    seen.add(String(id))
    out.push(id)
  }
  return out
}

/** Placeholder login email for an OTP student (same pattern as the site's own signup). */
export const placeholderEmail = (phone: string, tenantSlug: string) => `${phone}@phone.${tenantSlug}.edvora.local`
