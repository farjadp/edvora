import { randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { DEMO } from './helpers'
import { adminCreds, apiAs, createStaff, tenantId, type StaffUser } from './staff-helpers'

/**
 * E-047 (ADR 019): the settings hub.
 *  1. An academy admin changes the logo and the colours in /admin/settings and the public site shows them.
 *  2. An integration secret is stored but never returned by /api (REST list, by id, select, depth, tenants, audit).
 *  3. A non-admin is refused (menu, page and POST), and an academy admin cannot write into another academy
 *     or open the platform sections.
 * Test users live in the demo academy only; the demo colours, logo and integration are restored afterwards.
 */

test.describe.configure({ mode: 'serial' })

let admin: APIRequestContext
let demo: number
let iba: number
let academyAdmin: StaffUser
let original: { primaryColor: string; accentColor: string; logo: number | null }

/** A tiny valid PNG (1×1). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

async function signIn(page: Page, u: { email: string; password: string }) {
  const r = await page.request.post(`${DEMO}/api/users/login`, { data: { email: u.email, password: u.password } })
  expect(r.ok(), `login ${u.email}`).toBeTruthy()
}

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
  demo = await tenantId(admin, 'demo')
  iba = await tenantId(admin, 'iba')
  const t = (await (await admin.get(`/api/tenants/${demo}?depth=0`)).json()) as { primaryColor: string; accentColor: string; logo: number | null }
  original = { primaryColor: t.primaryColor, accentColor: t.accentColor, logo: t.logo ?? null }
  academyAdmin = await createStaff(admin, 'demo', 'academy-admin', 'settings-admin')
})

test.afterAll(async () => {
  if (admin && original) {
    await admin.patch(`/api/tenants/${demo}`, { data: { primaryColor: original.primaryColor, accentColor: original.accentColor, logo: original.logo } })
  }
  await admin?.dispose()
})

test('academy admin changes the logo and colours in the hub; the site shows them', async ({ page }) => {
  await signIn(page, academyAdmin)

  // The menu entry leads to the hub; the academy is the person's only one.
  await page.goto(`${DEMO}/admin/settings`)
  await expect(page.getByTestId('settings-hub')).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'بخش‌های تنظیمات' })
  await expect(nav.locator('[data-section="identity"]')).toBeVisible()
  await expect(nav.locator('[data-section="integrations"]')).toBeVisible()
  await expect(nav.locator('[data-section="platform-providers"]')).toHaveCount(0)

  // Identity: an SVG logo is refused (by content, whatever the name says).
  await nav.locator('[data-section="identity"]').click()
  await page.locator('input[name="logo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: SVG })
  await page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click()
  await expect(page.getByTestId('settings-error')).toContainText('SVG')

  // A real PNG is accepted.
  await page.locator('input[name="logo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click()
  await expect(page.getByTestId('settings-saved')).toBeVisible()

  // Appearance: a pale colour fails the AA checks (live and on save); a dark one passes.
  await page.goto(`${DEMO}/admin/settings/appearance`)
  await page.locator('#f-primaryColor').fill('#A7F3D0')
  await expect(page.getByTestId('colour-checks').locator('[data-pass="false"]').first()).toBeVisible()
  await page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click()
  await expect(page.getByTestId('settings-error')).toContainText('کنتراست')

  // Always a different colour from the current one, so the save is a real change (and is audited).
  const brand = ['#7C2D12', '#1E3A8A', '#14532D'].find((c) => c.toLowerCase() !== original.primaryColor.toLowerCase())!
  await page.locator('#f-primaryColor').fill(brand)
  await page.locator('#f-accentColor').fill('#F59E0B')
  await expect(page.getByTestId('colour-checks').locator('[data-pass="false"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click()
  await expect(page.getByTestId('settings-saved')).toBeVisible()

  // The public site: the new logo in the header and the new brand colour on :root.
  await page.goto(`${DEMO}/`)
  const logo = page.getByTestId('site-logo')
  await expect(logo).toBeVisible()
  expect(await logo.getAttribute('src')).toMatch(/logo-\d+-\d+\.png$/)
  const css = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim())
  expect(css.toLowerCase()).toBe(brand.toLowerCase())

  // Audit: who changed what, under settings.appearance.
  const audit = (await (await admin.get(`/api/audit-logs?where[action][equals]=settings.appearance&where[actor][equals]=${academyAdmin.id}&limit=1&depth=0`)).json()) as { docs: { changes: Record<string, unknown> }[] }
  expect(audit.docs[0]?.changes).toHaveProperty('primaryColor')
})

test('an integration secret is stored but never returned by /api', async ({ playwright }) => {
  const api = await apiAs(playwright, DEMO, academyAdmin.email, academyAdmin.password)
  const secret = `e2e-secret-${randomBytes(12).toString('hex')}`
  // The settings form posts like a browser on this origin (SMTP: never used at runtime, so other tests are unaffected).
  const save = await api.post('/api/settings/integrations', {
    headers: { Origin: DEMO },
    multipart: { academy: String(demo), kind: 'email', provider: 'smtp', 'config.host': 'smtp.example.test', 'config.port': '587', 'config.fromEmail': 'no-reply@example.test', secret, intent: 'save' },
    maxRedirects: 0,
  })
  expect(save.status()).toBe(303)
  expect(save.headers().location).toContain('saved=1')

  const bodies: string[] = []
  const list = await api.get('/api/integration-settings?depth=2&limit=50')
  expect(list.status()).toBe(200)
  const docs = ((await list.json()) as { docs: { id: number; kind: string; secretSetAt?: string }[] }).docs
  const row = docs.find((d) => d.kind === 'email')
  expect(row, 'the row is readable without its secret').toBeTruthy()
  expect(row?.secretSetAt).toBeTruthy()
  bodies.push(JSON.stringify(docs))
  for (const path of [
    `/api/integration-settings/${row!.id}?depth=2`,
    `/api/integration-settings?select[secretSealed]=true`,
    `/api/integration-settings?where[secretSealed][exists]=true`,
    `/api/tenants/${demo}?depth=2`,
    `/api/audit-logs?where[action][like]=settings.integrations&depth=0&limit=20`,
  ]) {
    const r = await api.get(path)
    bodies.push(`${r.status()} ${await r.text()}`)
  }
  for (const b of bodies) {
    expect(b).not.toContain(secret)
    expect(b).not.toContain('secretSealed":"v1.')
    expect(b).not.toMatch(/"v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"/)
  }
  // The audit row says it changed, never what it is.
  expect(bodies.join('\n')).toContain('[changed]')

  // Nobody writes the collection through the API, not even the academy admin.
  expect((await api.patch(`/api/integration-settings/${row!.id}`, { data: { secretSealed: 'x', enabled: true } })).status()).toBe(403)
  expect((await api.post('/api/integration-settings', { data: { kind: 'sms', provider: 'kavenegar', tenant: demo } })).status()).toBe(403)

  // Clean up: back to the mock without a key.
  const reset = await api.post('/api/settings/integrations', { headers: { Origin: DEMO }, multipart: { academy: String(demo), kind: 'email', provider: 'mock', 'secret.clear': 'on', intent: 'save' }, maxRedirects: 0 })
  expect(reset.status()).toBe(303)
  await api.dispose()
})

test('a non-admin is refused; an academy admin cannot reach another academy or the platform sections', async ({ page, playwright }) => {
  const advisor = await createStaff(admin, 'demo', 'advisor', 'settings-advisor')

  // Menu: no settings entry for an advisor.
  await signIn(page, advisor)
  await page.goto(`${DEMO}/admin`)
  await expect(page.locator('a[href="/admin/settings"]')).toHaveCount(0)
  // Page: nothing to open.
  await page.goto(`${DEMO}/admin/settings/identity`)
  await expect(page.getByTestId('settings-denied').first()).toBeVisible()
  await expect(page.locator('form[action="/api/settings/identity"]')).toHaveCount(0)

  // POST: 403, and the academy is unchanged.
  const advisorApi = await apiAs(playwright, DEMO, advisor.email, advisor.password)
  const before = ((await (await admin.get(`/api/tenants/${demo}?depth=0`)).json()) as { name: string }).name
  const r = await advisorApi.post('/api/settings/identity', { headers: { Origin: DEMO }, multipart: { academy: String(demo), name: 'هک‌شده' }, maxRedirects: 0 })
  expect(r.status()).toBe(403)
  const r2 = await advisorApi.post('/api/settings/integrations', { headers: { Origin: DEMO }, multipart: { academy: String(demo), kind: 'sms', provider: 'mock', intent: 'save' }, maxRedirects: 0 })
  expect(r2.status()).toBe(403)
  expect(((await (await admin.get(`/api/tenants/${demo}?depth=0`)).json()) as { name: string }).name).toBe(before)
  await advisorApi.dispose()

  // Anonymous: 401. Cross-site form post: 403.
  const anon = await playwright.request.newContext({ baseURL: DEMO })
  expect((await anon.post('/api/settings/identity', { headers: { Origin: DEMO }, multipart: { academy: String(demo), name: 'x' }, maxRedirects: 0 })).status()).toBe(401)
  await anon.dispose()

  const adminApi = await apiAs(playwright, DEMO, academyAdmin.email, academyAdmin.password)
  expect((await adminApi.post('/api/settings/identity', { headers: { Origin: 'https://evil.example' }, multipart: { academy: String(demo), name: 'x' }, maxRedirects: 0 })).status()).toBe(403)
  // Tenant isolation: the demo admin names the iba academy.
  expect((await adminApi.post('/api/settings/identity', { headers: { Origin: DEMO }, multipart: { academy: String(iba), name: 'x' }, maxRedirects: 0 })).status()).toBe(403)
  // Platform sections are for Edvora super admins only.
  expect((await adminApi.post('/api/settings/platform-providers', { headers: { Origin: DEMO }, multipart: { staff2fa: 'optional' }, maxRedirects: 0 })).status()).toBe(403)
  expect((await adminApi.post('/api/settings/platform-academies', { headers: { Origin: DEMO }, multipart: { academyId: String(demo), plan: 'pro', domains: 'evil.example' }, maxRedirects: 0 })).status()).toBe(403)
  await adminApi.dispose()
})
