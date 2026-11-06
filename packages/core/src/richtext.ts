/**
 * Rich text (Payload Lexical JSON) helpers. Pure, framework-free, safe for client components
 * (import from `@edvora/core/richtext`).
 *
 * - `plainTextToLexical` / `toLexical`: legacy plain text → Lexical (paragraph per blank-line block, line breaks kept).
 * - `lexicalToPlainText`: Lexical → plain text for meta descriptions, JSON-LD, search, SMS/email, previews.
 * - `collectLexicalRefs` / `crossTenantRefs`: find uploads and internal links that point at another academy.
 */

export type LexicalNode = {
  type: string
  version?: number
  children?: LexicalNode[]
  text?: string
  [key: string]: unknown
}

export type LexicalDoc = {
  root: LexicalNode & { type: 'root'; children: LexicalNode[] }
  [key: string]: unknown
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** True for a Payload Lexical document (`{ root: { type: 'root', children: [...] } }`). */
export function isLexicalDoc(value: unknown): value is LexicalDoc {
  if (!isObject(value) || !isObject(value.root)) return false
  return value.root.type === 'root' && Array.isArray(value.root.children)
}

/** A string that holds serialised Lexical JSON (e.g. imported as text by mistake) → the parsed doc, else null. */
export function parseLexicalString(value: string): LexicalDoc | null {
  const s = value.trim()
  if (!s.startsWith('{') || !s.includes('"root"')) return null
  try {
    const parsed: unknown = JSON.parse(s)
    return isLexicalDoc(parsed) ? parsed : null
  } catch {
    return null
  }
}

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/
const LTR = /[A-Za-zÀ-ɏ]/

/** Direction of the first strong character, as Lexical stores it on blocks. */
export function textDirection(text: string): 'rtl' | 'ltr' | null {
  for (const ch of text) {
    if (RTL.test(ch)) return 'rtl'
    if (LTR.test(ch)) return 'ltr'
  }
  return null
}

const textNode = (text: string): LexicalNode => ({ type: 'text', version: 1, text, format: 0, style: '', mode: 'normal', detail: 0 })
const linebreak = (): LexicalNode => ({ type: 'linebreak', version: 1 })

function paragraph(block: string): LexicalNode {
  const children: LexicalNode[] = []
  block.split('\n').forEach((line, i) => {
    if (i > 0) children.push(linebreak())
    if (line !== '') children.push(textNode(line))
  })
  return { type: 'paragraph', version: 1, children, direction: textDirection(block), format: '', indent: 0, textFormat: 0, textStyle: '' }
}

/** Splits plain text into blocks: one or more blank lines separate paragraphs. CRLF is normalised. */
export function plainTextBlocks(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n\s*/)
    .map((b) => b.replace(/^\n+|\n+$/g, ''))
    .filter((b) => b.trim() !== '')
}

/** Plain text → Lexical document. Empty / whitespace-only text → null. */
export function plainTextToLexical(text: string): LexicalDoc | null {
  const blocks = plainTextBlocks(text)
  if (blocks.length === 0) return null
  const children = blocks.map(paragraph)
  return { root: { type: 'root', version: 1, children, direction: textDirection(text), format: '', indent: 0 } }
}

/**
 * Anything a converted field may hold → Lexical or null. Idempotent: Lexical docs pass through untouched,
 * serialised Lexical strings are parsed, other strings are converted as plain text.
 */
export function toLexical(value: unknown): LexicalDoc | null {
  if (value == null) return null
  if (isLexicalDoc(value)) return value
  if (typeof value === 'string') return parseLexicalString(value) ?? plainTextToLexical(value)
  return null
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'quote', 'listitem', 'list', 'table', 'tablerow', 'horizontalrule', 'upload', 'relationship', 'block'])

function nodeText(node: LexicalNode): string {
  switch (node.type) {
    case 'text':
      return typeof node.text === 'string' ? node.text : ''
    case 'linebreak':
      return '\n'
    case 'tab':
      return '\t'
    case 'tablecell':
      return (node.children ?? []).map(nodeText).join('').trim()
    case 'tablerow':
      return (node.children ?? []).map(nodeText).join(' | ')
    case 'upload': {
      const v = node.value
      return isObject(v) && typeof v.alt === 'string' ? v.alt : ''
    }
    default:
      break
  }
  const children = node.children ?? []
  if (node.type === 'list' || node.type === 'table') return children.map(nodeText).filter(Boolean).join('\n')
  if (node.type === 'listitem') {
    // A nested list inside a list item goes on its own lines.
    return children.map((c) => (c.type === 'list' ? `\n${nodeText(c)}` : nodeText(c))).join('')
  }
  const sep = children.some((c) => BLOCK_TYPES.has(c.type)) ? '\n\n' : ''
  return children
    .map(nodeText)
    .filter((t) => sep === '' || t !== '')
    .join(sep)
}

/**
 * Lexical (or legacy plain text) → plain text. Blocks are separated by a blank line, line breaks are kept,
 * so `lexicalToPlainText(plainTextToLexical(t))` returns the trimmed text with blank-line runs collapsed.
 */
export function lexicalToPlainText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    const parsed = parseLexicalString(value)
    return parsed ? lexicalToPlainText(parsed) : value
  }
  if (!isLexicalDoc(value)) return ''
  return nodeText(value.root).trim()
}

/** First `max` characters of the plain text on one line (for meta descriptions, list previews, SMS). */
export function lexicalExcerpt(value: unknown, max = 160): string {
  const flat = lexicalToPlainText(value).replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1).trimEnd()}…`
}

export type LexicalRef = { kind: 'upload' | 'relationship' | 'link'; relationTo: string; id: string | number }

const refId = (v: unknown): string | number | null => {
  if (typeof v === 'string' || typeof v === 'number') return v
  if (isObject(v) && (typeof v.id === 'string' || typeof v.id === 'number')) return v.id
  return null
}

/** Every document a Lexical value points at: upload nodes, relationship nodes and internal links. */
export function collectLexicalRefs(value: unknown): LexicalRef[] {
  const doc = toLexical(value)
  if (!doc) return []
  const out: LexicalRef[] = []
  const walk = (node: LexicalNode) => {
    if ((node.type === 'upload' || node.type === 'relationship') && typeof node.relationTo === 'string') {
      const id = refId(node.value)
      if (id !== null) out.push({ kind: node.type, relationTo: node.relationTo, id })
    }
    if ((node.type === 'link' || node.type === 'autolink') && isObject(node.fields) && node.fields.linkType === 'internal') {
      const target = node.fields.doc
      if (isObject(target) && typeof target.relationTo === 'string') {
        const id = refId(target.value)
        if (id !== null) out.push({ kind: 'link', relationTo: target.relationTo, id })
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(doc.root)
  return out
}

export type TenantId = string | number

/**
 * Refs that leave the allowed academies. `tenantOf(ref)` returns the target's tenant (null when the target has no
 * tenant or does not exist). A ref in a tenant-scoped collection is allowed only when its tenant is in `allowed`;
 * a missing target or an un-owned record in a scoped collection is refused too (fail closed).
 */
export function crossTenantRefs(
  refs: LexicalRef[],
  tenantOf: (ref: LexicalRef) => TenantId | null | undefined,
  allowed: TenantId[],
  scopedCollections: readonly string[],
): LexicalRef[] {
  const ok = new Set(allowed.map(String))
  return refs.filter((ref) => {
    if (!scopedCollections.includes(ref.relationTo)) return false
    const t = tenantOf(ref)
    return t == null || !ok.has(String(t))
  })
}
