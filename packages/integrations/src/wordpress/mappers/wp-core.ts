/**
 * WordPress core: users (phone keyed), attachments → media, posts/pages, redirects for posts/pages.
 * Terms are only used for permalinks (Edvora posts have no categories yet) and counted.
 */
import { toPersianDigits as fa } from '@edvora/core/digits'
import { normaliseIranNationalCode, normaliseLegacyPath, pickPhone, type OrderPhone } from '@edvora/core/wpimport'
import { decodeMetaJson, type SourceRecord } from '../format'
import type { EdvoraDraft, MapContext, SourceIndex, StackMapper, UserPhoneInfo } from '../types'
import { homeUrl, mediaRef, meta, sanitiseWpHtml, slugFrom, str, stripTags, text, userDisplayName, wpDate } from './util'

const STAFF_ROLES = new Set([
  'administrator',
  'editor',
  'author',
  'contributor',
  'shop_manager',
  'instructor',
  'instructors_assistant',
  'lms_manager',
  'tutor_instructor',
])
const NATIONAL_CODE_KEY = /(national|melli|meli)_?(code|id)/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Roles from `<prefix>capabilities` (`json:{"subscriber":true}` or `["subscriber"]`). */
export function wpRoles(user: SourceRecord): string[] {
  const key = Object.keys(user.meta ?? {}).find((k) => k.endsWith('capabilities'))
  if (!key) return []
  const raw = user.meta?.[key]
  const decoded = decodeMetaJson(raw ?? null)
  if (Array.isArray(decoded)) return decoded.filter((x): x is string => typeof x === 'string')
  if (Array.isArray(raw)) return raw.filter((x) => !x.startsWith('json:'))
  if (decoded && typeof decoded === 'object') return Object.entries(decoded).filter(([, v]) => Boolean(v)).map(([k]) => k)
  return typeof decoded === 'string' && decoded ? [decoded] : []
}

/** Billing phones of a user's Woo orders, for the last step of the phone priority. */
function orderPhones(index: SourceIndex): Map<string, OrderPhone[]> {
  const byUser = new Map<string, OrderPhone[]>()
  for (const o of index.all('woo.order')) {
    const customer = str(o, 'customer_id')
    if (!customer || customer === '0') continue
    const list = byUser.get(customer) ?? []
    list.push({ billingPhone: str(o, 'billing_phone') ?? meta(o, '_billing_phone'), dateGmt: str(o, 'date_created_gmt') })
    byUser.set(customer, list)
  }
  return byUser
}

/** `pickPhone` for every WP user plus duplicate detection (two WP users, one phone → both held). */
export function computeUserPhones(index: SourceIndex): Map<string, UserPhoneInfo> {
  const orders = orderPhones(index)
  const result = new Map<string, UserPhoneInfo>()
  const byPhone = new Map<string, string[]>()
  for (const u of index.all('wp.user')) {
    const picked = pickPhone(u.meta, orders.get(u.wpId) ?? [])
    result.set(u.wpId, { ...picked, duplicateOf: [] })
    if (picked.phone) byPhone.set(picked.phone, [...(byPhone.get(picked.phone) ?? []), u.wpId])
  }
  for (const ids of byPhone.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      const info = result.get(id)
      if (info) info.duplicateOf = ids.filter((x) => x !== id)
    }
  }
  return result
}

