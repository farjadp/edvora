/**
 * Minimal HTML → Lexical (Payload rich text) converter for imported WordPress/Elementor content.
 * Supports paragraphs, h2–h4, lists, quotes, bold/italic/underline, links, line breaks and images (as Media uploads).
 * Everything else (iframes, scripts, forms, tables) is flattened to text or dropped, and reported via `dropped`.
 */
import { cleanPersianText } from '@edvora/core/persian'
import { randomBytes } from 'node:crypto'
import { parse, NodeType, type HTMLElement, type Node } from 'node-html-parser'

type LexicalNode = Record<string, unknown>
const BOLD = 1
const ITALIC = 2
const UNDERLINE = 8

export interface ConvertOptions {
  /** Called for each <img>; returns a Media id, or null to drop the image. */
  image: (src: string, alt: string) => Promise<number | null>
  /** Rewrites links (e.g. old-site post URLs → /journal/<slug>). */
  link?: (href: string) => string
}

export interface ConvertResult {
  root: { root: LexicalNode }
  dropped: string[]
  text: string
}

const block = (type: string, children: LexicalNode[], extra: Record<string, unknown> = {}): LexicalNode => ({
  type,
  format: '',
  indent: 0,
  version: 1,
  direction: 'rtl',
  children,
  ...extra,
})

/** Cleans a text run without eating the spaces that separate it from neighbouring inline nodes. */
function cleanInline(raw: string): string {
  const text = raw.replace(/\s+/g, ' ')
  if (!text.trim()) return text ? ' ' : ''
  const lead = /^\s/.test(text) ? ' ' : ''
  const trail = /\s$/.test(text) ? ' ' : ''
  return lead + cleanPersianText(text) + trail
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&zwnj;/g, '‌')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8230;/g, '…')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
}

