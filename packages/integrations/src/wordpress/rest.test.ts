import { describe, expect, it } from 'vitest'
import { IntegrationError } from '../errors'
import { planImport } from './plan'
import { sha256Hex } from './signature'
import { RestSource } from './sources'

const SITE = 'https://shop.example.ir'

type Route = (url: URL, init: RequestInit) => { status?: number; body: unknown; headers?: Record<string, string> }

function stubFetch(routes: Record<string, Route | unknown>) {
  const calls: { url: URL; init: RequestInit }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    const key = url.pathname.replace(/^\/wp-json\/?/, '')
    const route = routes[key]
    if (route === undefined) return new Response(JSON.stringify({ code: 'rest_no_route' }), { status: 404 })
    const r = typeof route === 'function' ? (route as Route)(url, init) : { body: route }
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json', ...r.headers } })
  }) as typeof fetch
  return { fetchImpl, calls }
}

const routes = {
  '': { name: 'فروشگاه', home: SITE, url: SITE, gmt_offset: 3.5, timezone_string: 'Asia/Tehran', namespaces: ['wp/v2', 'wc/v3', 'wc/store/v1'] },
  'wc/v3/settings/general/woocommerce_currency': { id: 'woocommerce_currency', value: 'IRT' },
  'wp/v2/users': (url: URL) => ({
    body: url.searchParams.get('page') === '1' ? [{ id: 5, username: 'sara', name: 'سارا', first_name: 'سارا', last_name: 'کریمی', email: 'sara@example.ir', roles: ['customer'], registered_date: '2021-03-04T08:12:00' }] : [],
    headers: { 'X-WP-TotalPages': '1' },
  }),
  'wc/v3/customers': [{ id: 5, billing: { phone: '۰۹۱۲۱۲۳۴۵۶۷', first_name: 'سارا', city: 'تهران' } }],
  'wc/v3/products': () => ({ body: [{ id: 9, name: 'دوره برندسازی', slug: 'brand', status: 'publish', regular_price: '8470000', sale_price: '', price: '8470000', images: [], categories: [], meta_data: [] }], headers: { 'X-WP-TotalPages': '1' } }),
  'wc/v3/orders': () => ({
    body: [
      { id: 70, status: 'completed', currency: 'IRT', total: '8470000', customer_id: 5, billing: { phone: '' }, payment_method: 'WC_ZPal', transaction_id: 'R1', date_created_gmt: '2022-05-01T12:00:00', date_paid_gmt: '2022-05-01T12:03:00', line_items: [{ id: 1, name: 'دوره', product_id: 9, quantity: 1, subtotal: '8470000', total: '8470000' }], coupon_lines: [], fee_lines: [], meta_data: [{ key: '_zarinpal_authority', value: 'A123' }] },
    ],
    headers: { 'X-WP-TotalPages': '1' },
  }),
  'wc/v3/coupons': (url: URL) => ({ status: url.searchParams.get('page') === '1' ? 401 : 400, body: { code: 'woocommerce_rest_cannot_view' } }),
}

describe('RestSource', () => {
  it('builds a manifest from the REST index and maps users with Woo billing phones', async () => {
    const { fetchImpl, calls } = stubFetch(routes)
    const src = new RestSource({ siteUrl: `${SITE}/`, tenantSlug: 'iba', auth: { username: 'admin', applicationPassword: 'abcd efgh ijkl' }, fetch: fetchImpl })
    const m = await src.manifest()
    expect(m).toMatchObject({ pluginVersion: 'rest', tenantSlug: 'iba', woo: { currency: 'IRT' }, lifterlms: null, site: { homeUrl: SITE, gmtOffset: 3.5, siteId: sha256Hex(`${SITE}|wp_`) } })
    expect(m.plugins.map((p) => p.slug)).toEqual(['woocommerce'])
    const page = await src.read('wp.user', null, 100)
    expect(page.next).toBeNull()
    expect(page.records[0]).toMatchObject({ kind: 'wp.user', wpId: '5', data: { user_email: 'sara@example.ir', user_registered: '2021-03-04 08:12:00' }, meta: { billing_phone: '۰۹۱۲۱۲۳۴۵۶۷', wp_capabilities: 'json:["customer"]' } })
    expect(calls.every((c) => c.url.origin === SITE)).toBe(true)
    expect(calls.every((c) => c.init.redirect === 'manual')).toBe(true)
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(`Basic ${Buffer.from('admin:abcdefghijkl').toString('base64')}`)
  })

  it('reports what it cannot fetch and still plans', async () => {
    const { fetchImpl } = stubFetch(routes)
    const src = new RestSource({ siteUrl: SITE, tenantSlug: 'iba', auth: { username: 'admin', applicationPassword: 'x' }, fetch: fetchImpl })
    const siteId = (await src.manifest()).site.siteId
    const plan = await planImport({ source: src, ctx: { tenantSlug: 'iba', siteId, findRef: async () => null, findUserByPhone: async () => null, currentChecksum: async () => null } })
    expect(plan.missingKinds.map((k) => k.kind)).toEqual(expect.arrayContaining(['wp.user', 'woo.coupon']))
    expect(plan.drafts.users[0]).toMatchObject({ action: 'create', fields: { phone: '09121234567' } })
    expect(plan.drafts.orders[0]).toMatchObject({ action: 'create', fields: { total: 84_700_000, payments: [{ authority: 'A123', refId: 'R1', gateway: 'WC_ZPal' }] } })
    expect(plan.drafts.courses[0]?.fields).toMatchObject({ title: 'دوره برندسازی', price: 84_700_000 })
  })

  it('refuses plain HTTP, redirects and foreign origins', async () => {
    expect(() => new RestSource({ siteUrl: 'http://shop.example.ir', tenantSlug: 't', auth: { username: 'a', applicationPassword: 'b' } })).toThrow(IntegrationError)
    expect(() => new RestSource({ siteUrl: 'http://wp.localhost:8080', tenantSlug: 't', auth: { username: 'a', applicationPassword: 'b' } })).not.toThrow()
    const redirecting = (async () => new Response(null, { status: 301, headers: { location: 'https://evil.example/wp-json/' } })) as unknown as typeof fetch
    const src = new RestSource({ siteUrl: SITE, tenantSlug: 't', auth: { username: 'a', applicationPassword: 'b' }, fetch: redirecting })
    await expect(src.manifest()).rejects.toThrow(/redirected/)
  })

  it('times out slow sites', async () => {
    const slow = ((_: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch
    const src = new RestSource({ siteUrl: SITE, tenantSlug: 't', auth: { username: 'a', applicationPassword: 'b' }, fetch: slow, timeoutMs: 20 })
    await expect(src.manifest()).rejects.toBeInstanceOf(IntegrationError)
  })
})
