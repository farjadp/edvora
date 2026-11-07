import { randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { CHUNK_MAX_BYTES } from '../../packages/integrations/src/wordpress/format'
import { signRequest } from '../../packages/integrations/src/wordpress/signature'
import { DEMO, IBA } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, type StaffUser } from './staff-helpers'
import { createConnectionUi, nowSec, push, qaSite, sha256, sql, type Conn } from './wp-import-helpers'

// E-032 QA — push API (W2, W19): expiry, revocation, replay, clock skew, tenant binding, size and completeness
// limits, rate limit, and "the secret is shown once". Connections are created through the real UI by an academy
// admin; ageing a connection needs SQL because the product (rightly) has no API for it.

let admin: APIRequestContext
let importer: StaffUser
const PING = '/api/import/push/ping'
const MANIFEST = '/api/import/push/manifest'
const FINISH = '/api/import/push/finish'
const records = (kind: string, seq: number) => `/api/import/push/records?kind=${kind}&seq=${seq}`

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
  importer = await createStaff(admin, 'demo', 'academy-admin', 'qa-push')
})
test.afterAll(async () => {
  await admin?.dispose()
})

async function newConn(page: Page): Promise<Conn> {
  await staffLogin(page, DEMO, importer, '/staff/import')
  await page.waitForURL(`${DEMO}/staff/import`)
  return createConnectionUi(page, DEMO)
}

const ndjson = (lines: unknown[]) => `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`
const userLine = (id: number, phone: string) => ({ type: 'record', v: 1, kind: 'wp.user', wpId: String(id), data: { ID: String(id), user_login: `u${id}`, user_email: `u${id}@example.test`, user_registered: '2021-01-01 00:00:00', display_name: `u${id}`, user_nicename: `u${id}` }, meta: { digits_phone: phone, wp_capabilities: 'json:{"subscriber":true}' } })

test('a new connection: the secret is shown once, stored only as hash + sealed copy, never returned by any API', async ({ page }) => {
  const conn = await newConn(page)
  // Second visit: no secret anywhere in the page.
  await page.goto(`${DEMO}/staff/import`)
  const html = await page.content()
  expect(html).not.toContain(conn.secret)
  await page.goto(`${DEMO}/staff/import/${conn.jobId}`)
  expect(await page.content()).not.toContain(conn.secret)

  const [row] = await sql<{ secret_hash: string; secret_sealed: string; expires_at: Date; created_at: Date }>(
    'select secret_hash, secret_sealed, expires_at, created_at from import_connections where connection_id = $1',
    [conn.connectionId],
  )
  expect(row!.secret_hash).toBe(sha256(conn.secret))
  expect(row!.secret_sealed).not.toContain(conn.secret)
  expect(row!.secret_sealed.length).toBeGreaterThan(40)
  // Expires in 72 h (W1).
  const hours = (new Date(row!.expires_at).getTime() - new Date(row!.created_at).getTime()) / 3_600_000
  expect(hours).toBeGreaterThan(71.9)
  expect(hours).toBeLessThan(72.1)

  // Even the super admin's REST API never shows hash or sealed secret; and nobody can write or delete them.
  const list = await admin.get(`/api/import-connections?where[connectionId][equals]=${conn.connectionId}&depth=0`)
  const body = await list.text()
  expect(body).not.toContain(conn.secret)
  expect(body).not.toContain(row!.secret_hash)
  expect(body).not.toContain('secretSealed')
  expect(body).not.toContain('secretHash')
  const del = await admin.delete(`/api/import-jobs/${conn.jobId}`)
  expect([403, 404, 405]).toContain(del.status())
  const patch = await admin.patch(`/api/import-connections?where[connectionId][equals]=${conn.connectionId}`, { data: { revokedAt: null, expiresAt: '2099-01-01T00:00:00.000Z' } })
  expect(patch.status()).toBeGreaterThanOrEqual(400)
})

