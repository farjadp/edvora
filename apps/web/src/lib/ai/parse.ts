/**
 * Knowledge-base file parsing (ADR 018), on the server: PDF (unpdf), Word .docx and Excel .xlsx (zip + XML via
 * fflate), CSV and plain text. Returns plain text; nothing is sent anywhere.
 */
import { strFromU8, unzipSync } from 'fflate'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_TEXT_CHARS = 400_000
export const ACCEPTED = '.pdf,.docx,.xlsx,.csv,.txt,.md'

export type ParseResult = { ok: true; text: string; kind: string } | { ok: false; error: string }

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

function utf8(buf: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  return text.replace(/^﻿/, '')
}

/** RFC 4180-ish CSV: quotes, escaped quotes, commas/newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',' || ch === ';' || ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** Rows as "header: value · header: value" lines, so each line stands on its own when retrieved. */
export function tableToText(rows: string[][]): string {
  if (rows.length === 0) return ''
  const [head, ...body] = rows
  if (!head || body.length === 0) return rows.map((r) => r.join(' | ')).join('\n')
  return body.map((r) => r.map((v, i) => (v.trim() ? `${(head[i] ?? `ستون ${i + 1}`).trim()}: ${v.trim()}` : '')).filter(Boolean).join(' · ')).join('\n')
}

export function docxText(files: Record<string, Uint8Array>): string {
  const xml = files['word/document.xml']
  if (!xml) throw new Error('not a Word document')
  const s = strFromU8(xml)
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
  return decodeEntities(s).replace(/\n{3,}/g, '\n\n').trim()
}

const colIndex = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? 'A')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

export function xlsxText(files: Record<string, Uint8Array>): string {
  const shared: string[] = []
  const ss = files['xl/sharedStrings.xml']
  if (ss) {
    for (const si of strFromU8(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(decodeEntities([...si[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
    }
  }
  const names = [...strFromU8(files['xl/workbook.xml'] ?? new Uint8Array()).matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => decodeEntities(m[1]!))
  const sheets = Object.keys(files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  if (sheets.length === 0) throw new Error('not an Excel workbook')
  const parts: string[] = []
  sheets.forEach((f, si) => {
    const rows: string[][] = []
    for (const r of strFromU8(files[f]!).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = []
      for (const c of r[1]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]!
        const inner = c[2] ?? ''
        const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1] ?? ''
        const type = attrs.match(/t="(\w+)"/)?.[1]
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        let val = ''
        if (type === 's' && v !== undefined) val = shared[Number(v)] ?? ''
        else if (type === 'inlineStr') val = decodeEntities([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
        else if (v !== undefined) val = decodeEntities(v)
        row[ref ? colIndex(ref) : row.length] = val
      }
      rows.push(Array.from(row, (x) => x ?? ''))
    }
    const text = tableToText(rows.filter((r) => r.some((c) => c.trim())))
    if (text) parts.push(`${names[si] ?? `برگه ${si + 1}`}\n${text}`)
  })
  return parts.join('\n\n')
}

/**
 * pdf.js refuses to run when Array.prototype has enumerable extras. drizzle-kit (loaded by Payload's dev schema
 * push) adds `Array.prototype.random` that way. Make such extras non-enumerable; they keep working.
 */
function hideArrayPrototypeExtras(): void {
  for (const key of Object.keys(Array.prototype)) {
    const d = Object.getOwnPropertyDescriptor(Array.prototype, key)
    if (d?.enumerable && d.configurable) Object.defineProperty(Array.prototype, key, { ...d, enumerable: false })
  }
}

async function pdfText(buf: Uint8Array): Promise<string> {
  hideArrayPrototypeExtras()
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(buf)
  const { text } = await extractText(pdf, { mergePages: false })
  return (Array.isArray(text) ? text : [text]).map((p) => p.trim()).filter(Boolean).join('\n\n')
}

function extensionOf(name: string): string {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
}

/** Extracts text from an uploaded file. Never throws: errors come back as `{ ok: false }` in Persian. */
export async function parseDocument(filename: string, buf: Uint8Array): Promise<ParseResult> {
  if (buf.byteLength === 0) return { ok: false, error: 'فایل خالی است.' }
  if (buf.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: 'حجم فایل بیش از ۱۰ مگابایت است.' }
  const ext = extensionOf(filename)
  try {
    let text: string
    switch (ext) {
      case 'pdf':
        text = await pdfText(buf)
        break
      case 'docx':
        text = docxText(unzipSync(buf))
        break
      case 'xlsx':
        text = xlsxText(unzipSync(buf))
        break
      case 'csv':
        text = tableToText(parseCsv(utf8(buf)))
        break
      case 'txt':
      case 'md':
        text = utf8(buf)
        break
      case 'doc':
      case 'xls':
        return { ok: false, error: 'قالب قدیمی Word/Excel پشتیبانی نمی‌شود؛ فایل را به ‎.docx یا ‎.xlsx ذخیره کنید.' }
      default:
        return { ok: false, error: 'این نوع فایل پشتیبانی نمی‌شود (PDF، Word، Excel، CSV یا متن).' }
    }
    text = text.replace(/\u0000/g, '').trim()
    if (!text) return { ok: false, error: ext === 'pdf' ? 'متنی در این PDF پیدا نشد (شاید تصویر اسکن‌شده است).' : 'متنی در این فایل پیدا نشد.' }
    if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS)
    return { ok: true, text, kind: ext }
  } catch (err) {
    console.error('[ai] document parse failed', err)
    return { ok: false, error: 'خواندن فایل ممکن نشد؛ شاید فایل خراب یا رمزدار است.' }
  }
}
