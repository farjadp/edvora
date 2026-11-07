/**
 * Where source records come from (ADR 011 §TS adapter): a verified bundle, in-memory fixtures (mock), or the
 * WP REST API (fallback). Every source yields the same record kinds as the plugin (FORMAT.md §4).
 */
import { IntegrationError } from '../errors'
import { readBundle, type BundleInput, type ReadBundleOptions } from './bundle'
import { FORMAT_NAME, FORMAT_VERSION, JSON_META_PREFIX, ManifestSchema, makeRecord, type Manifest, type ManifestInput, type SourceRecord } from './format'
import { checkPublicHost } from './net'
import { sha256Hex } from './signature'
import type { MissingKind } from './types'

export type ReadResult = { records: SourceRecord[]; next: string | null }

export interface WordPressSource {
  manifest(): Promise<Manifest>
  /** One page of `kind`; `cursor` is opaque (null = start), `next` null = done. Unknown kinds → empty. */
  read(kind: string, cursor: string | null, limit: number): Promise<ReadResult>
  /** Kinds (or parts of kinds) this source cannot provide, with a reason for the dry-run report. */
  missingKinds?(): Promise<MissingKind[]>
}

/** Records held in memory, grouped by kind. Base of the bundle and mock sources. */
export class MemorySource implements WordPressSource {
  protected readonly byKind = new Map<string, SourceRecord[]>()
  protected readonly parsedManifest: Manifest

  constructor(
    manifest: ManifestInput | Manifest,
    records: Iterable<SourceRecord>,
    private readonly missing: MissingKind[] = [],
  ) {
    this.parsedManifest = ManifestSchema.parse(manifest)
    for (const r of records) {
      const list = this.byKind.get(r.kind) ?? []
      list.push(r)
      this.byKind.set(r.kind, list)
    }
  }

  async manifest(): Promise<Manifest> {
    return this.parsedManifest
  }

  async read(kind: string, cursor: string | null, limit: number): Promise<ReadResult> {
    const list = this.byKind.get(kind) ?? []
    const start = cursor ? Number(cursor) : 0
    const size = Math.max(1, Math.floor(limit))
    const records = list.slice(start, start + size)
    const end = start + records.length
    return { records, next: end < list.length ? String(end) : null }
  }

  async missingKinds(): Promise<MissingKind[]> {
    return this.missing
  }

  kinds(): string[] {
    return [...this.byKind.keys()]
  }
}

/** Fixture-backed source; the AGENTS.md "mock adapter". See `mock.ts` for the built-in sample site. */
export class MockSource extends MemorySource {}

/**
 * A verified `.edvora-bundle`. `open` refuses (BundleError) before any record is read when the signature is
 * missing or wrong. Holds the records in memory (fine for the sites we know, ≈100k records).
 */
export class BundleSource extends MemorySource {
  static async open(input: BundleInput, secret: string, opts?: ReadBundleOptions): Promise<BundleSource> {
    const reader = await readBundle(input, secret, opts)
    const records: SourceRecord[] = []
    for await (const r of reader.records()) records.push(r)
    return new BundleSource(reader.manifest, records)
  }
}

// ---------------------------------------------------------------- REST fallback

export type RestSourceConfig = {
  /** The WordPress home URL, e.g. `https://example.ir`. Requests never leave this origin. */
  siteUrl: string
  tenantSlug: string
  connectionId?: string
  /** WP application password (WP 5.6+) of an administrator. */
  auth: { username: string; applicationPassword: string }
  /** WooCommerce REST keys (ck_/cs_); optional — the application password usually works too. */
  woo?: { consumerKey: string; consumerSecret: string }
  /** LifterLMS REST API key. */
  lifterlms?: { consumerKey: string; consumerSecret: string }
  /** DB table prefix for `siteId` (same formula as the plugin). Default `wp_`. */
  tablePrefix?: string
  fetch?: typeof fetch
  timeoutMs?: number
  /** Local development only: allow localhost / *.localhost / 127.x. Private and link-local addresses never. */
  allowLoopback?: boolean
  /** Tests: replaces DNS resolution for the reach check. */
  resolveHost?: (host: string) => Promise<string[]>
}

