import { randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext, type APIResponse, type Page, type Request } from '@playwright/test'
import { DEMO, IBA, fakePhone, login } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, tenantId, type StaffUser } from './staff-helpers'
import { createConnectionUi, sql } from './wp-import-helpers'

// E-032 QA — who can do what (W1, W7, W19 and AGENTS.md "default deny"): anonymous, student, staff without import
// permissions, import.view only, import.run, and an admin of another academy. Pages, JSON/CSV/zip routes, the REST
// API and — the important one — the server actions, replayed by the wrong people with the real request a run-user sent.

let admin: APIRequestContext
let runner: StaffUser
let viewer: StaffUser
let advisor: StaffUser
let ibaAdmin: StaffUser
let demoId: number
const DENIED = 'اجرای انتقال از وردپرس'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
  demoId = await tenantId(admin, 'demo')
  const key = `qa-import-view-${randomBytes(3).toString('hex')}`
  const role = await admin.post('/api/roles', { data: { tenant: demoId, name: 'QA: فقط دیدن انتقال', key, permissions: ['import.view'] } })
  expect(role.ok(), await role.text()).toBeTruthy()
  runner = await createStaff(admin, 'demo', 'academy-admin', 'qa-run')
  viewer = await createStaff(admin, 'demo', key, 'qa-view')
  advisor = await createStaff(admin, 'demo', 'advisor', 'qa-none')
  ibaAdmin = await createStaff(admin, 'iba', 'academy-admin', 'qa-iba-admin')
})
test.afterAll(async () => {
  await admin?.dispose()
})

const locationOf = (r: APIResponse) => r.headers().location ?? ''

async function jobIdOf(page: Page): Promise<number> {
  await staffLogin(page, DEMO, runner, '/staff/import')
  await page.waitForURL(`${DEMO}/staff/import`)
  return (await createConnectionUi(page, DEMO)).jobId
}

test('anonymous: staff pages go to login, JSON/CSV/zip routes refuse, REST and push API expose nothing', async ({ request }) => {
  for (const path of ['/staff/import', '/staff/import/1']) {
    const res = await request.get(`${DEMO}${path}`, { maxRedirects: 0 })
    expect([302, 303, 307, 308], path).toContain(res.status())
    expect(locationOf(res)).toContain('/staff/login')
  }
  expect((await request.get(`${DEMO}/staff/import/1/state`)).status()).toBe(401)
  expect((await request.get(`${DEMO}/staff/import/1/redirects.csv`)).status()).toBe(404)
  expect((await request.get(`${DEMO}/staff/import/plugin`)).status()).toBe(404)
  for (const c of ['import-jobs', 'import-connections', 'import-refs', 'import-nonces', 'redirects']) {
    const res = await request.get(`${DEMO}/api/${c}?limit=5`)
    expect([401, 403, 404], c).toContain(res.status())
    const text = await res.text()
    expect(text).not.toContain('secretHash')
    expect(text).not.toContain('"docs":[{')
  }
  expect((await request.get(`${DEMO}/api/import/push/ping`)).status()).toBe(401)
})

test('student: no desk, no import data in the REST API', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'fa-IR' })
  const page = await ctx.newPage()
  await login(page, DEMO, fakePhone())
  const res = await page.request.get(`${DEMO}/staff/import`, { maxRedirects: 0 })
  expect([302, 303, 307, 308, 401, 403, 404]).toContain(res.status())
  for (const c of ['import-jobs', 'import-connections', 'import-refs', 'redirects']) {
    const r = await page.request.get(`${DEMO}/api/${c}?limit=5`)
    const body = await r.text()
    expect(r.status() >= 400 || !body.includes('"docs":[{'), c).toBeTruthy()
  }
  expect((await page.request.get(`${DEMO}/staff/import/plugin`)).status()).not.toBe(200)
  await ctx.close()
})

test('staff without import permissions: 403 on every import route, and no import rows through REST', async ({ browser, playwright }) => {
  const jobId = await (async () => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const id = await jobIdOf(page)
    await ctx.close()
    return id
  })()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await staffLogin(page, DEMO, advisor, '/staff')
  await page.waitForURL((u) => u.pathname.startsWith('/staff') && !u.pathname.startsWith('/staff/login'))
  for (const path of ['/staff/import', `/staff/import/${jobId}`, '/staff/import/plugin', `/staff/import/${jobId}/state`, `/staff/import/${jobId}/redirects.csv`]) {
    const res = await page.request.get(`${DEMO}${path}`, { maxRedirects: 0 })
    expect(res.status(), path).toBe(path.endsWith('csv') ? 404 : 403)
  }
  const api = await apiAs(playwright, DEMO, advisor.email, advisor.password)
  for (const c of ['import-jobs', 'import-connections', 'import-refs']) {
    const r = await api.get(`/api/${c}?limit=5`)
    const body = await r.text()
    expect(r.status() >= 400 || !body.includes('"docs":[{'), c).toBeTruthy()
  }
  await api.dispose()
  await ctx.close()
})