test('signature checks: missing headers, wrong secret, tampered body or path, clock skew (±5 min window), bad nonce, replay', async ({ page, request }) => {
  const conn = await newConn(page)
  const ok = await push(request, DEMO, conn, 'GET', PING)
  expect(ok.status()).toBe(200)
  expect(await ok.json()).toMatchObject({ ok: true, tenant: 'demo' })

  const missing = await push(request, DEMO, conn, 'GET', PING, undefined, { skipSignature: true })
  expect(missing.status()).toBe(401)
  expect(await missing.json()).toMatchObject({ code: 'missing_header' })

  const wrongSecret = await push(request, DEMO, conn, 'GET', PING, undefined, { secret: 'not-the-secret' })
  expect(wrongSecret.status()).toBe(401)
  expect(await wrongSecret.json()).toMatchObject({ code: 'bad_signature' })

  // Signed for one body, sent with another.
  const tampered = await push(request, DEMO, conn, 'POST', MANIFEST, '{"a":2}', { signedBody: '{"a":1}' })
  expect(tampered.status()).toBe(401)
  expect(await tampered.json()).toMatchObject({ code: 'bad_signature' })

  // Signature of one path (seq=0) replayed on another (seq=1).
  const body = ndjson([userLine(1, '+989120000001')])
  const base = { 'X-Edvora-Connection': conn.connectionId }
  const h = signRequest({ secret: conn.secret, connectionId: conn.connectionId, method: 'POST', pathWithQuery: records('wp.user', 0), body })
  const swapped = await request.post(`${DEMO}${records('wp.user', 1)}`, { headers: { ...base, ...h }, data: body, maxRedirects: 0 })
  expect(swapped.status()).toBe(401)
  expect(await swapped.json()).toMatchObject({ code: 'bad_signature' })

  // Clock skew: 6 minutes either way is refused with a human hint; 4 minutes is fine (window is 5).
  for (const skew of [-360, 360]) {
    const res = await push(request, DEMO, conn, 'GET', PING, undefined, { timestamp: nowSec() + skew })
    expect(res.status(), `skew ${skew}`).toBe(401)
    const j = (await res.json()) as { code: string; message: string }
    expect(j.code).toBe('expired')
    expect(j.message).toMatch(/server time/i)
  }
  expect((await push(request, DEMO, conn, 'GET', PING, undefined, { timestamp: nowSec() - 240 })).status()).toBe(200)

  // Malformed nonce / timestamp.
  expect(await (await push(request, DEMO, conn, 'GET', PING, undefined, { nonce: 'short' })).json()).toMatchObject({ code: 'bad_nonce' })
  expect(await (await push(request, DEMO, conn, 'GET', PING, undefined, { headers: { 'X-Edvora-Timestamp': 'yesterday' } })).json()).toMatchObject({ code: 'bad_timestamp' })

  // Replay: the very same signed request twice.
  const nonce = randomBytes(16).toString('hex')
  expect((await push(request, DEMO, conn, 'GET', PING, undefined, { nonce })).status()).toBe(200)
  const replay = await push(request, DEMO, conn, 'GET', PING, undefined, { nonce })
  expect(replay.status()).toBe(401)
  expect(await replay.json()).toMatchObject({ code: 'replay' })

  // Error bodies never carry a stack trace or the secret.
  const text = await replay.text()
  expect(text).not.toMatch(/\bat \w+.*\(.*:\d+:\d+\)/)
  expect(text).not.toContain(conn.secret)
})

test('a valid connection is bound to its academy: unknown on the iba host, same answer as a made-up id (no existence leak)', async ({ page, request }) => {
  const conn = await newConn(page)
  const real = await push(request, IBA, conn, 'GET', PING)
  const fake = await push(request, IBA, { connectionId: `cnx_${randomBytes(6).toString('hex')}`, secret: conn.secret }, 'GET', PING)
  expect(real.status()).toBe(401)
  expect(fake.status()).toBe(401)
  expect(await real.json()).toEqual(await fake.json())
  // And a manifest naming the other academy is refused even on the right host with a valid signature.
  const manifest = qaSite().manifest(conn, 'iba')
  const res = await push(request, DEMO, conn, 'POST', MANIFEST, JSON.stringify(manifest))
  expect(res.status()).toBe(409)
  expect(await res.json()).toMatchObject({ code: 'tenant_mismatch' })
})

