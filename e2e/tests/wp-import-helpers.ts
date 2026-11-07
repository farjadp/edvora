import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { makeRecord, type ManifestInput, type SourceRecord } from '../../packages/integrations/src/wordpress/format'
import { signRequest } from '../../packages/integrations/src/wordpress/signature'

/**
 * E-032 QA helpers: a tiny SQL client (to age or inspect rows the product deliberately never lets the API touch),
 * connection creation through the real UI, signed push requests, and a small synthetic WordPress site.
 * Everything here is test data: `example.test` mail, 0912000xxxx-style phones, random site ids per run.
 */

// ---------------------------------------------------------------- SQL (pg is a transitive dependency of Payload)

function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  try {
    const line = readFileSync(join(__dirname, '../../apps/web/.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}

type PgClient = { connect(): Promise<void>; query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; end(): Promise<void> }

export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const webRequire = createRequire(join(__dirname, '../../apps/web/package.json'))
  const pg = createRequire(webRequire.resolve('@payloadcms/db-postgres'))('pg') as { Client: new (o: { connectionString: string }) => PgClient }
  const url = envValue('DATABASE_URL')
  if (!url) throw new Error('DATABASE_URL is not available for the QA SQL helper')
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return (await client.query(text, values)).rows as T[]
  } finally {
    await client.end()
  }
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// ---------------------------------------------------------------- connections through the UI

export type Conn = { connectionId: string; secret: string; jobId: number }

/** Creates a connection like an admin would. The secret is only on screen once. */
export async function createConnectionUi(page: Page, base: string, label = `qa-${randomBytes(3).toString('hex')}`): Promise<Conn> {
  await page.goto(`${base}/staff/import`)
  await page.locator('input[name="label"]').fill(label)
  await page.getByRole('button', { name: 'ساخت اتصال و کد یک‌بارمصرف' }).click()
  const box = page.getByTestId('connection-secret')
  await expect(box).toBeVisible({ timeout: 30_000 })
  const codes = box.locator('code')
  const connectionId = ((await codes.nth(1).textContent()) ?? '').trim()
  const secret = ((await codes.nth(2).textContent()) ?? '').trim()
  const href = (await box.locator('a[href^="/staff/import/"]').getAttribute('href')) ?? ''
  expect(connectionId).toMatch(/^cnx_[a-z0-9]+$/)
  expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
  return { connectionId, secret, jobId: Number(href.split('/').pop()) }
}

// ---------------------------------------------------------------- signed push

export type PushOpts = {
  timestamp?: number
  nonce?: string
  /** Sign with this secret instead of the connection's (wrong-secret tests). */
  secret?: string
  /** Sign this body but send another (tamper tests). */
  signedBody?: string | Buffer
  headers?: Record<string, string>
  skipSignature?: boolean
}

export function push(request: APIRequestContext, base: string, conn: Pick<Conn, 'connectionId' | 'secret'>, method: 'GET' | 'POST', pathWithQuery: string, body?: string | Buffer, opts: PushOpts = {}): Promise<APIResponse> {
  const signed = signRequest({
    secret: opts.secret ?? conn.secret,
    connectionId: conn.connectionId,
    method,
    pathWithQuery,
    body: opts.signedBody ?? body ?? '',
    timestamp: opts.timestamp,
    nonce: opts.nonce,
  })
  const headers: Record<string, string> = { ...(opts.skipSignature ? { 'X-Edvora-Connection': conn.connectionId } : signed), ...opts.headers }
  if (body !== undefined) headers['Content-Type'] = pathWithQuery.includes('/records') ? 'application/x-ndjson' : 'application/json'
  // Always raw bytes: Playwright would re-encode a string that is not valid JSON when the content type is JSON.
  return request.fetch(`${base}${pathWithQuery}`, { method, headers, data: body === undefined ? undefined : Buffer.from(body), maxRedirects: 0, timeout: 60_000 })
}

export const nowSec = () => Math.floor(Date.now() / 1000)

// ---------------------------------------------------------------- a synthetic WordPress site

const enc = (s: string) => encodeURIComponent(s).toLowerCase()
const json = (v: unknown) => `json:${JSON.stringify(v)}`

export type QaSite = {
  suffix: string
  homeUrl: string
  siteId: string
  phones: { sara: string; ali: string; dupA: string; dupB: string; released: string }
  slugs: { course: string; product: string }
  manifest: (conn: Pick<Conn, 'connectionId'>, tenantSlug: string, overrides?: Partial<ManifestInput>) => ManifestInput
  records: (opts?: { courseTitle?: string }) => SourceRecord[]
}

/** A random 7-digit tail so phones never collide with earlier runs: 0912 + 7 digits. */
const phoneWith = (tail: string) => `0912${tail}`

/**
 * A small LifterLMS + WooCommerce site: five people (one will already exist in the iba academy, two share a phone),
 * one course with a paid Woo product, one IRT order of 8,470,000 toman, one enrolment and one Persian-slug redirect.
 */
export function qaSite(): QaSite {
  const suffix = randomBytes(3).toString('hex')
  const homeUrl = `https://qa-${suffix}.example.test`
  const tails = new Set<string>()
  const tail = () => {
    let t = ''
    do t = String(Math.floor(Math.random() * 9_000_000) + 1_000_000)
    while (tails.has(t))
    tails.add(t)
    return t
  }
  const phones = { sara: phoneWith(tail()), ali: phoneWith(tail()), dupA: phoneWith(tail()), dupB: '', released: phoneWith(tail()) }
  phones.dupB = phones.dupA
  const plus98 = (p: string) => `+98${p.slice(1)}`
  const courseSlug = `دوره-کیفیت-${suffix}`
  const productSlug = `کیفیت-محصول-${suffix}`

  const user = (id: number, login: string, email: string, meta: Record<string, string>, roles: string[] = ['subscriber']) =>
    makeRecord('wp.user', id, { ID: String(id), user_login: login, user_email: email, user_registered: '2021-03-04 08:12:00', display_name: login, user_nicename: login }, { meta: { wp_capabilities: json(Object.fromEntries(roles.map((r) => [r, true]))), ...meta } })
  const post = (kind: string, id: number, data: Record<string, string>, meta: Record<string, string> = {}) =>
    makeRecord(kind, id, { ID: String(id), post_status: 'publish', post_date: '2022-01-01 12:30:00', post_date_gmt: '2022-01-01 09:00:00', post_content: '', post_excerpt: '', menu_order: '0', post_parent: '0', post_author: '1', ...data }, { meta })
  const um = (id: number, userId: number, postId: number, key: string, value: string) =>
    makeRecord('lifterlms.user_meta', id, { user_id: String(userId), post_id: String(postId), meta_key: key, meta_value: value, updated_date: '2022-05-01 12:00:00' })

  return {
    suffix,
    homeUrl,
    siteId: sha256(`${homeUrl}|wp_`),
    phones,
    slugs: { course: courseSlug, product: productSlug },
    manifest: (conn, tenantSlug, overrides = {}) => ({
      format: 'edvora-wp-export',
      formatVersion: 1,
      pluginVersion: '1.0.0',
      createdAtGmt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      connectionId: conn.connectionId,
      tenantSlug,
      site: {
        siteId: sha256(`${homeUrl}|wp_`),
        homeUrl,
        siteUrl: homeUrl,
        name: `آکادمی آزمایشی ${suffix}`,
        wpVersion: '6.5.0',
        phpVersion: '8.2.0',
        locale: 'fa_IR',
        timezone: 'Asia/Tehran',
        gmtOffset: 3.5,
        permalinkStructure: '/%postname%/',
        uploadsBaseUrl: `${homeUrl}/wp-content/uploads`,
      },
      plugins: [
        { slug: 'woocommerce', folder: 'woocommerce', version: '8.0.0', active: true },
        { slug: 'lifterlms', folder: 'lifterlms', version: '7.0.0', active: true },
        { slug: 'digits', folder: 'digits', version: '8.0', active: true },
      ],
      theme: { stylesheet: 'twentytwentyfour', template: 'twentytwentyfour', version: '1.0' },
      woo: { currency: 'IRT', hpos: false, priceDecimals: 0 },
      lifterlms: { currency: 'IRR' },
      tutor: null,
      counts: {},
      ...overrides,
    }),
    records: (opts = {}) => [
      user(1, 'qa-admin', `admin-${suffix}@example.test`, { first_name: 'مدیر', last_name: 'آزمایشی' }, ['administrator']),
      // Persian digits and +98 in the phone: must normalise to 09…
      user(2, 'sara', `sara-${suffix}@example.test`, { first_name: 'سارا', last_name: 'كريمي', digits_phone: plus98(phones.sara) }),
      user(3, 'ali', `ali-${suffix}@example.test`, { first_name: 'علی', last_name: 'وردپرسی', digits_phone: `00${plus98(phones.ali).slice(1)}` }),
      user(4, 'dup-a', `dupa-${suffix}@example.test`, { first_name: 'یکم', last_name: 'تکراری', mobile: phones.dupA }),
      user(5, 'dup-b', `dupb-${suffix}@example.test`, { first_name: 'دوم', last_name: 'تکراری', billing_phone: phones.dupB }),
      user(6, 'nophone', `nophone-${suffix}@example.test`, { first_name: 'بی', last_name: 'شماره' }),
      post('woo.product', 100, { post_type: 'product', post_title: `دوره کیفیت ${suffix}`, post_name: enc(productSlug) }, { _regular_price: '8470000', _price: '8470000' }),
      post('lifterlms.course', 1100, { post_type: 'course', post_title: opts.courseTitle ?? `دوره کیفیت ${suffix}`, post_name: enc(courseSlug), post_excerpt: 'توضیح کوتاه' }),
      post('lifterlms.section', 1150, { post_type: 'section', post_title: 'فصل اول' }, { _llms_order: '1', _llms_parent_course: '1100' }),
      post('lifterlms.lesson', 1200, { post_type: 'lesson', post_title: 'جلسه اول', post_name: 'lesson-1', post_content: '<p>متن جلسه</p>' }, { _llms_parent_course: '1100', _llms_parent_section: '1150', _llms_order: '1' }),
      post('lifterlms.access_plan', 1300, { post_type: 'llms_access_plan', post_title: 'پرداخت کامل' }, { _llms_price: '1', _llms_product_id: '1100', _llms_frequency: '0' }),
      makeRecord(
        'woo.order',
        300,
        {
          id: '300',
          currency: 'IRT',
          status: 'wc-completed',
          total: '8470000',
          discount_total: '0',
          tax_total: '0',
          customer_id: '2',
          billing_first_name: '',
          billing_last_name: '',
          billing_email: '',
          billing_phone: '',
          payment_method: 'WC_ZPal',
          payment_method_title: 'زرین‌پال',
          transaction_id: `A${'0'.repeat(30)}${suffix}`,
          date_created_gmt: '2022-05-01 12:00:00',
          date_paid_gmt: '2022-05-01 12:03:10',
          date_completed_gmt: '',
          parent_id: '0',
          type: 'shop_order',
        },
        { meta: {}, items: [{ id: '1', type: 'line_item', name: `دوره کیفیت ${suffix}`, product_id: '100', variation_id: '0', qty: 1, subtotal: '8470000', total: '8470000' }] },
      ),
      um(1, 2, 1100, '_status', 'enrolled'),
    ],
  }
}

/** Fake student phone in the 0912000xxxx range (never a real number). */
export const toPersianDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)