function mapUser(ctx: MapContext, u: SourceRecord): EdvoraDraft {
  const name = userDisplayName(u)
  const firstName = text(meta(u, 'first_name') ?? meta(u, 'billing_first_name'))
  const lastName = text(meta(u, 'last_name') ?? meta(u, 'billing_last_name'))
  const emailRaw = (str(u, 'user_email') ?? meta(u, 'billing_email'))?.trim().toLowerCase() ?? null
  const contactEmail = emailRaw && EMAIL.test(emailRaw) ? emailRaw : null
  if (emailRaw && !contactEmail) {
    ctx.warn({ code: 'invalid_email', severity: 'info', kind: u.kind, wpId: u.wpId, message: `ایمیل کاربر «${name ?? u.wpId}» معتبر نیست و وارد نمی‌شود.`, detail: { email: emailRaw } })
  }
  const fields: Record<string, unknown> = {
    name: name ?? undefined,
    firstName: firstName ?? undefined,
    lastName: lastName ?? undefined,
    contactEmail: contactEmail ?? undefined,
    city: text(meta(u, 'billing_city')) ?? undefined,
    roles: ['student'],
    source: 'import',
  }
  const ncKey = Object.keys(u.meta ?? {}).find((k) => NATIONAL_CODE_KEY.test(k))
  const ncRaw = ncKey ? meta(u, ncKey) : null
  if (ncRaw) {
    const nc = normaliseIranNationalCode(ncRaw)
    if (nc) fields.nationalCode = nc
    else ctx.warn({ code: 'invalid_national_code', severity: 'info', kind: u.kind, wpId: u.wpId, message: `کد ملی کاربر «${name ?? u.wpId}» نامعتبر است و کنار گذاشته می‌شود.` })
  }

  const draft: EdvoraDraft = { collection: 'users', refKey: ctx.refKey(u.kind, u.wpId), kind: u.kind, wpId: u.wpId, mapper: 'wp-core', fields, dependsOn: [], precedence: 10 }
  const phone = ctx.userPhone(u.wpId)
  if (phone?.invalidCandidates.length) {
    ctx.warn({
      code: 'invalid_phone',
      severity: 'warn',
      kind: u.kind,
      wpId: u.wpId,
      message: `شمارهٔ ثبت‌شده برای «${name ?? u.wpId}» موبایل معتبر ایران نیست${phone.phone ? ' و منبع بعدی استفاده شد' : ''}.`,
      detail: { candidates: phone.invalidCandidates.map((c) => c.source) },
    })
  }
  if (!phone?.phone) {
    draft.hold = { reason: 'no_phone', detail: { invalidCandidates: phone?.invalidCandidates ?? [] } }
    ctx.warn({ code: 'no_phone', severity: 'warn', kind: u.kind, wpId: u.wpId, message: `کاربر «${name ?? u.wpId}» شمارهٔ موبایل ندارد؛ تا وارد کردن شماره در فهرست «نیازمند شماره» می‌ماند.` })
  } else {
    fields.phone = phone.phone
    draft.notes = [`phoneSource:${phone.source ?? ''}`]
    if (phone.duplicateOf.length) {
      draft.hold = { reason: 'duplicate_phone', detail: { phone: phone.phone, duplicateOf: phone.duplicateOf } }
      ctx.warn({
        code: 'duplicate_phone',
        severity: 'warn',
        kind: u.kind,
        wpId: u.wpId,
        message: `شمارهٔ کاربر «${name ?? u.wpId}» با ${fa(phone.duplicateOf.length)} کاربر دیگر یکی است؛ هیچ‌کدام خودکار ادغام نمی‌شوند و در صف بررسی می‌مانند.`,
        detail: { duplicateOf: phone.duplicateOf },
      })
    }
  }
  const staff = wpRoles(u).filter((r) => STAFF_ROLES.has(r))
  if (staff.length) {
    draft.notes = [...(draft.notes ?? []), `wpRoles:${staff.join(',')}`]
    ctx.warn({ code: 'staff_role', severity: 'info', kind: u.kind, wpId: u.wpId, message: `«${name ?? u.wpId}» در وردپرس نقش ${staff.join('، ')} دارد؛ به‌عنوان کاربر عادی وارد می‌شود و نقش را باید دستی داد.`, detail: { roles: staff } })
  }
  return draft
}

const ALLOWED_MEDIA = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/