test('import.view only: sees the reports and downloads the plugin, but there is no way to start, confirm, revoke or purge', async ({ browser }) => {
  const ctxRun = await browser.newContext()
  const jobId = await jobIdOf(await ctxRun.newPage())
  await ctxRun.close()

  const ctx = await browser.newContext({ locale: 'fa-IR' })
  const page = await ctx.newPage()
  await staffLogin(page, DEMO, viewer, '/staff/import')
  await page.waitForURL(`${DEMO}/staff/import`)
  await expect(page.getByRole('heading', { name: 'انتقال از وردپرس', level: 1 })).toBeVisible()
  await expect(page.locator('input[name="bundle"]')).toHaveCount(0)
  await expect(page.locator('input[name="label"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'بارگذاری و بررسی' })).toHaveCount(0)
  const jobPage = await page.request.get(`${DEMO}/staff/import/${jobId}`)
  expect(jobPage.status()).toBe(200)
  const state = await page.request.get(`${DEMO}/staff/import/${jobId}/state`)
  expect(state.status()).toBe(200)
  expect(await state.json()).toMatchObject({ status: 'draft' })
  expect((await page.request.get(`${DEMO}/staff/import/${jobId}/redirects.csv`)).status()).toBe(200)
  const zip = await page.request.get(`${DEMO}/staff/import/plugin`)
  expect(zip.status()).toBe(200)
  expect(zip.headers()['content-type']).toContain('application/zip')
  expect(zip.headers()['cache-control']).toContain('no-store')
  await page.goto(`${DEMO}/staff/import/${jobId}`)
  await expect(page.getByRole('button', { name: /لغو اتصال|اجرای انتقال|بله، اجرا شود|حذف/ })).toHaveCount(0)
  await ctx.close()
})

/** Records the raw request of a server action (Next-Action id + multipart body) so it can be replayed by someone else. */
function capture(page: Page): { next: () => Promise<Request> } {
  let resolve: (r: Request) => void = () => undefined
  const p = new Promise<Request>((r) => (resolve = r))
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.headers()['next-action']) resolve(r)
  })
  return { next: () => p }
}

async function replay(request: APIRequestContext, base: string, req: Request, swap?: [string, string]): Promise<{ status: number; text: string }> {
  let data = req.postDataBuffer() ?? Buffer.alloc(0)
  if (swap) data = Buffer.from(data.toString('utf8').split(swap[0]).join(swap[1]), 'utf8')
  const headers = Object.fromEntries(Object.entries(req.headers()).filter(([k]) => ['next-action', 'content-type', 'next-router-state-tree', 'accept'].includes(k.toLowerCase())))
  const res = await request.post(`${base}${new URL(req.url()).pathname}`, { headers, data, maxRedirects: 0 })
  return { status: res.status(), text: await res.text() }
}

