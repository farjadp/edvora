/** Small pure helpers shared by the stack mappers. */
import { RialConversionError, toRial, type Rial } from '@edvora/core/money'
import { metaValue, normalisePersianText, parseWpDateGmt } from '@edvora/core/wpimport'
import { toLatinDigits } from '@edvora/core/digits'
import { decodeMetaJson, type SourceRecord } from '../format'
import type { DraftRef, MapContext } from '../types'

export function str(r: SourceRecord | undefined, key: string): string | null {
  const v = r?.data[key]
  if (v === null || v === undefined) return null
  const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null
  return s === null || s.trim() === '' ? null : s
}

export function int(r: SourceRecord | undefined, key: string): number | null {
  const s = str(r, key)
  if (s === null) return null
  const n = Number(toLatinDigits(s))
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export function meta(r: SourceRecord | undefined, key: string): string | null {
  return metaValue(r?.meta, key)
}

export function metaJson(r: SourceRecord | undefined, key: string): unknown {
  const v = r?.meta?.[key]
  return v === undefined ? null : decodeMetaJson(v)
}

export function metaNum(r: SourceRecord | undefined, key: string): number | null {
  const s = meta(r, key)
  if (s === null) return null
  const n = Number(toLatinDigits(s))
  return Number.isFinite(n) ? n : null
}

export const isYes = (v: string | null) => v !== null && ['yes', '1', 'on', 'true'].includes(v.toLowerCase())

/** Persian-normalised, trimmed text or null. */
export function text(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = normalisePersianText(v).trim()
  return t === '' ? null : t
}

/** Decoded WP `post_name` (Persian slugs arrive URL-encoded), lower-case, Persian-normalised; title fallback. */
export function slugFrom(postName: string | null, title: string | null, wpId: string): string {
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  }
  const base = postName ? decode(postName) : (title ?? '')
  const slug = normalisePersianText(base)
    .toLowerCase()
    .replace(/[‌\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || `wp-${wpId}`
}

/** UTC ISO string from a WP date pair, or null. */
export function wpDate(ctx: MapContext, r: SourceRecord | undefined, gmtKey: string, localKey?: string): string | null {
  const d = parseWpDateGmt(str(r, gmtKey), localKey ? str(r, localKey) : null, ctx.manifest.site.gmtOffset)
  return d ? d.toISOString() : null
}

/** UTC ISO from a meta date ('Y-m-d H:i:s' GMT, or a unix timestamp). */
export function metaDate(ctx: MapContext, r: SourceRecord | undefined, key: string, assumeLocal = false): string | null {
  const v = meta(r, key)
  if (!v) return null
  if (/^\d{9,11}$/.test(v)) return new Date(Number(v) * 1000).toISOString()
  const d = assumeLocal ? parseWpDateGmt(null, v, ctx.manifest.site.gmtOffset) : parseWpDateGmt(v, null, 0)
  return d ? d.toISOString() : null
}

export type RialResult = { ok: true; value: Rial } | { ok: false; code: string }

export function rialOf(amount: string | null, currency: string | null | undefined): RialResult {
  if (amount === null) return { ok: false, code: 'invalid_amount' }
  try {
    return { ok: true, value: toRial(amount, currency ?? '') }
  } catch (e) {
    if (e instanceof RialConversionError) return { ok: false, code: e.code }
    throw e
  }
}

export function stripTags(html: string | null): string | null {
  if (!html) return null
  const out = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\[\/?[a-z][\w-]*[^\]]*\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text(out)
}

const SHORTCODE = /\[(\/?)([a-z][\w-]*)([^\]]*)\]/gi
/** VOD/embed hosts whose iframes survive sanitising (no runtime dependency outside Iran). */
const IFRAME_HOSTS = /^(https?:)?\/\/([a-z0-9-]+\.)*(aparat\.com|arvancloud\.ir|arvancloud\.com|r1c\.ir)\//i

/**
 * Conservative HTML clean-up for imported bodies: drops `<script>`, `<style>`, `on*=` handlers, `javascript:` URLs
 * and iframes outside the VOD allow-list; removes WP shortcodes and returns their names for a warning.
 * apps/web still converts the result to Lexical (which drops anything it does not know).
 */
export function sanitiseWpHtml(html: string | null): { html: string | null; shortcodes: string[] } {
  if (!html) return { html: null, shortcodes: [] }
  const shortcodes = new Set<string>()
  let out = html
    .replace(/<(script|style|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|object|embed)\b[^>]*\/?>/gi, '')
    .replace(/<iframe\b([^>]*)>([\s\S]*?)<\/iframe\s*>/gi, (all, attrs: string) => {
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? ''
      return IFRAME_HOSTS.test(src) ? all : ''
    })
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/<!--[\s\S]*?-->/g, '')
  out = out.replace(SHORTCODE, (_all, _close: string, name: string) => {
    shortcodes.add(name.toLowerCase())
    return ''
  })
  out = normalisePersianText(out).trim()
  return { html: out === '' ? null : out, shortcodes: [...shortcodes].sort() }
}

export type VideoInfo = {
  videoUrl: string | null
  videoStatus: 'none' | 'transfer' | 'external' | 'needs-action'
  provider: string | null
}

