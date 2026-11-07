/**
 * E-030 — imports Iran Brand Academy's current public website (iranbrandacademy.com) into the `iba` tenant.
 *
 *   pnpm --filter @edvora/web import:iba
 *
 * Sources: the WordPress REST API (journal posts), Elementor page HTML (testimonials, client logos) and
 * src/seed/iba/curated.json (course/page text transcribed from the site). Images are downloaded once into a
 * git-ignored cache (apps/web/.cache/iba-import) and uploaded to Media — nothing is hotlinked.
 *
 * Idempotent: every record is keyed by tenant + slug or tenant + sourceUrl; re-running updates in place and
 * never duplicates media. Text is cleaned with cleanPersianText (ی/ک, half-spaces, Persian digits).
 *
 * Facts: copies only what the site says. Course prices stay 0 with TODO(client) (the site's prices are dated or
 * unclear). The Brand DBA "Ministry of Science" claim goes to the staff-only `pendingClaims` field, never public.
 *
 * Env:
 *   IBA_EXTRA_DOMAINS   comma list of hosts to map to the iba tenant (e.g. a Railway preview domain)
 *   IBA_IMPORT_OFFLINE  1 = use the cache only, never hit the site
 *   IBA_IMPORT_DELAY_MS politeness delay between requests (default 1500)
 *   IBA_IMPORT_RESET_STATUS 1 = recompute course published/draft (default: keep what an admin set after the first run)
 *   IBA_MEDIA_API_URL   upload images through this deployed app's REST API instead of the local disk (Railway: the
 *                       app's own domain), signing in with IBA_MEDIA_API_EMAIL / IBA_MEDIA_API_PASSWORD (super admin).
 *   IBA_MEDIA_API_BASIC user:password for a host behind the private-preview basic auth (src/proxy.ts). The Payload
 *                       token then travels as the payload-token cookie, since Authorization carries Basic.
 *                       Needed when the import runs on your machine against a remote database.
 */
import { toLatinDigits } from '@edvora/core/digits'
import { cleanPersianLine, cleanPersianText } from '@edvora/core/persian'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload, type CollectionSlug, type Payload, type Where } from 'payload'
import config from '../payload.config'
import { loadCurated, type CuratedCourse } from './iba/curated'
import { alumni, clientLogos, COURSES_PAGE, MBA_PAGE, originalUpload, videoTestimonials, writtenTestimonials, wpPosts } from './iba/extract'
import { CACHE_DIR, getFile, SITE, stats } from './iba/http'
import { blocksToLexical, htmlToLexical, htmlToText } from './iba/lexical'

type Doc = { id: number; [k: string]: unknown }

/** Claims that must never be published until verified (AGENTS.md, Notion 04). Matching items are held back. */
const HELD_CLAIMS = [/وزارت\s*علوم/, /قابل\s*ترجمه/]
const heldClaim = (text: string | null | undefined) => (text ? HELD_CLAIMS.find((r) => r.test(text.replace(/\u200c/g, ' '))) : undefined)
const report: { section: string; item: string; note: string }[] = []
const note = (section: string, item: string, n: string) => report.push({ section, item, note: n })

async function upsert(payload: Payload, collection: CollectionSlug, where: Where, data: Record<string, unknown>): Promise<Doc> {
  const found = await payload.find({ collection, where, limit: 1, depth: 0, overrideAccess: true })
  const existing = found.docs[0] as unknown as Doc | undefined
  if (existing) return (await payload.update({ collection, id: existing.id, data: data as never, overrideAccess: true })) as unknown as Doc
  return (await payload.create({ collection, data: data as never, overrideAccess: true })) as unknown as Doc
}

/** Seed courses created before this importer used other slugs for the same posts. */
const POST_SLUGS: Record<string, string> = {
  future: 'foroughi-predicting-the-future',
  'what-is-a-mini-mba': 'what-is-mini-mba',
  'what-is-a-mini-mba-and-do-we-need-a-minimba': 'do-we-need-mini-mba',
  'everything-about-the-mini-mba': 'everything-about-mini-mba',
  'چه-استراتژی-برای-تبلیغات-برندهای-خدما': 'ad-strategy-for-service-brands',
  'دومین-دوره-دکترای-حرفه-ای-برند-برگزار-ش': 'second-brand-doctorate-cohort',
  'آغاز-شانزدهمین-دوره-brand-mba-در-آکادمی-برند-ا': 'brand-mba-cohort-16',
}