test('server actions replayed by people who may not run imports are denied and change nothing (create, revoke)', async ({ browser, playwright }) => {
  // 1. A run-user performs the real actions once; their requests are captured.
  const ctxRun = await browser.newContext({ locale: 'fa-IR' })
  const run = await ctxRun.newPage()
  await staffLogin(run, DEMO, runner, '/staff/import')
  await run.waitForURL(`${DEMO}/staff/import`)
  const cap = capture(run)
  const created = await createConnectionUi(run, DEMO)
  const createReq = await cap.next()
  expect(createReq.headers()['next-action']).toBeTruthy()

  // A second connection to try to revoke, and the captured revoke request.
  const victim = await createConnectionUi(run, DEMO)
  await run.goto(`${DEMO}/staff/import/${created.jobId}`)
  const cap2 = capture(run)
  await run.getByRole('button', { name: 'لغو اتصال' }).first().click()
  const revokeReq = await cap2.next()
  await expect.poll(async () => (await sql('select 1 from import_connections where connection_id = $1 and revoked_at is not null', [created.connectionId])).length).toBe(1)
  await ctxRun.close()

  const connections = async () => Number((await sql<{ n: string }>('select count(*) n from import_connections where tenant_id = $1', [demoId]))[0]!.n)
  const revoked = async () => (await sql('select 1 from import_connections where connection_id = $1 and revoked_at is not null', [victim.connectionId])).length

  const actors: { name: string; request: APIRequestContext; base: string; dispose: () => Promise<void> }[] = []
  const anon = await playwright.request.newContext()
  actors.push({ name: 'anonymous', request: anon, base: DEMO, dispose: () => anon.dispose() })
  for (const [name, user] of [['import.view only', viewer], ['advisor (no import permission)', advisor]] as const) {
    const api = await apiAs(playwright, DEMO, user.email, user.password)
    // The staff desk session is a cookie like any other; use the same login the browser would.
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await staffLogin(page, DEMO, user, '/staff')
    await page.waitForURL((u) => u.pathname.startsWith('/staff') && !u.pathname.startsWith('/staff/login'))
    actors.push({ name, request: page.request, base: DEMO, dispose: async () => { await api.dispose(); await ctx.close() } })
  }

  // Control: the same captured request from a run-user does work, so the denials below are real denials.
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await staffLogin(page, DEMO, runner, '/staff')
    await page.waitForURL((u) => u.pathname.startsWith('/staff') && !u.pathname.startsWith('/staff/login'))
    const before = await connections()
    const ok = await replay(page.request, DEMO, createReq)
    expect(ok.status).toBe(200)
    expect(await connections(), 'control: a run-user replay creates a connection').toBe(before + 1)
    await ctx.close()
  }

  for (const a of actors) {
    const before = await connections()
    const c = await replay(a.request, a.base, createReq)
    expect(c.status, `${a.name}: create`).toBeLessThan(500)
    expect(await connections(), `${a.name}: no connection was created`).toBe(before)
    expect(c.text, `${a.name}: no secret in the answer`).not.toMatch(/"secret"\s*:\s*"[A-Za-z0-9_-]{43}"/)
    const r = await replay(a.request, a.base, revokeReq, [created.connectionId, victim.connectionId])
    expect(r.status, `${a.name}: revoke`).toBeLessThan(500)
    expect(await revoked(), `${a.name}: the connection is still active`).toBe(0)
    if (a.name !== 'anonymous') {
      expect(c.text, `${a.name}: create denied with the Persian message`).toContain(DENIED)
      expect(r.text, `${a.name}: revoke denied with the Persian message`).toContain(DENIED)
    }
  }
  for (const a of actors) await a.dispose()
})

test('another academy’s admin cannot see or act on a demo import job (pages, state, csv); their own plugin download works', async ({ browser }) => {
  const ctxRun = await browser.newContext()
  const jobId = await jobIdOf(await ctxRun.newPage())
  await ctxRun.close()

  const ctx = await browser.newContext({ locale: 'fa-IR' })
  const page = await ctx.newPage()
  await staffLogin(page, IBA, ibaAdmin, '/staff/import')
  await page.waitForURL(`${IBA}/staff/import`)
  // The same numeric job id on the iba host: not found, never the demo academy's data.
  expect((await page.request.get(`${IBA}/staff/import/${jobId}/state`)).status()).toBe(404)
  expect((await page.request.get(`${IBA}/staff/import/${jobId}/redirects.csv`)).status()).toBe(404)
  const res = await page.request.get(`${IBA}/staff/import/${jobId}`)
  expect([404, 200]).toContain(res.status())
  const html = await res.text()
  expect(html).not.toContain('qa-run')
  // iba's list shows none of demo's connections.
  await page.goto(`${IBA}/staff/import`)
  const demoConns = await sql<{ connection_id: string }>('select connection_id from import_connections where tenant_id = $1 order by id desc limit 5', [demoId])
  const body = await page.content()
  for (const c of demoConns) expect(body).not.toContain(c.connection_id)
  expect((await page.request.get(`${IBA}/staff/import/plugin`)).status()).toBe(200)
  await ctx.close()
})

test('import data can never be deleted or edited through the REST API, even by a super admin', async () => {
  const [job] = await sql<{ id: number }>('select id from import_jobs where tenant_id = $1 order by id desc limit 1', [demoId])
  const [ref] = await sql<{ id: number }>('select id from import_refs where tenant_id = $1 order by id desc limit 1', [demoId])
  for (const [collection, id] of [['import-jobs', job?.id], ['import-refs', ref?.id]] as const) {
    if (!id) continue
    expect((await admin.delete(`/api/${collection}/${id}`)).status(), `${collection} delete`).toBeGreaterThanOrEqual(400)
    expect((await admin.patch(`/api/${collection}/${id}`, { data: { status: 'done' } })).status(), `${collection} patch`).toBeGreaterThanOrEqual(400)
    expect((await admin.post(`/api/${collection}`, { data: { label: 'x' } })).status(), `${collection} create`).toBeGreaterThanOrEqual(400)
  }
  expect((await sql('select 1 from import_jobs where id = $1', [job?.id])).length).toBe(1)
})
