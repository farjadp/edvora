/**
 * Structured extraction from IBA's Elementor pages and the WordPress REST API (E-030).
 * Text is returned raw; the importer cleans it with cleanPersianText.
 */
import { parse, type HTMLElement } from 'node-html-parser'
import { getJson, getText, pageUrl, SITE } from './http'

export interface VideoTestimonial {
  name: string
  role: string
  videoUrl: string
  sourceUrl: string
}
export interface WrittenTestimonial {
  name: string
  role: string
  quote: string
  photoUrl: string | null
  sourceUrl: string
}
export interface Alumnus {
  name: string
  role: string | null
  photoUrl: string
  sourceUrl: string
}
export interface ClientLogo {
  fileName: string
  url: string
}
export interface WpPost {
  id: number
  slug: string
  link: string
  date_gmt: string
  modified_gmt: string
  title: { rendered: string }
  excerpt: { rendered: string }
  content: { rendered: string }
  categories: number[]
  _embedded?: {
    author?: { name?: string }[]
    'wp:featuredmedia'?: { source_url?: string; alt_text?: string }[]
    'wp:term'?: { taxonomy: string; name: string }[][]
  }
}

export const COURSES_PAGE = '/دوره-های-برندسازی/'
export const MBA_PAGE = '/دوره-برندسازی-2/'

const text = (el: HTMLElement | null | undefined) => (el?.innerHTML ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
const imgSrc = (el: HTMLElement | null | undefined) => el?.getAttribute('data-src') || el?.getAttribute('data-lazy-src') || el?.getAttribute('src') || null

async function page(p: string): Promise<HTMLElement> {
  const html = await getText(pageUrl(p))
  if (!html) throw new Error(`Page not found on the old site: ${p}`)
  // Some hand-written widgets use <Br>, which confuses the parser's nesting.
  return parse(html.replace(/<br\s*\/?>/gi, '<br>'))
}

/** Video testimonials: Elementor slides linking to the academy's own ArvanCloud VOD files. Deduplicated by video. */
export async function videoTestimonials(paths: string[]): Promise<VideoTestimonial[]> {
  const out = new Map<string, VideoTestimonial>()
  for (const p of paths) {
    const dom = await page(p)
    for (const a of dom.querySelectorAll('a.swiper-slide-inner')) {
      const href = a.getAttribute('href') ?? ''
      if (!/arvanvod\.ir\/.+\.mp4$/.test(href)) continue
      const [name = '', ...role] = text(a.querySelector('.elementor-slide-description')).split('\n').map((s) => s.trim()).filter(Boolean)
      if (name && !out.has(href)) out.set(href, { name, role: role.join(' '), videoUrl: href, sourceUrl: pageUrl(p) })
    }
  }
  return [...out.values()]
}

/** Written testimonials ("دل‌نوشته‌ها"): Elementor reviews widget. */
export async function writtenTestimonials(p: string): Promise<WrittenTestimonial[]> {
  const dom = await page(p)
  return dom.querySelectorAll('.elementor-testimonial').map((t) => ({
    name: text(t.querySelector('.elementor-testimonial__name')),
    role: text(t.querySelector('.elementor-testimonial__title')),
    quote: text(t.querySelector('.elementor-testimonial__text')),
    photoUrl: imgSrc(t.querySelector('.elementor-testimonial__image img')),
    sourceUrl: pageUrl(p),
  })).filter((t) => t.name && t.quote)
}

/** "برخی از دانشجویانِ ما" — alumni photo wall (name + role in brackets). */
export async function alumni(p: string): Promise<Alumnus[]> {
  const dom = await page(p)
  return dom.querySelectorAll('.eael-lc-logo-wrap').flatMap((w) => {
    const photoUrl = imgSrc(w.querySelector('img'))
    const title = text(w.querySelector('.eael-logo-carousel-title'))
    const m = title.match(/^(.+?)\s*\((.+)\)\s*$/)
    if (!photoUrl || !title) return []
    return [{ name: (m?.[1] ?? title).trim(), role: m?.[2]?.trim() ?? null, photoUrl, sourceUrl: pageUrl(p) }]
  })
}

/** Client logos: the images that follow "برخی از برندهایی که ..." on the home page. */
export async function clientLogos(): Promise<ClientLogo[]> {
  const html = (await getText(pageUrl('/'))) ?? ''
  const start = html.indexOf('برخی از برندهایی که')
  if (start < 0) return []
  const chunk = html.slice(start, start + 40_000)
  const seen = new Set<string>()
  const out: ClientLogo[] = []
  for (const m of chunk.matchAll(/<img[^>]+src="(https:\/\/iranbrandacademy\.com\/wp-content\/uploads\/20\d\d\/\d\d\/[^"]+\.(?:png|jpe?g|webp))"/g)) {
    const url = m[1]!
    if (seen.has(url)) continue
    if (/(dr-shafiee|logo|favicon)/i.test(url)) break
    seen.add(url)
    out.push({ url, fileName: decodeURIComponent(url.split('/').pop()!.replace(/\.[a-z]+$/, '')) })
  }
  return out
}

/** All published posts with author, featured image and categories. */
export async function wpPosts(): Promise<WpPost[]> {
  const posts = await getJson<WpPost[]>(`${SITE}/wp-json/wp/v2/posts?per_page=100&_embed=author,wp:featuredmedia,wp:term`)
  return posts ?? []
}

/** Strips WordPress's "-1024x590" size suffix to get the original upload. */
export const originalUpload = (url: string) => url.replace(/-\d{2,4}x\d{2,4}(?=\.(png|jpe?g|webp|gif)$)/i, '')