/**
 * Client-logo display names. File names on the old site are the only label; where Notion page 02 (read from the
 * logos themselves) spells a brand differently, Notion wins. TODO(client): confirm spellings.
 */
const LOGO_NAMES: Record<string, string> = {
  'دکوپنل': 'دکوپانل',
  'ترسه': 'ترشه',
  'دورنا-باتری': 'باتری درنا',
  'مهرانوش': 'مهرنوش',
  'امیتیس': 'آمیتیس',
  'السی-من': 'ال‌سی‌من',
  'بی-نی-سی': 'BNC',
}

async function main() {
  const curated = await loadCurated()
  const payload = await getPayload({ config })

  // ------------------------------------------------------------------ tenant
  const existingTenant = (await payload.find({ collection: 'tenants', where: { slug: { equals: 'iba' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  const extraDomains = (process.env.IBA_EXTRA_DOMAINS ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
  const domains = [...new Set([...(existingTenant?.domains ?? []).map((d) => d.domain), 'iranbrandacademy.com', 'iba.localhost', ...extraDomains])]
  const tenant = await upsert(payload, 'tenants', { slug: { equals: 'iba' } }, {
    name: 'آکادمی برند ایران',
    slug: 'iba',
    domains: domains.map((domain) => ({ domain })),
    ...(existingTenant ? {} : { plan: 'pro', features: ['site', 'lms', 'payments', 'crm', 'certificates', 'live', 'consulting', 'b2b'], certificatePrefix: 'BA' }),
  })
  const t = tenant.id

  // ------------------------------------------------------------------ media
  const remoteMedia = await remoteMediaUploader()
  const mediaCache = new Map<string, number | null>()
  async function media(url: string | null | undefined, alt: string, section: string): Promise<number | null> {
    if (!url) return null
    const abs = url.startsWith('http') ? url : `${SITE}${url}`
    if (!abs.startsWith(SITE)) {
      note(section, abs, 'external image skipped (not on the academy site)')
      return null
    }
    if (mediaCache.has(abs)) return mediaCache.get(abs)!
    const found = await payload.find({ collection: 'media', where: { and: [{ tenant: { equals: t } }, { sourceUrl: { equals: abs } }] }, limit: 1, depth: 0, overrideAccess: true })
    let id: number | null = (found.docs[0]?.id as number | undefined) ?? null
    const cleanAlt = cleanPersianLine(alt) || 'تصویر آکادمی برند ایران'
    if (!id) {
      try {
        const file = await getFile(abs)
        if (!file) {
          note(section, abs, 'image 404 on the old site')
        } else if (!/^image\/|^application\/pdf$/.test(file.mimeType)) {
          note(section, abs, `unsupported type ${file.mimeType}`)
        } else {
          const data = { tenant: t, alt: cleanAlt, sourceUrl: abs }
          id = remoteMedia
            ? await remoteMedia(file.file, file.mimeType, abs, data)
            : ((await payload.create({ collection: 'media', data: data as never, filePath: file.file, overrideAccess: true })).id as number)
        }
      } catch (err) {
        note(section, abs, `download/upload failed: ${(err as Error).message}`)
      }
    } else if (found.docs[0] && (found.docs[0] as { alt?: string }).alt !== cleanAlt && alt) {
      await payload.update({ collection: 'media', id, data: { alt: cleanAlt } as never, overrideAccess: true })
    }
    mediaCache.set(abs, id)
    return id
  }

  // ------------------------------------------------------------------ tenant branding & site content
  const logo = await media(`${SITE}/wp-content/uploads/2021/06/logo-iranbrandacademy.png`, 'لوگوی آکادمی برند ایران', 'tenant')
  const logos = await clientLogos()
  const seenLogo = new Set<string>()
  const clientLogoRows: { name: string; logo: number | null }[] = []
  for (const l of logos) {
    const base = l.fileName.replace(/-\d+$/, '')
    if (seenLogo.has(base)) continue
    seenLogo.add(base)
    const name = LOGO_NAMES[base] ?? base.replace(/-/g, ' ')
    clientLogoRows.push({ name: cleanPersianLine(name), logo: await media(l.url, `لوگوی ${name}`, 'clientLogos') })
  }
  // Contact data keeps Latin digits (formatted for display by the UI).
  const phone = existingTenant?.contact?.phone ?? (curated.contact.phones[0] ? toLatinDigits(curated.contact.phones[0]).replace(/[^\d-]/g, '') : null)
  // Home shows the headline services; the full consulting menu goes on the consulting page.
  const HOME_SERVICES = 5
  await payload.update({
    collection: 'tenants',
    id: t,
    overrideAccess: true,
    data: {
      ...(logo ? { logo } : {}),
      ...(clientLogoRows.length ? { clientLogos: clientLogoRows } : {}),
      ...(curated.services.length ? { services: curated.services.slice(0, HOME_SERVICES).map((s) => ({ title: cleanPersianLine(s.title), text: cleanPersianText(s.text) || null })) } : {}),
      contact: {
        phone,
        email: curated.contact.email?.toLowerCase() ?? existingTenant?.contact?.email ?? null,
        address: curated.contact.address ? cleanPersianLine(curated.contact.address) : null,
      },
    } as never,
  })

  // ------------------------------------------------------------------ faculty (used on course pages and /faculty)
  const faculty = new Map<string, { name: string; role: string | null; photo: number | null }>()
  const nameKey = (n: string) => cleanPersianLine(n).replace(/[\s‌]/g, '').replace(/^(دکتر|مهندس)/, '')
  for (const f of curated.faculty) {
    const name = cleanPersianLine(f.name)
    faculty.set(nameKey(name), {
      name,
      // Experience counts conflict across the old site (24/26 years, 250/300 clients): held back until the client confirms.
      role: f.roleLines.map(cleanPersianLine).filter((l) => l && !/[۰-۹].*(سال|کسب‌?\s?و\s?کار)/.test(l)).join(' · ') || null,
      photo: await media(f.photoUrl, `تصویر ${name}`, 'faculty'),
    })
  }

  // ------------------------------------------------------------------ courses
  const certificateFaq = {
    question: 'آیا این دوره مدرک دانشگاهی است؟',
    answer:
      'خیر. گواهی آکادمی برند ایران مدرک دانشگاهی نیست. این گواهی نشان می‌دهد دوره، پروژه نهایی و کارگاه فنی را با موفقیت گذرانده‌اید و با کد یکتای آن در صفحه استعلام قابل بررسی است.',
  }
  const existingCohortCourses = new Set(
    (await payload.find({ collection: 'cohorts', where: { tenant: { equals: t } }, limit: 500, depth: 0, overrideAccess: true })).docs.map((c) => (typeof c.course === 'object' ? c.course.id : c.course)),
  )

  for (const [i, c] of curated.courses.entries()) {
    const existing = (await payload.find({ collection: 'courses', where: { and: [{ tenant: { equals: t } }, { slug: { equals: c.slug } }] }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    const heroImage = await media(c.heroImageUrl ? originalUpload(c.heroImageUrl) : null, c.title, `course:${c.slug}`) ?? (c.heroImageUrl ? await media(c.heroImageUrl, c.title, `course:${c.slug}`) : null)
    const courseFaculty = c.faculty.map((n) => {
      const f = faculty.get(nameKey(n))
      if (!f) note(`course:${c.slug}`, n, 'instructor not in the faculty list — imported without photo')
      return f ? { name: f.name, role: f.role, photo: f.photo } : { name: cleanPersianLine(n), role: null, photo: null }
    })
    const summary = buildSummary(c, existing ? existingCohortCourses.has(existing.id) : false)
    const leaked = heldClaim(JSON.stringify([c.title, c.subtitle, summary, c.outcomes, c.syllabus, c.faq, c.audience]))
    if (leaked) throw new Error(`curated.json: course ${c.slug} has an unverified claim (${leaked}) in public text — move it to pendingClaims`)
    if (c.statedPriceText) note(`course:${c.slug}`, 'price', `site says "${c.statedPriceText}" — not imported, TODO(client) confirm current fee`)
    if (c.notes) note(`course:${c.slug}`, 'notes', c.notes)
    const programCode = c.slug === 'brand-mba' ? 'MBA' : c.slug === 'brand-dba' ? 'DBA' : undefined
    await upsert(payload, 'courses', { and: [{ tenant: { equals: t } }, { slug: { equals: c.slug } }] }, {
      tenant: t,
      slug: c.slug,
      title: cleanPersianLine(c.title),
      subtitle: c.subtitle ? cleanPersianLine(c.subtitle) : null,
      kind: c.kind,
      ...(programCode ? { programCode, requiresDefense: true } : {}),
      // Long programmes are the academy's core offer and always shown (their stale start dates are not imported).
      // Past workshops, and cards with no description on the old site, stay as drafts: real content, not on sale.
      status: existing && process.env.IBA_IMPORT_RESET_STATUS !== '1' ? existing.status : c.kind === 'program' || (c.isCurrent && c.summary.trim()) ? 'published' : 'draft',
      featured: c.slug === 'brand-mba',
      sortOrder: existing?.sortOrder ?? 20 + i,
      // TODO(client): fees. The site's prices are tied to past cohorts or unclear (see the import report).
      price: existing?.price ?? 0,
      maxInstalments: existing?.maxInstalments ?? 1,
      heroImage,
      summary,
      durationLabel: c.durationLabel ? cleanPersianLine(c.durationLabel) : (existing?.durationLabel ?? null),
      audience: c.audience.map((a) => ({ title: cleanPersianLine(a.title), text: a.text ? cleanPersianText(a.text) : null })),
      outcomes: c.outcomes.map((o) => ({ text: cleanPersianLine(o.text) })),
      // brand-story: the old page carries Heroic Journey II's syllabus (copy-paste on the source) — TODO(client).
      syllabus: (c.slug === 'brand-story' ? [] : c.syllabus).map((s) => ({ title: cleanPersianLine(s.title), description: s.description ? cleanPersianText(s.description) : null, hours: s.hours ?? null })),
      faculty: courseFaculty,
      faq: [...c.faq.map((f) => ({ question: cleanPersianLine(f.question), answer: cleanPersianText(f.answer) })), ...(programCode ? [certificateFaq] : [])],
      pendingClaims: c.pendingClaims.map((p) => ({ text: p.text, note: p.note, sourceUrl: c.sourceUrl })),
      sourceUrl: c.sourceUrl,
    })
    for (const p of c.pendingClaims) note(`course:${c.slug}`, 'UNVERIFIED CLAIM (hidden)', p.text)
  }

  // ------------------------------------------------------------------ testimonials
  const videos = await videoTestimonials(['/', COURSES_PAGE])
  const written = await writtenTestimonials(COURSES_PAGE)
  const people = new Map<string, { name: string; role: string; quote: string | null; videoUrl: string | null; photoUrl: string | null; sourceUrl: string }>()
  for (const w of written) people.set(nameKey(w.name), { name: w.name, role: w.role, quote: w.quote, videoUrl: null, photoUrl: w.photoUrl, sourceUrl: w.sourceUrl })
  for (const v of videos) {
    const k = nameKey(v.name)
    const p = people.get(k)
    if (p) p.videoUrl = v.videoUrl
    else people.set(k, { name: v.name, role: v.role, quote: null, videoUrl: v.videoUrl, photoUrl: null, sourceUrl: v.sourceUrl })
  }
  // Match existing rows (including the seed's Notion-02 spellings) by a spacing-insensitive name key.
  const existingTestimonials = (await payload.find({ collection: 'testimonials', where: { tenant: { equals: t } }, limit: 500, depth: 0, overrideAccess: true })).docs
  const byKey = new Map(existingTestimonials.map((d) => [nameKey(d.name), d.id]))
  let order = 0
  for (const p of people.values()) {
    const name = cleanPersianLine(p.name)
    const data = {
      tenant: t,
      name,
      role: cleanPersianLine(p.role) || null,
      quote: p.quote ? cleanPersianText(p.quote) : null,
      // The academy's own ArvanCloud VOD files. Linked (opened on click), not embedded. TODO: move into Edvora storage.
      videoUrl: p.videoUrl,
      photo: await media(p.photoUrl, `تصویر ${name}`, 'testimonials'),
      approvedForUse: !heldClaim(p.quote),
      consentNote: 'Shown publicly on iranbrandacademy.com today. TODO(client, E-003): reconfirm consent to reuse name, photo, quote and video on the new site.',
      sortOrder: order++,
      sourceUrl: p.sourceUrl,
    }
    const id = byKey.get(nameKey(name))
    if (id) await payload.update({ collection: 'testimonials', id, data: data as never, overrideAccess: true })
    else byKey.set(nameKey(name), (await payload.create({ collection: 'testimonials', data: data as never, overrideAccess: true })).id)
  }
  const wall = await alumni(MBA_PAGE)
  note('alumni', `${wall.length} people`, 'Alumni photo wall on the Brand MBA page — no home in Edvora yet, not imported (also needs consent).')

  // ------------------------------------------------------------------ journal (posts)
  const posts = await wpPosts()
  const slugOf = (wpSlug: string) => {
    const s = decodeURIComponent(wpSlug)
    return POST_SLUGS[s] ?? s
  }
  const postPathToSlug = new Map(posts.map((p) => [decodeURI(new URL(p.link).pathname), slugOf(p.slug)]))
  const relink = (href: string) => {
    try {
      const u = new URL(href, SITE)
      if (u.origin !== SITE) return href
      const slug = postPathToSlug.get(decodeURI(u.pathname))
      return slug ? `/journal/${encodeURIComponent(slug)}` : href
    } catch {
      return href
    }
  }
  for (const p of posts) {
    const slug = slugOf(p.slug)
    try {
    const title = cleanPersianLine(htmlToText(p.title.rendered))
    const section = `post:${slug}`
    const featured = p._embedded?.['wp:featuredmedia']?.[0]
    const cover = await media(featured?.source_url, featured?.alt_text || title, section)
    const { root, dropped, text } = await htmlToLexical(p.content.rendered, {
      image: (src, alt) => media(src, alt || title, section),
      link: relink,
    })
    for (const d of dropped) note(section, d, 'dropped from body (embed/unsupported)')
    const held = heldClaim(`${title}\n${text}\n${p.excerpt.rendered}`)
    if (held) note(section, 'UNVERIFIED CLAIM (post held, not published)', `matches ${held} — publish only after verification`)
    const categories = (p._embedded?.['wp:term'] ?? []).flat().filter((x) => x.taxonomy === 'category').map((x) => x.name)
    if (categories.length) note(section, 'categories', `${categories.join(' / ')} — no category field in Edvora yet`)
    await upsert(payload, 'posts', { and: [{ tenant: { equals: t } }, { or: [{ slug: { equals: slug } }, { sourceUrl: { equals: p.link } }] }] }, {
      tenant: t,
      slug,
      title,
      excerpt: htmlToText(p.excerpt.rendered).replace(/\s*\[…\]\s*$/, '') || null,
      cover,
      author: cleanPersianLine(p._embedded?.author?.[0]?.name ?? '') || null,
      // No publishedAt = not public. Posts repeating an unverified claim are kept for staff but not published.
      publishedAt: held ? null : new Date(`${p.date_gmt}Z`).toISOString(),
      body: root,
      sourceUrl: p.link,
    })
      } catch (err) {
      note(`post:${slug}`, p.link, `FAILED, skipped: ${(err as Error).message}`)
    }
  }

  // ------------------------------------------------------------------ pages
  const NAV = new Set(['about', 'faq', 'contact', 'consulting'])
  const DRAFT_PAGES = new Set(['founder', 'careers'])
  for (const [i, pg] of curated.pages.entries()) {
    if (heldClaim(JSON.stringify([pg.title, pg.intro, pg.blocks, pg.faq])) && !DRAFT_PAGES.has(pg.slug)) {
      throw new Error(`curated.json: page ${pg.slug} has an unverified claim in public text`)
    }
    const cover = pg.images[0] ? await media(pg.images[0], pg.title, `page:${pg.slug}`) : null
    if (pg.notes) note(`page:${pg.slug}`, 'notes', pg.notes)
    await upsert(payload, 'pages', { and: [{ tenant: { equals: t } }, { slug: { equals: pg.slug } }] }, {
      tenant: t,
      slug: pg.slug,
      title: cleanPersianLine(pg.title),
      // founder: résumé full of unverified official-role claims; careers: form asks for a face photo. Both wait for Farjad.
      status: DRAFT_PAGES.has(pg.slug) ? 'draft' : 'published',
      showInNav: NAV.has(pg.slug),
      sortOrder: i,
      intro: pg.intro ? cleanPersianText(pg.intro) : null,
      cover,
      body: blocksToLexical([
        ...pg.blocks,
        ...(pg.slug === 'consulting' && curated.services.length > HOME_SERVICES
          ? [{ type: 'h2' as const, text: 'خدمات مشاوره' }, ...curated.services.slice(HOME_SERVICES).map((s) => ({ type: 'li' as const, text: s.text ? `${s.title}: ${s.text}` : s.title }))]
          : []),
      ]),
      faq: pg.faq.map((f) => ({ question: cleanPersianLine(f.question), answer: cleanPersianText(f.answer) })),
      sourceUrl: pg.sourceUrl,
    })
  }
  for (const g of curated.gaps) note('gaps', '-', g)

  const counts = {
    courses: curated.courses.length,
    published: curated.courses.filter((c) => c.isCurrent).length,
    testimonials: people.size,
    posts: posts.length,
    pages: curated.pages.length,
    faculty: faculty.size,
    clientLogos: clientLogoRows.length,
    media: [...mediaCache.values()].filter(Boolean).length,
    requests: stats,
  }
  await writeFile(path.join(CACHE_DIR, 'report.json'), JSON.stringify({ at: new Date().toISOString(), counts, report }, null, 2))
  console.info('IBA import complete', counts)
  console.info(`Report: ${path.join(CACHE_DIR, 'report.json')} (${report.length} notes)`)
  process.exit(0)
}

/**
 * Remote mode: the database is reached directly, but files must land on the deployed app's disk/volume, so images
 * go through its REST API (POST /api/media). Returns null when IBA_MEDIA_API_URL is not set (local mode).
 */
async function remoteMediaUploader() {
  const base = process.env.IBA_MEDIA_API_URL?.replace(/\/$/, '')
  if (!base) return null
  const email = process.env.IBA_MEDIA_API_EMAIL
  const password = process.env.IBA_MEDIA_API_PASSWORD
  if (!email || !password) throw new Error('IBA_MEDIA_API_URL needs IBA_MEDIA_API_EMAIL and IBA_MEDIA_API_PASSWORD (a super admin).')
  const basic = process.env.IBA_MEDIA_API_BASIC
  const gate: Record<string, string> = basic ? { authorization: `Basic ${Buffer.from(basic, 'utf8').toString('base64')}` } : {}
  const login = await fetch(`${base}/api/users/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...gate }, body: JSON.stringify({ email, password }) })
  if (!login.ok) throw new Error(`Media API login failed: ${login.status} ${await login.text()}`)
  const { token } = (await login.json()) as { token?: string }
  if (!token) throw new Error('Media API login returned no token')
  console.info(`Uploading media through ${base}`)
  return async (filePath: string, mimeType: string, sourceUrl: string, data: Record<string, unknown>): Promise<number> => {
    const form = new FormData()
    const name = decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop() ?? 'file')
    form.append('file', new Blob([await readFile(filePath)], { type: mimeType }), name)
    form.append('_payload', JSON.stringify(data))
    const auth: Record<string, string> = basic ? { ...gate, cookie: `payload-token=${token}` } : { authorization: `JWT ${token}` }
    const res = await fetch(`${base}/api/media`, { method: 'POST', headers: auth, body: form })
    if (!res.ok) throw new Error(`POST /api/media ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as { doc?: { id: number } }
    if (!json.doc?.id) throw new Error('POST /api/media returned no id')
    return json.doc.id
  }
}

/** Summary = page prose + the schedule/admission text the site shows, verbatim (only when no cohort carries it). */
function buildSummary(c: CuratedCourse, hasCohort: boolean): string | null {
  const parts = [cleanPersianText(c.summary)]
  if (c.scheduleText && !hasCohort && c.isCurrent) parts.push(`زمان برگزاری: ${cleanPersianLine(c.scheduleText)}`)
  if (c.admission.length) parts.push(['شرایط پذیرش:', ...c.admission.map((a) => `• ${cleanPersianLine(a)}`)].join('\n'))
  const s = parts.filter(Boolean).join('\n\n')
  return s || null
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

