import { expect, test, type APIRequestContext } from '@playwright/test'
import { DEMO, IBA } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, type StaffUser } from './staff-helpers'

// E-035 QA: the console's gates are the access rules, not the sidebar. Direct URLs and the REST API.
let admin: APIRequestContext
let advisor: StaffUser
let finance: StaffUser
let ibaFinance: StaffUser

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
  advisor = await createStaff(admin, 'demo', 'advisor', 'qa-acc-advisor')
  finance = await createStaff(admin, 'demo', 'finance', 'qa-acc-finance')
  ibaFinance = await createStaff(admin, 'iba', 'finance', 'qa-acc-iba-finance')
})
test.afterAll(async () => {
  await admin?.dispose()
})

test('advisor: other desks by direct URL are refused (403, no data), own desk works', async ({ page }) => {
  await staffLogin(page, DEMO, advisor)
  await page.waitForURL((u) => !u.pathname.includes('login'))
  for (const d of ['finance', 'teaching', 'content']) {
    const res = await page.request.get(`${DEMO}/staff/${d}`, { maxRedirects: 0 })
    expect(res.status(), `/staff/${d}`).toBe(403)
    expect(await res.text(), `/staff/${d} leaks no figures`).not.toContain('۵۶۰٬۸۰۰٬۰۰۰')
  }
  expect((await page.request.get(`${DEMO}/staff/leads`)).status()).toBe(200)
})

test('REST: advisor cannot read orders/coupons; finance sees only their own academy; iba finance sees no demo order', async ({ playwright }) => {
  const a = await apiAs(playwright, DEMO, advisor.email, advisor.password)
  for (const c of ['orders', 'coupons', 'audit-logs']) {
    const r = await a.get(`/api/${c}?limit=1&depth=0`)
    const n = r.ok() ? ((await r.json()) as { totalDocs: number }).totalDocs : 0
    expect(n, `advisor ${c}`).toBe(0)
  }
  // users.view lets an advisor see memberships (collection rule), but only this academy's.
  const m = (await (await a.get('/api/memberships?limit=100&depth=0')).json()) as { docs: { tenant: number }[] }
  expect(new Set(m.docs.map((d) => d.tenant)).size).toBeLessThanOrEqual(1)
  await a.dispose()

  const f = await apiAs(playwright, DEMO, finance.email, finance.password)
  const mine = (await (await f.get('/api/orders?limit=1&depth=0')).json()) as { totalDocs: number }
  expect(mine.totalDocs).toBeGreaterThan(0)
  await f.dispose()

  const fi = await apiAs(playwright, IBA, ibaFinance.email, ibaFinance.password)
  const theirs = (await (await fi.get('/api/orders?limit=1&depth=0')).json()) as { totalDocs: number }
  expect(theirs.totalDocs).toBe(0)
  // The same person on the other host: no membership there, so no staff desk and no orders.
  const cross = await playwright.request.newContext({ baseURL: DEMO })
  const lr = await cross.post('/api/users/login', { data: { email: ibaFinance.email, password: ibaFinance.password } })
  if (lr.ok()) {
    const r = await cross.get('/api/orders?limit=1&depth=0')
    const n = r.ok() ? ((await r.json()) as { totalDocs: number }).totalDocs : 0
    expect(n, 'iba finance on the demo host').toBe(0)
  }
  await cross.dispose()
  await fi.dispose()
})

test('anonymous: no console data over REST, /admin and /staff ask for a login', async ({ request }) => {
  for (const c of ['orders', 'leads', 'coupons', 'enrollments', 'memberships', 'audit-logs']) {
    const r = await request.get(`${DEMO}/api/${c}?limit=1&depth=0`)
    const n = r.ok() ? ((await r.json()) as { totalDocs: number }).totalDocs : 0
    expect(n, `anonymous ${c}`).toBe(0)
  }
  const staff = await request.get(`${DEMO}/staff/finance`, { maxRedirects: 0 })
  expect([302, 303, 307]).toContain(staff.status())
  const adm = await request.get(`${DEMO}/admin/collections/orders`, { maxRedirects: 0 })
  expect(adm.status() === 200 ? await adm.text() : String(adm.status())).not.toContain('۵۶۰٬۸۰۰٬۰۰۰')
})