type Auth = 'wp' | 'woo' | 'llms'
type Json = Record<string, unknown>
type Endpoint = { path: string; query?: Record<string, string>; auth: Auth; map: (item: Json) => SourceRecord | null; requires?: string }

const isLocalHost = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost')

const rawText = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const o = v as { raw?: unknown; rendered?: unknown }
    if (typeof o.raw === 'string') return o.raw
    if (typeof o.rendered === 'string') return o.rendered
  }
  return v === null || v === undefined ? '' : String(v)
}
/** REST ISO dates (`2023-01-10T09:00:00`) → WP column format. */
const wpDate = (v: unknown): string => (typeof v === 'string' && v ? v.replace('T', ' ').replace(/(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, '').slice(0, 19) : '')
const metaString = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `${JSON_META_PREFIX}${JSON.stringify(v)}`)
const id = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

function wooMeta(item: Json, base: Record<string, string> = {}): Record<string, string> {
  const meta: Record<string, string> = { ...base }
  if (Array.isArray(item.meta_data)) {
    for (const m of item.meta_data as Json[]) if (typeof m.key === 'string') meta[m.key] = metaString(m.value)
  }
  return meta
}

const toUnix = (iso: unknown): string => {
  if (typeof iso !== 'string' || !iso) return ''
  const t = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  return Number.isFinite(t) ? String(Math.floor(t / 1000)) : ''
}

/**
 * Fallback for sites that cannot install the plugin. Best effort: what the REST API cannot give (phones in
 * usermeta, Tutor enrollments/progress, LifterLMS lesson progress) is reported by `missingKinds()`.
 */
export class RestSource implements WordPressSource {
  private readonly base: URL
  private readonly doFetch: typeof fetch
  private readonly timeoutMs: number
  private readonly missing = new Map<string, string>()
  private cachedManifest: Manifest | null = null
  private namespaces: string[] = []

