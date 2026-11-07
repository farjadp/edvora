/**
 * Minimal, safe HTML → Payload Lexical conversion for imported WordPress content (ADR 011 §Persian normalisation).
 * Pure (no DOM, no deps). Only an allow-list of tags becomes nodes; every attribute is dropped except a safe `href`
 * on links and `src`/`alt` on images. Scripts, styles, iframes, forms and comments are removed with their content.
 *
 * `resolveMedia(url)` maps an image or link URL (usually `…/wp-content/uploads/…`) to an imported Edvora media doc:
 * images become `upload` nodes, links are rewritten to the media URL. Unknown images are dropped (never hot-linked).
 */
import { textDirection, type LexicalDoc, type LexicalNode } from '@edvora/core/richtext'

export type MediaResolver = (url: string) => { id: number | string; url: string } | null

type El = { tag: string; attrs: Record<string, string>; children: Child[] }
type Child = El | string

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track'])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'form', 'select', 'textarea', 'button', 'svg', 'math', 'video', 'audio', 'canvas', 'head', 'title'])
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'hr', 'pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'address', 'center'])

const FORMAT: Record<string, number> = { strong: 1, b: 1, em: 2, i: 2, s: 4, del: 4, strike: 4, u: 8, ins: 8, code: 16, kbd: 16, samp: 16, sub: 32, sup: 64, mark: 128 }

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '‌', zwj: '‍', rlm: '‏', lrm: '‎',
  hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', bull: '•', copy: '©', reg: '®', times: '×',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return ''
      return String.fromCodePoint(n)
    }
    return NAMED[code.toLowerCase()] ?? all
  })
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const name = m[1]!.toLowerCase()
    if (name === 'href' || name === 'src' || name === 'alt' || name === 'start') out[name] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '')
  }
  return out
}

/** Tolerant tokenizer → tree. Unknown closing tags are ignored; unclosed tags close at their parent's end. */
export function parseHtml(html: string): El {
  const root: El = { tag: '#root', attrs: {}, children: [] }
  const stack: El[] = [root]
  const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<!doctype[^>]*>/gi, '')
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let last = 0
  let m: RegExpExecArray | null
  let dropping: string | null = null
  while ((m = re.exec(src))) {
    const text = src.slice(last, m.index)
    last = re.lastIndex
    const closing = m[1] === '/'
    const tag = m[2]!.toLowerCase()
    if (dropping) {
      if (closing && tag === dropping) dropping = null
      continue
    }
    if (text) stack[stack.length - 1]!.children.push(decodeEntities(text))
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!closing && !VOID.has(tag) && !/\/\s*$/.test(m[3] ?? '')) dropping = tag
      continue
    }
    if (closing) {
      const idx = stack.map((e) => e.tag).lastIndexOf(tag)
      if (idx > 0) stack.length = idx
      continue
    }
    const el: El = { tag, attrs: parseAttrs(m[3] ?? ''), children: [] }
    // A new <p>/<li> closes an open one of the same kind (common in hand-written WP HTML).
    if (tag === 'p' || tag === 'li') {
      const idx = stack.map((e) => e.tag).lastIndexOf(tag)
      const boundary = Math.max(stack.map((e) => e.tag).lastIndexOf('ul'), stack.map((e) => e.tag).lastIndexOf('ol'), stack.map((e) => e.tag).lastIndexOf('blockquote'))
      if (idx > 0 && idx > boundary) stack.length = idx
    }
    stack[stack.length - 1]!.children.push(el)
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3] ?? '')) stack.push(el)
  }
  if (!dropping) {
    const rest = src.slice(last)
    if (rest) stack[stack.length - 1]!.children.push(decodeEntities(rest))
  }
  return root
}

/** Only http(s), mailto, tel and same-site relative URLs survive. */
export function safeHref(href: string | undefined): string | null {
  if (!href) return null
  const v = href.trim()
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v
  if (/^\/(?!\/)/.test(v) || v.startsWith('#')) return v
  return null
}

