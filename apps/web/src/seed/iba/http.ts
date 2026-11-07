/**
 * Polite, cached fetcher for the IBA site import (E-030).
 *  - one request at a time, at least IBA_IMPORT_DELAY_MS (default 1500 ms) apart
 *  - honours robots.txt Disallow rules for "*"
 *  - every response is cached on disk (apps/web/.cache/iba-import, git-ignored), so re-runs hit the site only for
 *    new URLs. IBA_IMPORT_OFFLINE=1 fails instead of fetching.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SITE = 'https://iranbrandacademy.com'
const USER_AGENT = 'EdvoraContentImport/1.0 (content migration for Iran Brand Academy)'
const dirname = path.dirname(fileURLToPath(import.meta.url))
export const CACHE_DIR = path.resolve(dirname, '../../../.cache/iba-import')
const DELAY_MS = Number(process.env.IBA_IMPORT_DELAY_MS ?? 1500)
const OFFLINE = process.env.IBA_IMPORT_OFFLINE === '1'

let lastRequestAt = 0
let disallowed: string[] | null = null
export const stats = { network: 0, cached: 0 }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const keyOf = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 32)

async function politeFetch(url: string): Promise<Response> {
  const wait = lastRequestAt + DELAY_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
  stats.network++
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' })
  return res
}

async function robotsAllows(url: string): Promise<boolean> {
  if (!url.startsWith(SITE)) return true
  if (disallowed === null) {
    const txt = (await getText(`${SITE}/robots.txt`, { skipRobots: true })) ?? ''
    disallowed = []
    let applies = false
    for (const raw of txt.split('\n')) {
      const line = raw.trim()
      const [k, ...rest] = line.split(':')
      const v = rest.join(':').trim()
      if (/^user-agent$/i.test(k ?? '')) applies = v === '*'
      else if (applies && /^disallow$/i.test(k ?? '') && v) disallowed.push(v)
    }
  }
  const p = decodeURI(new URL(url).pathname)
  return !disallowed.some((d) => p.startsWith(d))
}

async function cached(url: string, ext: string): Promise<{ file: string; hit: boolean }> {
  await mkdir(CACHE_DIR, { recursive: true })
  const file = path.join(CACHE_DIR, `${keyOf(url)}${ext}`)
  try {
    await readFile(file)
    return { file, hit: true }
  } catch {
    return { file, hit: false }
  }
}

/** HTML or JSON as text. Returns null on 404/robots-blocked. */
export async function getText(url: string, opts: { skipRobots?: boolean } = {}): Promise<string | null> {
  const { file, hit } = await cached(url, '.txt')
  if (hit) {
    stats.cached++
    const body = await readFile(file, 'utf8')
    return body === '\u0000404' ? null : body
  }
  if (OFFLINE) throw new Error(`Not cached (IBA_IMPORT_OFFLINE=1): ${url}`)
  if (!opts.skipRobots && !(await robotsAllows(url))) {
    console.warn(`robots.txt disallows ${url} — skipped`)
    return null
  }
  const res = await politeFetch(url)
  if (res.status === 404) {
    await writeFile(file, '\u0000404')
    return null
  }
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  const body = await res.text()
  await writeFile(file, body)
  return body
}

export async function getJson<T>(url: string): Promise<T | null> {
  const t = await getText(url)
  return t === null ? null : (JSON.parse(t) as T)
}

/** Binary download (images, PDFs) to the cache. Returns the cached file path and content type. */
export async function getFile(url: string): Promise<{ file: string; mimeType: string } | null> {
  const ext = path.extname(new URL(url).pathname).toLowerCase() || '.bin'
  const { file, hit } = await cached(url, ext)
  const metaFile = `${file}.mime`
  if (hit) {
    stats.cached++
    const mimeType = await readFile(metaFile, 'utf8').catch(() => mimeFromExt(ext))
    return mimeType === '404' ? null : { file, mimeType }
  }
  if (OFFLINE) throw new Error(`Not cached (IBA_IMPORT_OFFLINE=1): ${url}`)
  if (!(await robotsAllows(url))) return null
  const res = await politeFetch(url)
  if (res.status === 404) {
    await writeFile(file, '')
    await writeFile(metaFile, '404')
    return null
  }
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  const mimeType = (res.headers.get('content-type') ?? mimeFromExt(ext)).split(';')[0]!.trim()
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  await writeFile(metaFile, mimeType)
  return { file, mimeType }
}

function mimeFromExt(ext: string): string {
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' } as Record<string, string>)[ext] ?? 'application/octet-stream'
}

/** Absolute URL for a site path such as "/faq/" or "/دوره-برندسازی-2/". */
export const pageUrl = (p: string) => (p.startsWith('http') ? p : `${SITE}${encodeURI(p)}`)