  constructor(private readonly config: RestSourceConfig) {
    const url = new URL(config.siteUrl)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHost(url.hostname))) {
      throw new IntegrationError('wordpress', 'REST import needs HTTPS (credentials are sent with every request)')
    }
    url.pathname = url.pathname.replace(/\/+$/, '')
    url.search = ''
    url.hash = ''
    this.base = url
    this.doFetch = config.fetch ?? fetch
    this.timeoutMs = config.timeoutMs ?? 20_000
  }

  private authHeader(auth: Auth): Record<string, string> {
    const basic = (u: string, p: string) => ({ Authorization: `Basic ${Buffer.from(`${u}:${p}`, 'utf8').toString('base64')}` })
    if (auth === 'woo' && this.config.woo) return basic(this.config.woo.consumerKey, this.config.woo.consumerSecret)
    const wp = basic(this.config.auth.username, this.config.auth.applicationPassword.replace(/\s+/g, ''))
    if (auth === 'llms' && this.config.lifterlms) {
      return { ...wp, 'X-LLMS-CONSUMER-KEY': this.config.lifterlms.consumerKey, 'X-LLMS-CONSUMER-SECRET': this.config.lifterlms.consumerSecret }
    }
    return wp
  }

  private url(path: string, query: Record<string, string> = {}): URL {
    const u = new URL(`${this.base.toString().replace(/\/+$/, '')}/wp-json/${path.replace(/^\/+/, '')}`)
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)
    if (u.origin !== this.base.origin) throw new IntegrationError('wordpress', `Refusing request outside ${this.base.origin}`)
    return u
  }

  /** GET with timeout; never follows redirects (credentials must not leave the origin). */
  private async get(path: string, query: Record<string, string>, auth: Auth): Promise<{ status: number; body: unknown; totalPages: number | null }> {
    // SSRF guard (QA-E032-03): checked before every request, so credentials never reach a private address.
    const reach = await checkPublicHost(this.base.hostname, { allowLoopback: this.config.allowLoopback, resolve: this.config.resolveHost })
    if (!reach.ok) throw new IntegrationError('wordpress', `Refusing to connect to ${this.base.hostname} (${reach.reason})`)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    try {
      const res = await this.doFetch(this.url(path, query), { method: 'GET', headers: { Accept: 'application/json', ...this.authHeader(auth) }, redirect: 'manual', signal: ctrl.signal })
      if (res.status >= 300 && res.status < 400) {
        throw new IntegrationError('wordpress', `Site redirected ${path} (HTTP ${res.status}); use the final site URL`, res.headers.get('location'))
      }
      const text = await res.text()
      let body: unknown = null
      try {
        body = text ? (JSON.parse(text) as unknown) : null
      } catch {
        if (res.ok) throw new IntegrationError('wordpress', `Non-JSON response from ${path} (HTTP ${res.status})`, text.slice(0, 300))
      }
      const tp = res.headers.get('x-wp-totalpages')
      return { status: res.status, body, totalPages: tp !== null && /^\d+$/.test(tp) ? Number(tp) : null }
    } catch (err) {
      if (err instanceof IntegrationError) throw err
      throw new IntegrationError('wordpress', err instanceof Error ? err.message : 'Network error', err)
    } finally {
      clearTimeout(timer)
    }
  }

  private noteMissing(kind: string, reason: string) {
    if (!this.missing.has(kind)) this.missing.set(kind, reason)
  }

  async manifest(): Promise<Manifest> {
    if (this.cachedManifest) return this.cachedManifest
    const index = await this.get('', {}, 'wp')
    if (index.status !== 200 || !index.body || typeof index.body !== 'object') {
      throw new IntegrationError('wordpress', `REST API not reachable (HTTP ${index.status})`)
    }
    const info = index.body as Json
    this.namespaces = Array.isArray(info.namespaces) ? (info.namespaces as unknown[]).map(String) : []
    const ns = (n: string) => this.namespaces.includes(n)
    const homeUrl = (typeof info.home === 'string' ? info.home : this.base.toString()).replace(/\/+$/, '')
    const plugins: ManifestInput['plugins'] = []
    if (ns('wc/v3')) plugins.push({ slug: 'woocommerce', active: true })
    if (this.namespaces.some((n) => /^wc\/v\d+\/memberships$/.test(n))) plugins.push({ slug: 'woocommerce-memberships', active: true })
    if (ns('llms/v1')) plugins.push({ slug: 'lifterlms', active: true })
    if (ns('tutor/v1')) plugins.push({ slug: 'tutor', active: true })

    let wooCurrency = ''
    if (ns('wc/v3')) {
      const setting = await this.get('wc/v3/settings/general/woocommerce_currency', {}, 'woo')
      const v = setting.status === 200 && setting.body && typeof setting.body === 'object' ? (setting.body as Json).value : null
      if (typeof v === 'string') wooCurrency = v
      else {
        const store = await this.get('wc/store/v1/products', { per_page: '1' }, 'wp')
        const first = Array.isArray(store.body) ? (store.body[0] as Json | undefined) : undefined
        const code = first && typeof first.prices === 'object' && first.prices ? (first.prices as Json).currency_code : null
        if (typeof code === 'string') wooCurrency = code
      }
    }
    this.noteMissing('wp.user', 'شماره‌های موبایل ذخیره‌شده در usermeta (Digits، WP SMS) از REST در دسترس نیست؛ فقط تلفن صورت‌حساب ووکامرس خوانده می‌شود.')
    if (ns('llms/v1')) this.noteMissing('lifterlms.user_meta', 'پیشرفت جلسه‌به‌جلسهٔ LifterLMS از REST در دسترس نیست؛ فقط وضعیت ثبت‌نام و تکمیل دوره خوانده می‌شود.')
    if (ns('tutor/v1') || plugins.some((p) => p.slug === 'tutor')) {
      this.noteMissing('tutor.enrollment', 'نسخهٔ رایگان Tutor در REST ثبت‌نام، پیشرفت و سؤال آزمون ندارد؛ برای این‌ها افزونهٔ مهاجرت لازم است.')
    }

    const manifest: ManifestInput = {
      format: FORMAT_NAME,
      formatVersion: FORMAT_VERSION,
      pluginVersion: 'rest',
      createdAtGmt: new Date().toISOString(),
      connectionId: this.config.connectionId ?? 'rest',
      tenantSlug: this.config.tenantSlug,
      site: {
        siteId: sha256Hex(`${homeUrl}|${this.config.tablePrefix ?? 'wp_'}`),
        homeUrl,
        siteUrl: typeof info.url === 'string' ? info.url : homeUrl,
        name: typeof info.name === 'string' ? info.name : '',
        wpVersion: null,
        phpVersion: null,
        timezone: typeof info.timezone_string === 'string' ? info.timezone_string : '',
        gmtOffset: Number(info.gmt_offset ?? 0) || 0,
        permalinkStructure: '',
      },
      plugins,
      theme: null,
      woo: ns('wc/v3') ? { currency: wooCurrency, hpos: false } : null,
      lifterlms: ns('llms/v1') ? { currency: '' } : null,
      tutor: plugins.some((p) => p.slug === 'tutor') ? { currency: '' } : null,
      counts: {},
    }
    this.cachedManifest = ManifestSchema.parse(manifest)
    return this.cachedManifest
  }

  async missingKinds(): Promise<MissingKind[]> {
    await this.manifest()
    return [...this.missing].map(([kind, reason]) => ({ kind, reason }))
  }

  private endpoints(kind: string): Endpoint[] {
    const edit = { context: 'edit' }
    const post = (type: string) => (p: Json): SourceRecord =>
      makeRecord(
        kind,
        id(p.id),
        {
          ID: id(p.id),
          post_type: typeof p.type === 'string' ? p.type : type,
          post_title: rawText(p.title),
          post_name: typeof p.slug === 'string' ? p.slug : '',
          post_content: rawText(p.content),
          post_excerpt: rawText(p.excerpt),
          post_status: typeof p.status === 'string' ? p.status : 'publish',
          post_date: wpDate(p.date),
          post_date_gmt: wpDate(p.date_gmt),
          post_modified_gmt: wpDate(p.modified_gmt),
          post_author: id(p.author),
          post_parent: id(p.parent ?? 0),
          menu_order: id(p.menu_order ?? 0),
          guid: rawText(p.guid),
          link: typeof p.link === 'string' ? p.link : '',
        },
        {
          meta: { _thumbnail_id: id(p.featured_media ?? '') },
          rel: { terms: [...(Array.isArray(p.categories) ? p.categories : []), ...(Array.isArray(p.tags) ? p.tags : [])].map(String) },
        },
      )
    const term = (taxonomy: string) => (t: Json): SourceRecord =>
      makeRecord(kind, id(t.id), { term_id: id(t.id), name: rawText(t.name), slug: id(t.slug), taxonomy, parent: id(t.parent ?? 0), description: rawText(t.description), count: id(t.count ?? 0) })
    const llmsPost = (type: string, extra: (p: Json) => Record<string, string>) => (p: Json): SourceRecord =>
      makeRecord(
        kind,
        id(p.id),
        {
          ID: id(p.id),
          post_type: type,
          post_title: rawText(p.title),
          post_name: id(p.slug ?? ''),
          post_content: rawText(p.content),
          post_excerpt: rawText(p.excerpt),
          post_status: typeof p.status === 'string' ? p.status : 'publish',
          post_date_gmt: wpDate(p.date_created_gmt ?? p.date_gmt),
          post_modified_gmt: wpDate(p.date_updated_gmt ?? p.modified_gmt),
          menu_order: id(p.menu_order ?? p.order ?? 0),
        },
        { meta: { _thumbnail_id: id(p.featured_media ?? ''), ...extra(p) } },
      )
    switch (kind) {
      case 'wp.user':
        return [
          {
            path: 'wp/v2/users',
            query: edit,
            auth: 'wp',
            map: (u) =>
              makeRecord(
                kind,
                id(u.id),
                { ID: id(u.id), user_login: id(u.username ?? ''), user_email: id(u.email ?? ''), user_registered: wpDate(u.registered_date), display_name: rawText(u.name), user_nicename: id(u.slug ?? '') },
                {
                  meta: {
                    first_name: id(u.first_name ?? ''),
                    last_name: id(u.last_name ?? ''),
                    nickname: id(u.nickname ?? ''),
                    description: rawText(u.description),
                    wp_capabilities: `${JSON_META_PREFIX}${JSON.stringify(Array.isArray(u.roles) ? u.roles : [])}`,
                  },
                },
              ),
          },
        ]
      case 'wp.term':
        return [
          { path: 'wp/v2/categories', auth: 'wp', map: term('category') },
          { path: 'wp/v2/tags', auth: 'wp', map: term('post_tag') },
          { path: 'wc/v3/products/categories', auth: 'woo', map: term('product_cat'), requires: 'wc/v3' },
        ]
      case 'wp.attachment':
        return [
          {
            path: 'wp/v2/media',
            query: edit,
            auth: 'wp',
            map: (m) =>
              makeRecord(
                kind,
                id(m.id),
                {
                  ID: id(m.id),
                  post_type: 'attachment',
                  post_title: rawText(m.title),
                  post_name: id(m.slug ?? ''),
                  post_mime_type: id(m.mime_type ?? ''),
                  guid: id(m.source_url ?? ''),
                  post_date_gmt: wpDate(m.date_gmt),
                  post_parent: id(m.post ?? 0),
                  post_excerpt: rawText(m.caption),
                },
                { meta: { _wp_attachment_image_alt: id(m.alt_text ?? '') } },
              ),
          },
        ]
      case 'wp.post':
        return [
          { path: 'wp/v2/posts', query: { ...edit, status: 'publish,draft,private,future' }, auth: 'wp', map: post('post') },
          { path: 'wp/v2/pages', query: { ...edit, status: 'publish,draft,private,future' }, auth: 'wp', map: post('page') },
        ]
      case 'woo.product':
        return [
          {
            path: 'wc/v3/products',
            query: { status: 'any' },
            auth: 'woo',
            requires: 'wc/v3',
            map: (p) =>
              makeRecord(
                kind,
                id(p.id),
                {
                  ID: id(p.id),
                  post_type: 'product',
                  post_title: rawText(p.name),
                  post_name: id(p.slug ?? ''),
                  post_status: id(p.status ?? 'publish'),
                  post_content: rawText(p.description),
                  post_excerpt: rawText(p.short_description),
                  post_date_gmt: wpDate(p.date_created_gmt),
                  post_modified_gmt: wpDate(p.date_modified_gmt),
                },
                {
                  meta: wooMeta(p, {
                    _regular_price: id(p.regular_price ?? ''),
                    _sale_price: id(p.sale_price ?? ''),
                    _price: id(p.price ?? ''),
                    _sku: id(p.sku ?? ''),
                    _thumbnail_id: Array.isArray(p.images) && p.images[0] ? id((p.images[0] as Json).id) : '',
                  }),
                  rel: { terms: Array.isArray(p.categories) ? (p.categories as Json[]).map((c) => id(c.id)) : [] },
                },
              ),
          },
        ]
      case 'woo.coupon':
        return [
          {
            path: 'wc/v3/coupons',
            auth: 'woo',
            requires: 'wc/v3',
            map: (c) =>
              makeRecord(
                kind,
                id(c.id),
                { ID: id(c.id), post_type: 'shop_coupon', post_title: id(c.code ?? ''), post_status: 'publish', post_excerpt: rawText(c.description), post_date_gmt: wpDate(c.date_created_gmt) },
                {
                  meta: wooMeta(c, {
                    discount_type: id(c.discount_type ?? ''),
                    coupon_amount: id(c.amount ?? ''),
                    date_expires: toUnix(c.date_expires_gmt),
                    usage_limit: id(c.usage_limit ?? ''),
                    usage_count: id(c.usage_count ?? 0),
                    product_ids: `${JSON_META_PREFIX}${JSON.stringify(c.product_ids ?? [])}`,
                    minimum_amount: id(c.minimum_amount ?? ''),
                    maximum_amount: id(c.maximum_amount ?? ''),
                  }),
                },
              ),
          },
        ]
      case 'woo.order':
        return [
          {
            path: 'wc/v3/orders',
            query: { status: 'any' },
            auth: 'woo',
            requires: 'wc/v3',
            map: (o) => {
              const billing = (o.billing ?? {}) as Json
              const items: Record<string, unknown>[] = []
              for (const li of (o.line_items ?? []) as Json[]) {
                items.push({ id: id(li.id), type: 'line_item', name: rawText(li.name), product_id: id(li.product_id), variation_id: id(li.variation_id ?? 0), qty: Number(li.quantity ?? 1), subtotal: id(li.subtotal), total: id(li.total) })
              }
              for (const cl of (o.coupon_lines ?? []) as Json[]) items.push({ id: id(cl.id), type: 'coupon', code: id(cl.code), discount: id(cl.discount) })
              for (const fl of (o.fee_lines ?? []) as Json[]) items.push({ id: id(fl.id), type: 'fee', name: rawText(fl.name), total: id(fl.total) })
              return makeRecord(
                kind,
                id(o.id),
                {
                  id: id(o.id),
                  status: `wc-${id(o.status)}`,
                  currency: id(o.currency ?? ''),
                  total: id(o.total ?? ''),
                  discount_total: id(o.discount_total ?? ''),
                  tax_total: id(o.total_tax ?? '0'),
                  customer_id: id(o.customer_id ?? 0),
                  billing_first_name: id(billing.first_name ?? ''),
                  billing_last_name: id(billing.last_name ?? ''),
                  billing_email: id(billing.email ?? ''),
                  billing_phone: id(billing.phone ?? ''),
                  payment_method: id(o.payment_method ?? ''),
                  payment_method_title: id(o.payment_method_title ?? ''),
                  transaction_id: id(o.transaction_id ?? ''),
                  date_created_gmt: wpDate(o.date_created_gmt),
                  date_paid_gmt: wpDate(o.date_paid_gmt),
                  date_completed_gmt: wpDate(o.date_completed_gmt),
                  parent_id: id(o.parent_id ?? 0),
                  type: 'shop_order',
                },
                { meta: wooMeta(o), items },
              )
            },
          },
        ]
      case 'woo.membership_plan':
        return [
          {
            path: 'wc/v3/memberships/plans',
            auth: 'woo',
            requires: 'wc/v3',
            map: (p) =>
              makeRecord(
                kind,
                id(p.id),
                { ID: id(p.id), post_type: 'wc_membership_plan', post_title: rawText(p.name), post_name: id(p.slug ?? ''), post_status: id(p.status ?? 'publish') },
                { meta: wooMeta(p, { _product_ids: `${JSON_META_PREFIX}${JSON.stringify(p.access_product_ids ?? [])}`, _access_method: id(p.access_method ?? '') }) },
              ),
          },
        ]
      case 'woo.membership':
        return [
          {
            path: 'wc/v3/memberships/members',
            auth: 'woo',
            requires: 'wc/v3',
            map: (m) =>
              makeRecord(
                kind,
                id(m.id),
                { ID: id(m.id), post_type: 'wc_user_membership', post_author: id(m.customer_id), post_parent: id(m.plan_id), post_status: `wcm-${id(m.status)}`, post_date_gmt: wpDate(m.date_created_gmt) },
                { meta: wooMeta(m, { _start_date: wpDate(m.start_date_gmt), _end_date: wpDate(m.end_date_gmt), _order_id: id(m.order_id ?? ''), _product_id: id(m.product_id ?? '') }) },
              ),
          },
        ]
      case 'lifterlms.course':
        return [{ path: 'llms/v1/courses', auth: 'llms', requires: 'llms/v1', map: llmsPost('course', (p) => ({ _llms_video_embed: id(p.video_embed ?? '') })) }]
      case 'lifterlms.section':
        return [{ path: 'llms/v1/sections', auth: 'llms', requires: 'llms/v1', map: llmsPost('section', (p) => ({ _llms_order: id(p.order ?? 0), _llms_parent_course: id(p.parent_id ?? '') })) }]
      case 'lifterlms.lesson':
        return [
          {
            path: 'llms/v1/lessons',
            auth: 'llms',
            requires: 'llms/v1',
            map: llmsPost('lesson', (p) => ({
              _llms_order: id(p.order ?? 0),
              _llms_parent_section: id(p.parent_id ?? ''),
              _llms_parent_course: id(p.course_id ?? ''),
              _llms_free_lesson: p.public === true ? 'yes' : 'no',
              _llms_video_embed: id(p.video_embed ?? ''),
              _llms_drip_method: id(p.drip_method ?? ''),
              _llms_days_before_available: id(p.drip_days ?? ''),
            })),
          },
        ]
      case 'lifterlms.access_plan':
        return [
          {
            path: 'llms/v1/access-plans',
            auth: 'llms',
            requires: 'llms/v1',
            map: llmsPost('llms_access_plan', (p) => ({
              _llms_price: id(p.price ?? ''),
              _llms_sale_price: id(p.sale_price ?? ''),
              _llms_on_sale: p.sale_enabled === true ? 'yes' : 'no',
              _llms_product_id: id(p.post_id ?? ''),
              _llms_frequency: id(p.frequency ?? 0),
            })),
          },
        ]
      case 'tutor.course':
        return [{ path: 'wp/v2/courses', query: edit, auth: 'wp', map: post('courses') }]
      case 'tutor.topic':
        return [{ path: 'wp/v2/topics', query: edit, auth: 'wp', map: post('topics') }]
      case 'tutor.lesson':
        return [{ path: 'wp/v2/lesson', query: edit, auth: 'wp', map: post('lesson') }]
      default:
        return []
    }
  }

  async read(kind: string, cursor: string | null, limit: number): Promise<ReadResult> {
    await this.manifest()
    if (kind === 'lifterlms.user_meta') return this.readLifterProgress(cursor, limit)
    const endpoints = this.endpoints(kind)
    if (!endpoints.length) return { records: [], next: null }
    const perPage = Math.min(100, Math.max(1, Math.floor(limit)))
    let [ei, page] = (cursor ?? '0:1').split(':').map(Number) as [number, number]
    while (ei < endpoints.length) {
      const ep = endpoints[ei]
      if (!ep || (ep.requires && !this.namespaces.includes(ep.requires))) {
        ei++
        page = 1
        continue
      }
      const res = await this.get(ep.path, { ...ep.query, per_page: String(perPage), page: String(page) }, ep.auth)
      if (res.status === 400 && page > 1) {
        // past the last page (rest_post_invalid_page_number)
      } else if (res.status !== 200 || !Array.isArray(res.body)) {
        this.noteMissing(kind, `${ep.path}: HTTP ${res.status}${res.status === 401 || res.status === 403 ? ' (دسترسی کافی نیست)' : ''}`)
      } else {
        const records = (res.body as Json[]).map((item) => ep.map(item)).filter((r): r is SourceRecord => r !== null)
        if (kind === 'wp.user') await this.mergeCustomers(records)
        const more = res.totalPages !== null ? page < res.totalPages : res.body.length === perPage
        const next = more ? `${ei}:${page + 1}` : ei + 1 < endpoints.length ? `${ei + 1}:1` : null
        return { records, next }
      }
      ei++
      page = 1
    }
    return { records: [], next: null }
  }

  /** Adds Woo customer billing fields (incl. `billing_phone`) to a page of users. */
  private async mergeCustomers(users: SourceRecord[]): Promise<void> {
    if (!users.length || !this.namespaces.includes('wc/v3')) return
    const res = await this.get('wc/v3/customers', { include: users.map((u) => u.wpId).join(','), per_page: '100', role: 'all' }, 'woo')
    if (res.status !== 200 || !Array.isArray(res.body)) {
      this.noteMissing('wp.user', `wc/v3/customers: HTTP ${res.status}`)
      return
    }
    const byId = new Map((res.body as Json[]).map((c) => [id(c.id), c]))
    for (const u of users) {
      const b = (byId.get(u.wpId)?.billing ?? null) as Json | null
      if (!b) continue
      u.meta = { ...u.meta, billing_phone: id(b.phone ?? ''), billing_first_name: id(b.first_name ?? ''), billing_last_name: id(b.last_name ?? ''), billing_email: id(b.email ?? ''), billing_city: id(b.city ?? '') }
    }
  }

  /** LifterLMS students → synthetic `lifterlms.user_meta` rows (`_status`, `_start_date`, course `_is_complete`). */
  private async readLifterProgress(cursor: string | null, limit: number): Promise<ReadResult> {
    if (!this.namespaces.includes('llms/v1')) return { records: [], next: null }
    const page = cursor ? Number(cursor) : 1
    const perPage = Math.min(100, Math.max(1, Math.floor(limit)))
    const res = await this.get('llms/v1/students', { per_page: String(perPage), page: String(page) }, 'llms')
    if (res.status !== 200 || !Array.isArray(res.body)) {
      if (!(res.status === 400 && page > 1)) this.noteMissing('lifterlms.user_meta', `llms/v1/students: HTTP ${res.status}`)
      return { records: [], next: null }
    }
    const records: SourceRecord[] = []
    for (const s of res.body as Json[]) {
      const studentId = id(s.id)
      const en = await this.get(`llms/v1/students/${encodeURIComponent(studentId)}/enrollments`, { per_page: '100' }, 'llms')
      if (en.status !== 200 || !Array.isArray(en.body)) continue
      for (const e of en.body as Json[]) {
        const postId = id(e.post_id)
        const row = (key: string, value: string, at: unknown) =>
          makeRecord('lifterlms.user_meta', `rest:${studentId}:${postId}:${key}`, { user_id: studentId, post_id: postId, meta_key: key, meta_value: value, updated_date: wpDate(at) })
        records.push(row('_status', id(e.status ?? ''), e.date_updated ?? e.date_created))
        if (e.date_created) records.push(row('_start_date', wpDate(e.date_created), e.date_created))
        const pr = await this.get(`llms/v1/students/${encodeURIComponent(studentId)}/progress/${encodeURIComponent(postId)}`, {}, 'llms')
        const status = pr.status === 200 && pr.body && typeof pr.body === 'object' ? (pr.body as Json).status : null
        if (status === 'complete') records.push(row('_is_complete', 'yes', (pr.body as Json).date_updated))
      }
    }
    const more = res.totalPages !== null ? page < res.totalPages : res.body.length === perPage
    return { records, next: more ? String(page + 1) : null }
  }
}
