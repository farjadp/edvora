/**
 * Knowledge-base helpers (ADR 018 §Learning): chunking, a local embedding, similarity and source citations.
 * Pure; the database and the providers live elsewhere.
 */
import { toLatinDigits } from '../digits'

export type Chunk = { ordinal: number; content: string }

/**
 * Splits text into ~`size`-character chunks on paragraph, then sentence, then word boundaries, with `overlap`
 * characters carried over so a fact split across a boundary is still found.
 */
export function chunkText(text: string, opts: { size?: number; overlap?: number; max?: number } = {}): Chunk[] {
  const size = opts.size ?? 900
  const overlap = Math.min(opts.overlap ?? 120, Math.floor(size / 3))
  const max = opts.max ?? 1000
  const clean = text.replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  const units = clean.split(/\n\n+/).flatMap((p) => (p.length <= size ? [p] : splitLong(p, size)))
  const chunks: Chunk[] = []
  let cur = ''
  for (const u of units) {
    if (cur && cur.length + u.length + 2 > size) {
      chunks.push({ ordinal: chunks.length, content: cur.trim() })
      if (chunks.length >= max) return chunks
      const tail = cur.slice(-overlap)
      const cut = tail.indexOf(' ')
      cur = (cut >= 0 ? tail.slice(cut + 1) : tail) + '\n\n' + u
    } else cur = cur ? `${cur}\n\n${u}` : u
  }
  if (cur.trim()) chunks.push({ ordinal: chunks.length, content: cur.trim() })
  return chunks.slice(0, max)
}

function splitLong(p: string, size: number): string[] {
  const sentences = p.split(/(?<=[.!?؟。])\s+|\n/)
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (s.length > size) {
      if (cur) out.push(cur)
      cur = ''
      for (let i = 0; i < s.length; i += size) {
        let piece = s.slice(i, i + size)
        const sp = piece.lastIndexOf(' ')
        if (sp > size * 0.6 && i + size < s.length) {
          piece = piece.slice(0, sp)
          i -= size - sp
        }
        out.push(piece)
      }
      continue
    }
    if (cur && cur.length + s.length + 1 > size) {
      out.push(cur)
      cur = s
    } else cur = cur ? `${cur} ${s}` : s
  }
  if (cur) out.push(cur)
  return out
}

/** Normalises Persian/Arabic letters and digits so «كتاب» and «کتاب», «۱۴» and «14» match. */
export function normalizeForSearch(text: string): string {
  return toLatinDigits(text)
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ً-ٰٟ]/g, '') // harakat
    .replace(/‌/g, ' ')
    .toLowerCase()
}

export const LOCAL_EMBEDDING_MODEL = 'local-hash-256'
const LOCAL_DIM = 256

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Local embedding (no outside call): hashed word unigrams + character trigrams, L2-normalised. Keyword-like, used
 * by the mock, with providers that have no embeddings API (Anthropic) and as the fallback when embedding fails.
 */
export function localEmbedding(text: string): number[] {
  const v = new Array<number>(LOCAL_DIM).fill(0)
  const words = normalizeForSearch(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1)
  for (const w of words) {
    v[fnv1a(`w:${w}`) % LOCAL_DIM]! += 2
    const padded = ` ${w} `
    for (let i = 0; i + 3 <= padded.length; i++) v[fnv1a(`t:${padded.slice(i, i + 3)}`) % LOCAL_DIM]! += 1
  }
  const norm = Math.hypot(...v)
  return norm === 0 ? v : v.map((x) => x / norm)
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}

export type SourceKind = 'document' | 'memory' | 'chat'
export type Source = { kind: SourceKind; id: string | number; title: string; content: string; score: number; href?: string | null }
export type Citation = { n: number; kind: SourceKind; id: string | number; title: string; href?: string | null }

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = { document: 'سند', memory: 'یادداشت حافظه', chat: 'گفت‌وگوی پیشین' }

/** Keeps the best sources above `minScore`, at most `k`, one passage per (kind, id, content). */
export function pickSources(candidates: readonly Source[], k = 6, minScore = 0.12): Source[] {
  const seen = new Set<string>()
  return [...candidates]
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const key = `${s.kind}:${s.id}:${s.content.slice(0, 80)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, k)
}

/** The numbered source block for the system prompt. Passages are cut to `maxChars` each. */
export function sourcesBlock(sources: readonly Source[], maxChars = 1500): string {
  if (sources.length === 0) return ''
  return sources
    .map((s, i) => `[${i + 1}] (${SOURCE_KIND_LABELS[s.kind]}: ${s.title})\n${s.content.length > maxChars ? `${s.content.slice(0, maxChars)}…` : s.content}`)
    .join('\n\n')
}

/** Citations actually used in the answer (`[2]`, `[۲]`, `[1, 3]`), in order of first use. Unknown numbers are ignored. */
export function citationsIn(answer: string, sources: readonly Source[]): Citation[] {
  const used: number[] = []
  for (const m of toLatinDigits(answer).matchAll(/\[(\d+(?:\s*[,،]\s*\d+)*)\]/g)) {
    for (const part of m[1]!.split(/[,،]/)) {
      const n = Number(part.trim())
      if (n >= 1 && n <= sources.length && !used.includes(n)) used.push(n)
    }
  }
  return used.map((n) => {
    const s = sources[n - 1]!
    return { n, kind: s.kind, id: s.id, title: s.title, href: s.href ?? null }
  })
}