function mapAttachment(ctx: MapContext, a: SourceRecord): EdvoraDraft {
  const file = meta(a, '_wp_attached_file')
  const uploads = ctx.manifest.site.uploadsBaseUrl?.replace(/\/+$/, '')
  const url = file && uploads ? `${uploads}/${file.replace(/^\/+/, '')}` : (str(a, 'guid') ?? null)
  const mime = str(a, 'post_mime_type')?.toLowerCase() ?? null
  const title = text(str(a, 'post_title'))
  const draft: EdvoraDraft = {
    collection: 'media',
    refKey: ctx.refKey(a.kind, a.wpId),
    kind: a.kind,
    wpId: a.wpId,
    mapper: 'wp-core',
    fields: {
      alt: text(meta(a, '_wp_attachment_image_alt')) ?? title ?? (file ? file.split('/').pop() : null) ?? `media-${a.wpId}`,
      filename: file ? file.split('/').pop() : undefined,
      mimeType: mime ?? undefined,
      sourceUrl: url ?? undefined,
    },
    dependsOn: [],
    precedence: 10,
  }
  if (!url) draft.skip = { reason: 'no_url' }
  else if (mime?.startsWith('video/')) {
    draft.skip = { reason: 'video_not_pulled' }
    ctx.warn({ code: 'media_video', severity: 'info', kind: a.kind, wpId: a.wpId, message: `فایل ویدیویی «${title ?? a.wpId}» کپی نمی‌شود؛ باید دستی به سرویس ویدیو منتقل شود.`, detail: { url } })
  } else if (!mime || !ALLOWED_MEDIA.test(mime)) {
    draft.skip = { reason: 'mime_not_supported' }
    ctx.notImported(`media:${mime ?? 'unknown'}`)
  }
  return draft
}

/** WP permalink path for a post (structure tags) — null for plain permalinks. */
export function postPermalinkPath(ctx: MapContext, p: SourceRecord): string | null {
  const slug = str(p, 'post_name')
  if (!slug) return null
  const link = str(p, 'link') // REST source: WordPress computed the permalink already
  if (link) {
    try {
      const path = new URL(link).pathname.replace(/\/+$/, '')
      if (path) return path
    } catch {
      // fall through to the structure tags
    }
  }
  if (str(p, 'post_type') === 'page') {
    const parts = [slug]
    let parent = str(p, 'post_parent')
    for (let guard = 0; parent && parent !== '0' && guard < 10; guard++) {
      const pr = ctx.index.get('wp.post', parent)
      const ps = str(pr, 'post_name')
      if (!pr || !ps) break
      parts.unshift(ps)
      parent = str(pr, 'post_parent')
    }
    return `/${parts.join('/')}`
  }
  const structure = ctx.manifest.site.permalinkStructure
  if (!structure) return null
  const local = str(p, 'post_date') ?? ''
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(local)
  const category = (p.rel?.terms ?? [])
    .map((t) => ctx.index.get('wp.term', t))
    .find((t) => str(t, 'taxonomy') === 'category')
  const author = ctx.index.get('wp.user', str(p, 'post_author') ?? '')
  const tags: Record<string, string | null> = {
    '%year%': m?.[1] ?? null,
    '%monthnum%': m?.[2] ?? null,
    '%day%': m?.[3] ?? null,
    '%hour%': m?.[4] ?? null,
    '%minute%': m?.[5] ?? null,
    '%second%': m?.[6] ?? null,
    '%post_id%': p.wpId,
    '%postname%': slug,
    '%category%': str(category, 'slug') ?? 'uncategorized',
    '%author%': str(author, 'user_nicename'),
  }
  let path = structure
  for (const [tag, value] of Object.entries(tags)) {
    if (!path.includes(tag)) continue
    if (value === null) return null
    path = path.split(tag).join(value)
  }
  return path
}