const text = (t: string, format: number): LexicalNode => ({ type: 'text', version: 1, text: t, format, style: '', mode: 'normal', detail: 0 })
const block = (type: string, children: LexicalNode[], extra: Record<string, unknown> = {}): LexicalNode => {
  const plain = children.map((c) => (typeof c.text === 'string' ? c.text : '')).join('')
  return { type, version: 1, children, direction: textDirection(plain), format: '', indent: 0, ...extra }
}
let uploadSeq = 0
const uploadNode = (id: number | string): LexicalNode => ({ type: 'upload', version: 3, format: '', id: `wpimg${(uploadSeq++).toString(36)}`, fields: null, relationTo: 'media', value: id })

type Ctx = { resolve?: MediaResolver; pre: boolean }

/** Inline content → Lexical inline nodes; images found inline are returned separately (they are blocks in Lexical). */
function inline(children: Child[], format: number, ctx: Ctx, out: LexicalNode[], images: LexicalNode[]): void {
  for (const c of children) {
    if (typeof c === 'string') {
      const t = ctx.pre ? c : c.replace(/[\t\n\r\f ]+/g, ' ')
      if (t) out.push(text(t, format))
      continue
    }
    if (c.tag === 'br') {
      out.push({ type: 'linebreak', version: 1 })
      continue
    }
    if (c.tag === 'img') {
      const media = c.attrs.src ? ctx.resolve?.(c.attrs.src) : null
      if (media) images.push(uploadNode(media.id))
      continue
    }
    if (c.tag === 'a') {
      let href = safeHref(c.attrs.href)
      const media = href && ctx.resolve ? ctx.resolve(href) : null
      if (media) href = media.url
      const kids: LexicalNode[] = []
      inline(c.children, format, ctx, kids, images)
      if (!kids.length) continue
      if (!href) out.push(...kids)
      else out.push({ type: 'link', version: 3, children: kids, direction: null, format: '', indent: 0, fields: { linkType: 'custom', url: href, newTab: false } })
      continue
    }
    if (BLOCK.has(c.tag)) {
      // Block inside inline context (bad nesting): flatten with a line break.
      if (out.length) out.push({ type: 'linebreak', version: 1 })
      inline(c.children, format, ctx, out, images)
      continue
    }
    inline(c.children, format | (FORMAT[c.tag] ?? 0), ctx, out, images)
  }
}

/** Trims whitespace at the edges of a block and drops empty text nodes. */
function tidy(nodes: LexicalNode[]): LexicalNode[] {
  const out = nodes.filter((n) => n.type !== 'text' || (n.text ?? '') !== '')
  while (out[0]?.type === 'linebreak') out.shift()
  while (out[out.length - 1]?.type === 'linebreak') out.pop()
  const first = out[0]
  if (first?.type === 'text') first.text = (first.text ?? '').replace(/^[  ]+/, '')
  const last = out[out.length - 1]
  if (last?.type === 'text') last.text = (last.text ?? '').replace(/[  ]+$/, '')
  return out.filter((n) => n.type !== 'text' || (n.text ?? '') !== '')
}

const hasText = (nodes: LexicalNode[]) => nodes.some((n) => (n.type === 'text' && (n.text ?? '').trim() !== '') || n.type === 'link')