test('plain http on a public host is refused before anything else (HTTPS required)', async ({ page, request }) => {
  const conn = await newConn(page)
  const res = await request.get(`${DEMO}${PING}`, {
    headers: { ...signRequest({ secret: conn.secret, connectionId: conn.connectionId, method: 'GET', pathWithQuery: PING }), host: 'demo.edvora-qa.example' },
    maxRedirects: 0,
  })
  expect([400, 404]).toContain(res.status())
  if (res.status() === 400) expect(await res.json()).toMatchObject({ code: 'https_required' })
})

test('manifest → chunks → finish: order, size, shape and completeness are enforced; a complete push becomes a dry-run report', async ({ page, request }) => {
  const conn = await newConn(page)
  const site = qaSite()
  const manifest = site.manifest(conn, 'demo')

  // Chunks before a manifest.
  const early = await push(request, DEMO, conn, 'POST', records('wp.user', 0), ndjson([userLine(1, site.phones.sara)]))
  expect(early.status()).toBe(409)
  expect(await early.json()).toMatchObject({ code: 'state' })

  // Manifest: not JSON, wrong shape, then fine.
  expect((await push(request, DEMO, conn, 'POST', MANIFEST, 'not json')).status()).toBe(422)
  expect((await push(request, DEMO, conn, 'POST', MANIFEST, JSON.stringify({ hello: 'world' }))).status()).toBe(422)
  expect((await push(request, DEMO, conn, 'POST', MANIFEST, JSON.stringify({ ...manifest, connectionId: 'cnx_other' }))).status()).toBe(409)
  expect((await push(request, DEMO, conn, 'POST', MANIFEST, JSON.stringify(manifest))).status()).toBe(200)

  // Chunk limits.
  const bad = await push(request, DEMO, conn, 'POST', records('wp.user', 0), '{"not":"a record"}\n')
  expect(bad.status()).toBe(422)
  expect(await bad.json()).toMatchObject({ code: 'invalid_record' })
  const wrongKind = await push(request, DEMO, conn, 'POST', records('wp.term', 0), ndjson([userLine(1, site.phones.sara)]))
  expect(wrongKind.status()).toBe(422)
  expect((await push(request, DEMO, conn, 'POST', '/api/import/push/records?kind=WP-USER&seq=0', 'x\n')).status()).toBe(422)
  expect((await push(request, DEMO, conn, 'POST', '/api/import/push/records?kind=wp.user&seq=-1', 'x\n')).status()).toBe(422)

  const many = ndjson(Array.from({ length: 501 }, (_, i) => userLine(1000 + i, site.phones.sara)))
  const tooMany = await push(request, DEMO, conn, 'POST', records('wp.user', 0), many)
  expect(tooMany.status()).toBe(413)
  expect(await tooMany.json()).toMatchObject({ code: 'too_many_records' })

  // Oversized chunk (declared and actual size above the 8 MB cap).
  const huge = Buffer.alloc(CHUNK_MAX_BYTES + 1024, 0x61)
  const big = await push(request, DEMO, conn, 'POST', records('wp.user', 0), huge)
  expect(big.status()).toBe(413)
  expect(await big.json()).toMatchObject({ code: 'too_large' })

  // Two chunks of users; finish claims both but only the first arrived → 409 listing what is missing.
  const first = ndjson([userLine(1, `+98${site.phones.sara.slice(1)}`), userLine(2, `+98${site.phones.ali.slice(1)}`)])
  expect((await push(request, DEMO, conn, 'POST', records('wp.user', 0), first)).status()).toBe(200)
  const incomplete = await push(request, DEMO, conn, 'POST', FINISH, JSON.stringify({ chunks: { 'wp.user': 2 }, counts: { 'wp.user': 3 } }))
  expect(incomplete.status()).toBe(409)
  const inc = (await incomplete.json()) as { code: string; missing: { kind: string; chunks: number; counts: number }[] }
  expect(inc.code).toBe('incomplete')
  expect(inc.missing).toEqual([{ kind: 'wp.user', chunks: 1, counts: 2 }])
  // The job did not move on.
  const [job] = await sql<{ status: string }>('select status from import_jobs where id = $1', [conn.jobId])
  expect(job!.status).toBe('ingesting')
  // Malformed finish.
  expect((await push(request, DEMO, conn, 'POST', FINISH, '{"chunks":"x"}')).status()).toBe(422)

  // Retrying the same (kind, seq) overwrites (idempotent), the missing chunk arrives, finish succeeds.
  expect((await push(request, DEMO, conn, 'POST', records('wp.user', 0), first)).status()).toBe(200)
  expect((await push(request, DEMO, conn, 'POST', records('wp.user', 1), ndjson([userLine(3, '09121112233')]))).status()).toBe(200)
  const done = await push(request, DEMO, conn, 'POST', FINISH, JSON.stringify({ chunks: { 'wp.user': 2 }, counts: { 'wp.user': 3 } }))
  expect(done.status()).toBe(200)

  // The dry run runs in the background and ends in the report; nothing was written to content yet.
  await expect
    .poll(async () => (await sql<{ status: string }>('select status from import_jobs where id = $1', [conn.jobId]))[0]!.status, { timeout: 60_000 })
    .toMatch(/awaiting-confirm|failed|rejected/)
  const [after] = await sql<{ status: string }>('select status from import_jobs where id = $1', [conn.jobId])
  expect(after!.status).toBe('awaiting-confirm')
  expect(await sql('select 1 from users where phone = $1', [site.phones.sara])).toHaveLength(0)
  await page.goto(`${DEMO}/staff/import/${conn.jobId}`)
  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'awaiting-confirm')
})