const BUILDER = /\[(vc_row|et_pb_section|fusion_builder|elementor)|wp:kadence|<!-- wp:uagb/i

function mapPost(ctx: MapContext, p: SourceRecord, drafts: EdvoraDraft[]): void {
  const type = str(p, 'post_type')
  if (type !== 'post' && type !== 'page') return
  const status = str(p, 'post_status') ?? 'draft'
  if (!['publish', 'draft', 'private', 'future'].includes(status)) {
    ctx.notImported(`wp.post:${status}`)
    return
  }
  const title = text(str(p, 'post_title')) ?? `#${p.wpId}`
  const slug = slugFrom(str(p, 'post_name'), title, p.wpId)
  const rawBody = str(p, 'post_content')
  const { html, shortcodes } = sanitiseWpHtml(rawBody)
  const builder = Boolean(meta(p, '_elementor_edit_mode') ?? meta(p, '_elementor_data')) || BUILDER.test(rawBody ?? '')
  if (builder) {
    ctx.warn({ code: 'page_builder', severity: 'warn', kind: p.kind, wpId: p.wpId, message: `«${title}» با صفحه‌ساز ساخته شده؛ متن منتقل می‌شود ولی چیدمان باید دستی بازسازی شود.` })
  } else if (shortcodes.length) {
    ctx.warn({ code: 'shortcodes_removed', severity: 'warn', kind: p.kind, wpId: p.wpId, message: `کدهای کوتاه (shortcode) در «${title}» حذف شدند: ${shortcodes.join('، ')}.`, detail: { shortcodes } })
  }
  const collection = type === 'post' ? 'posts' : 'pages'
  const path = postPermalinkPath(ctx, p)
  const sourceUrl = path ? `${homeUrl(ctx)}${path.endsWith('/') ? path : `${path}/`}` : `${homeUrl(ctx)}/?${type === 'page' ? 'page_id' : 'p'}=${p.wpId}`
  const author = ctx.index.get('wp.user', str(p, 'post_author') ?? '')
  const fields: Record<string, unknown> = {
    title,
    slug,
    excerpt: stripTags(str(p, 'post_excerpt')) ?? undefined,
    bodyHtml: html ?? undefined,
    sourceUrl,
  }
  if (collection === 'posts') {
    fields.author = userDisplayName(author) ?? undefined
    fields.publishedAt = status === 'publish' ? (wpDate(ctx, p, 'post_date_gmt', 'post_date') ?? undefined) : undefined
    const cover = mediaRef(ctx, meta(p, '_thumbnail_id'))
    if (cover) fields.cover = cover
  } else {
    fields.status = status === 'publish' ? 'published' : 'draft'
  }
  const refKey = ctx.refKey(p.kind, p.wpId)
  drafts.push({ collection, refKey, kind: p.kind, wpId: p.wpId, mapper: 'wp-core', fields, dependsOn: [], precedence: 10, notes: [`wpStatus:${status}`] })

  const to = collection === 'posts' ? ctx.paths.post(slug) : ctx.paths.page(slug)
  const froms = [path, `/?${type === 'page' ? 'page_id' : 'p'}=${p.wpId}`]
  for (const from of froms) if (from) drafts.push(redirectDraft(ctx, from, to, refKey, 'wp-core'))
}

/** Redirect draft; refKey keyed by the normalised `from` so two sources for one path collapse. */
export function redirectDraft(ctx: MapContext, fromPath: string, to: string, targetRefKey: string, mapper: EdvoraDraft['mapper']): EdvoraDraft {
  const from = normaliseLegacyPath(fromPath)
  return {
    collection: 'redirects',
    refKey: ctx.refKey('edvora.redirect', from),
    kind: 'edvora.redirect',
    wpId: from,
    mapper,
    fields: { from, to, code: 301, source: 'wp-import', target: { $ref: targetRefKey } },
    dependsOn: [targetRefKey],
    precedence: 10,
  }
}

export const wpCoreMapper: StackMapper = {
  id: 'wp-core',
  kinds: ['wp.user', 'wp.term', 'wp.attachment', 'wp.post'],
  detect: () => true,
  map(ctx) {
    const drafts: EdvoraDraft[] = []
    for (const u of ctx.index.all('wp.user')) drafts.push(mapUser(ctx, u))
    for (const a of ctx.index.all('wp.attachment')) drafts.push(mapAttachment(ctx, a))
    for (const p of ctx.index.all('wp.post')) mapPost(ctx, p, drafts)
    const terms = ctx.index.all('wp.term').length
    if (terms) ctx.notImported('wp.term', terms)
    return drafts
  },
}