function blocks(children: Child[], ctx: Ctx, out: LexicalNode[]): void {
  let pending: Child[] = []
  const flush = (type = 'paragraph', extra: Record<string, unknown> = {}) => {
    if (!pending.length) return
    const nodes: LexicalNode[] = []
    const images: LexicalNode[] = []
    inline(pending, 0, ctx, nodes, images)
    pending = []
    const kids = tidy(nodes)
    if (hasText(kids)) out.push(block(type, kids, type === 'paragraph' ? { textFormat: 0, textStyle: '' } : extra))
    out.push(...images)
  }
  for (const c of children) {
    if (typeof c === 'string' || !BLOCK.has(c.tag)) {
      pending.push(c)
      continue
    }
    flush()
    const tag = c.tag
    if (/^h[1-6]$/.test(tag)) {
      pending = c.children
      flush('heading', { tag: tag === 'h1' || tag === 'h2' ? 'h2' : tag === 'h3' ? 'h3' : 'h4' })
    } else if (tag === 'p' || tag === 'figcaption' || tag === 'dt' || tag === 'dd' || tag === 'address' || tag === 'td' || tag === 'th') {
      pending = c.children
      if (c.children.some((x) => typeof x !== 'string' && BLOCK.has(x.tag))) {
        pending = []
        blocks(c.children, ctx, out)
      } else flush()
    } else if (tag === 'blockquote') {
      const inner: LexicalNode[] = []
      blocks(c.children, ctx, inner)
      const kids: LexicalNode[] = []
      for (const n of inner) {
        if (n.type === 'upload') out.push(n)
        else {
          if (kids.length) kids.push({ type: 'linebreak', version: 1 })
          kids.push(...(n.children ?? []))
        }
      }
      if (hasText(kids)) out.push(block('quote', kids))
    } else if (tag === 'ul' || tag === 'ol') {
      const list = listNode(c, ctx, out)
      if (list) out.push(list)
    } else if (tag === 'hr') {
      out.push({ type: 'horizontalrule', version: 1 })
    } else if (tag === 'pre') {
      pending = c.children
      const prev = ctx.pre
      ctx.pre = true
      flush()
      ctx.pre = prev
    } else if (tag === 'table' || tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      blocks(c.children, ctx, out)
    } else if (tag === 'tr') {
      // Tables are flattened to one paragraph per row ("a | b"); layout is rebuilt by hand if needed.
      const cells = c.children.filter((x): x is El => typeof x !== 'string' && (x.tag === 'td' || x.tag === 'th'))
      const parts: Child[] = []
      cells.forEach((cell, i) => {
        if (i > 0) parts.push(' | ')
        parts.push(...cell.children)
      })
      pending = parts
      flush()
    } else {
      blocks(c.children, ctx, out)
    }
  }
  flush()
}

function listNode(el: El, ctx: Ctx, outer: LexicalNode[]): LexicalNode | null {
  const ordered = el.tag === 'ol'
  const items: LexicalNode[] = []
  let n = 1
  for (const c of el.children) {
    if (typeof c === 'string') continue
    if (c.tag !== 'li') continue
    const nodes: LexicalNode[] = []
    const images: LexicalNode[] = []
    const nested: LexicalNode[] = []
    inline(c.children.filter((x) => typeof x === 'string' || (x.tag !== 'ul' && x.tag !== 'ol')), 0, ctx, nodes, images)
    for (const x of c.children) if (typeof x !== 'string' && (x.tag === 'ul' || x.tag === 'ol')) {
      const sub = listNode(x, ctx, outer)
      if (sub) nested.push(sub)
    }
    outer.push(...images)
    const kids = tidy(nodes)
    if (!hasText(kids) && !nested.length) continue
    items.push({ ...block('listitem', [...kids, ...nested]), value: n++ })
  }
  if (!items.length) return null
  return { ...block('list', items), listType: ordered ? 'number' : 'bullet', tag: ordered ? 'ol' : 'ul', start: 1 }
}

/** HTML → Lexical document, or null when nothing readable is left. */
export function htmlToLexical(html: string | null | undefined, resolveMedia?: MediaResolver): LexicalDoc | null {
  if (!html || !html.trim()) return null
  const tree = parseHtml(html)
  const children: LexicalNode[] = []
  blocks(tree.children, { resolve: resolveMedia, pre: false }, children)
  if (!children.length) return null
  const plain = children.flatMap((c) => c.children ?? []).map((c) => (typeof c.text === 'string' ? c.text : '')).join(' ')
  return { root: { type: 'root', version: 1, children, direction: textDirection(plain), format: '', indent: 0 } }
}