test('revoking a connection stops the very next request', async ({ page, request }) => {
  const conn = await newConn(page)
  expect((await push(request, DEMO, conn, 'GET', PING)).status()).toBe(200)
  await page.goto(`${DEMO}/staff/import/${conn.jobId}`)
  await page.getByRole('button', { name: 'لغو اتصال' }).first().click()
  await expect.poll(async () => (await sql('select 1 from import_connections where connection_id = $1 and revoked_at is not null', [conn.connectionId])).length, { timeout: 30_000 }).toBe(1)
  const res = await push(request, DEMO, conn, 'GET', PING)
  expect(res.status()).toBe(401)
  expect(await res.json()).toMatchObject({ code: 'connection_revoked' })
  const audit = await sql('select 1 from audit_logs where action = $1 and note like $2', ['import.connection.revoke', `${conn.connectionId}%`])
  expect(audit.length).toBeGreaterThan(0)
})

test('an expired connection (72 h passed) is refused', async ({ page, request }) => {
  const conn = await newConn(page)
  expect((await push(request, DEMO, conn, 'GET', PING)).status()).toBe(200)
  await sql("update import_connections set expires_at = now() - interval '1 minute' where connection_id = $1", [conn.connectionId])
  const res = await push(request, DEMO, conn, 'GET', PING)
  expect(res.status()).toBe(401)
  expect(await res.json()).toMatchObject({ code: 'connection_expired' })
})

test('rate limit: the 61st request within a minute gets 429, and refused requests count too', async ({ page, request }) => {
  const conn = await newConn(page)
  let limited = 0
  let firstLimited = -1
  for (let i = 1; i <= 64; i++) {
    const res = await push(request, DEMO, conn, 'GET', PING, undefined, i % 2 ? undefined : { secret: 'wrong' })
    if (res.status() === 429) {
      limited++
      if (firstLimited < 0) firstLimited = i
      expect(await res.json()).toMatchObject({ code: 'rate_limited' })
    }
  }
  expect(firstLimited).toBe(61)
  expect(limited).toBe(4)
  // The limit is per connection: another connection is unaffected.
  const other = await createConnectionUi(page, DEMO)
  expect((await push(request, DEMO, other, 'GET', PING)).status()).toBe(200)
})