export async function htmlToLexical(html: string, opts: ConvertOptions): Promise<ConvertResult> {
  const dropped: string[] = []
  const dom = parse(html, { comment: false, blockTextElements: { script: false, style: false, noscript: false } })
  const blocks: LexicalNode[] = []
  let inline: LexicalNode[] = []

  const flush = () => {
    const meaningful = inline.some((n) => n.type !== 'linebreak' && !(n.type === 'text' && !String(n.text).trim()))
    if (meaningful) {
      // Trim leading/trailing whitespace-only runs and breaks.
      while (inline[0] && (inline[0].type === 'linebreak' || (inline[0].type === 'text' && !String(inline[0].text).trim()))) inline.shift()
      while (inline.at(-1) && (inline.at(-1)!.type === 'linebreak' || (inline.at(-1)!.type === 'text' && !String(inline.at(-1)!.text).trim()))) inline.pop()
      const first = inline[0]
      if (first?.type === 'text') first.text = String(first.text).trimStart()
      const last = inline.at(-1)
      if (last?.type === 'text') last.text = String(last.text).trimEnd()
      blocks.push(block('paragraph', inline, { textFormat: 0, textStyle: '' }))
    }
    inline = []
  }

  async function inlineOf(node: Node, format: number, out: LexicalNode[]): Promise<void> {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = cleanInline(decode(node.rawText))
      if (text) out.push({ type: 'text', text, format, detail: 0, mode: 'normal', style: '', version: 1 })
      return
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName?.toLowerCase()
    if (tag === 'br') return void out.push({ type: 'linebreak', version: 1 })
    if (tag === 'strong' || tag === 'b') format |= BOLD
    if (tag === 'em' || tag === 'i') format |= ITALIC
    if (tag === 'u') format |= UNDERLINE
    if (tag === 'a' && el.getAttribute('href')) {
      const children: LexicalNode[] = []
      for (const c of el.childNodes) await inlineOf(c, format, children)
      const href = opts.link ? opts.link(el.getAttribute('href')!) : el.getAttribute('href')!
      if (children.length) out.push(block('link', children, { version: 3, fields: { url: href, newTab: false, linkType: 'custom' }, id: randomBytes(12).toString('hex') }))
      return
    }
    for (const c of el.childNodes) await inlineOf(c, format, out)
  }

  async function walk(node: Node): Promise<void> {
    if (node.nodeType === NodeType.TEXT_NODE) {
      await inlineOf(node, 0, inline)
      return
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName?.toLowerCase() ?? ''
    if (['script', 'style', 'noscript', 'form', 'input', 'button', 'svg', 'iframe', 'video', 'audio', 'object', 'embed'].includes(tag)) {
      if (tag === 'iframe' || tag === 'video') dropped.push(`${tag} ${el.getAttribute('src') ?? ''}`.trim())
      return
    }
    if (tag === 'img') {
      const src = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('src') || ''
      if (!src || src.startsWith('data:')) return
      flush()
      const id = await opts.image(src, cleanPersianText(decode(el.getAttribute('alt') ?? '')))
      if (id) blocks.push({ type: 'upload', relationTo: 'media', value: id, fields: null, format: '', version: 3, id: randomBytes(12).toString('hex') })
      else dropped.push(`img ${src}`)
      return
    }
    if (/^h[1-6]$/.test(tag)) {
      flush()
      const children: LexicalNode[] = []
      for (const c of el.childNodes) await inlineOf(c, 0, children)
      const level = Math.min(4, Math.max(2, Number(tag[1])))
      if (children.some((c) => String(c.text ?? '').trim())) blocks.push(block('heading', children, { tag: `h${level}` }))
      // Headings can wrap images in some themes.
      for (const img of el.querySelectorAll('img')) await walk(img)
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      flush()
      const items: LexicalNode[] = []
      let n = 1
      for (const li of el.childNodes) {
        if (li.nodeType !== NodeType.ELEMENT_NODE) continue
        const children: LexicalNode[] = []
        await inlineOf(li, 0, children)
        if (children.some((c) => String(c.text ?? '').trim() || c.type === 'link')) items.push(block('listitem', children, { value: n++ }))
      }
      if (items.length) blocks.push(block('list', items, { listType: tag === 'ol' ? 'number' : 'bullet', start: 1, tag }))
      return
    }
    if (tag === 'blockquote') {
      flush()
      const children: LexicalNode[] = []
      await inlineOf(el, 0, children)
      if (children.length) blocks.push(block('quote', children))
      return
    }
    const isBlock = ['p', 'div', 'section', 'article', 'figure', 'figcaption', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'header', 'footer', 'main', 'aside', 'center'].includes(tag)
    if (isBlock) flush()
    if (['a', 'strong', 'b', 'em', 'i', 'u', 'span', 'br', 'small', 'sup', 'sub', 'mark', 'font'].includes(tag) && !el.querySelector('img,p,div,ul,ol,h1,h2,h3,h4,h5,h6')) {
      await inlineOf(el, 0, inline)
      return
    }
    for (const c of el.childNodes) await walk(c)
    if (isBlock) flush()
  }

  for (const c of dom.childNodes) await walk(c)
  flush()

  const text = blocks
    .map((b) => ((b.children as LexicalNode[] | undefined) ?? []).map((c) => String(c.text ?? '')).join(''))
    .join('\n')
  return { root: { root: { type: 'root', format: '', indent: 0, version: 1, direction: 'rtl', children: blocks } }, dropped, text }
}

/** Plain text (no tags), cleaned. For excerpts. */
export function htmlToText(html: string): string {
  return cleanPersianText(decode(parse(html).textContent).replace(/\[…\]|\[&hellip;\]|…$/g, '').replace(/\s+/g, ' '))
}

/** Builds a Lexical document from plain paragraphs and headings (curated page content). */
export function blocksToLexical(blocks: { type: 'h2' | 'h3' | 'p' | 'li'; text: string }[]): { root: LexicalNode } {
  const out: LexicalNode[] = []
  const text = (t: string): LexicalNode => ({ type: 'text', text: cleanPersianText(t), format: 0, detail: 0, mode: 'normal', style: '', version: 1 })
  let list: LexicalNode[] | null = null
  for (const b of blocks) {
    if (!b.text?.trim()) continue
    if (b.type === 'li') {
      if (!list) {
        list = []
        out.push(block('list', list, { listType: 'bullet', start: 1, tag: 'ul' }))
      }
      list.push(block('listitem', [text(b.text)], { value: list.length + 1 }))
      continue
    }
    list = null
    if (b.type === 'p') out.push(block('paragraph', [text(b.text)], { textFormat: 0, textStyle: '' }))
    else out.push(block('heading', [text(b.text)], { tag: b.type }))
  }
  return { root: block('root', out) }
}