/** Classifies a lesson's video (W9b): DRM/players → needs-action stub, public hosts → external, files → transfer. */
export function classifyVideo(url: string | null, html: string | null): VideoInfo {
  const hay = `${url ?? ''}\n${html ?? ''}`.toLowerCase()
  if (/spotplayer|spot-player|\[spot/.test(hay)) return { videoUrl: null, videoStatus: 'needs-action', provider: 'spotplayer' }
  if (/presto[-_ ]?player|wp:presto|\[presto/.test(hay)) return { videoUrl: null, videoStatus: 'needs-action', provider: 'presto' }
  if (/skyroom/.test(hay)) return { videoUrl: null, videoStatus: 'needs-action', provider: 'skyroom' }
  if (!url) return { videoUrl: null, videoStatus: 'none', provider: null }
  const u = url.trim()
  if (/youtube\.com|youtu\.be/i.test(u)) return { videoUrl: u, videoStatus: 'external', provider: 'youtube' }
  if (/vimeo\.com/i.test(u)) return { videoUrl: u, videoStatus: 'external', provider: 'vimeo' }
  if (/aparat\.com/i.test(u)) return { videoUrl: u, videoStatus: 'external', provider: 'aparat' }
  if (/\.(mp4|m3u8|webm|mov|mkv)(\?|$)/i.test(u) || /arvancloud/i.test(u)) return { videoUrl: u, videoStatus: 'transfer', provider: 'file' }
  return { videoUrl: null, videoStatus: 'needs-action', provider: 'unknown' }
}

export function homeUrl(ctx: MapContext): string {
  return ctx.manifest.site.homeUrl.replace(/\/+$/, '')
}

/** Encodes each path segment the way WordPress links do (Persian slugs URL-encoded). */
export function sourceUrl(ctx: MapContext, path: string): string {
  return `${homeUrl(ctx)}/${path
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s).toLowerCase())
    .join('/')}/`
}

/** Collects every `$ref` in a value. */
export function refsIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) refsIn(v, out)
  else if (value && typeof value === 'object') {
    const ref = (value as { $ref?: unknown }).$ref
    if (typeof ref === 'string') out.push(ref)
    else for (const v of Object.values(value)) refsIn(v, out)
  }
  return out
}

/** `ctx.ref` for an attachment id when that attachment was exported, else undefined. */
export function mediaRef(ctx: MapContext, attachmentId: string | null): DraftRef | undefined {
  if (!attachmentId || attachmentId === '0') return undefined
  return ctx.index.get('wp.attachment', attachmentId) ? ctx.ref('wp.attachment', attachmentId) : undefined
}

export function sortBy<T>(list: readonly T[], ...keys: ((t: T) => number | string)[]): T[] {
  return [...list].sort((a, b) => {
    for (const k of keys) {
      const x = k(a)
      const y = k(b)
      if (x < y) return -1
      if (x > y) return 1
    }
    return 0
  })
}

export const numId = (r: SourceRecord) => Number(r.wpId) || 0

/** Display name of a WP user record. */
export function userDisplayName(u: SourceRecord | undefined): string | null {
  if (!u) return null
  const full = [meta(u, 'first_name') ?? meta(u, 'billing_first_name'), meta(u, 'last_name') ?? meta(u, 'billing_last_name')].filter(Boolean).join(' ')
  return text(full) ?? text(str(u, 'display_name'))
}

/** Synthetic key for one enrollment per (user, course): drafts from LMS, orders and memberships collapse. */
export function enrollmentWpId(ctx: MapContext, userWpId: string, course: DraftRef | { $id: string | number }): string {
  const courseKey = '$ref' in course ? course.$ref.slice(ctx.siteId.length + 1) : `id:${course.$id}`
  return `${userWpId}>${courseKey}`
}

/** Parses `<siteId>:<kind>:<wpId>` (wpId may itself contain `:`). */
export function parseRefKey(refKey: string): { siteId: string; kind: string; wpId: string } | null {
  const a = refKey.indexOf(':')
  const b = a < 0 ? -1 : refKey.indexOf(':', a + 1)
  if (a < 0 || b < 0) return null
  return { siteId: refKey.slice(0, a), kind: refKey.slice(a + 1, b), wpId: refKey.slice(b + 1) }
}

/** Ids from a meta value that may be `json:[1,2]`, `json:{"0":1}`, `1,2` or repeated keys. */
export function metaIds(r: SourceRecord | undefined, key: string): string[] {
  const raw = r?.meta?.[key]
  if (raw === undefined) return []
  const values = Array.isArray(raw) ? raw : [raw]
  const out: string[] = []
  for (const v of values) {
    const decoded = decodeMetaJson(v)
    if (Array.isArray(decoded)) out.push(...decoded.map(String))
    else if (decoded && typeof decoded === 'object') out.push(...Object.values(decoded).map(String))
    else if (typeof decoded === 'string' || typeof decoded === 'number') out.push(...String(decoded).split(/[,\s]+/))
  }
  return [...new Set(out.map((x) => x.trim()).filter((x) => /^\d+$/.test(x) && x !== '0'))]
}
