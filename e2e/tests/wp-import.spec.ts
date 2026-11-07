import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { signRequest } from '../../packages/integrations/src/wordpress/signature'
import { DEMO, IBA } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, type StaffUser } from './staff-helpers'

// E-032: WordPress import on the demo academy with the committed fixture bundle (signed with the demo-only seeded
// connection `cnx_fixture` / `edvora-fixture-secret`). Runs against whatever earlier runs imported: the first upload
// may create or find everything unchanged; the re-upload must never create or update anything.

const BUNDLE = join(__dirname, '../../packages/integrations/src/wordpress/fixtures/sample-latest.edvora-bundle')
const SHOTS = process.env.E032_SCREENSHOTS ? join(__dirname, '../../docs/agents/handoffs/E-032') : null
const DATA = ['users', 'courses', 'lessons', 'questions', 'quizzes', 'coupons', 'orders', 'enrollments', 'posts']

let admin: APIRequestContext
let importer: StaffUser

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
  importer = await createStaff(admin, 'demo', 'academy-admin', 'importer')
})

test.afterAll(async () => {
  await admin?.dispose()
})

async function upload(page: Page, base: string) {
  await page.goto(`${base}/staff/import`)
  await expect(page.getByRole('heading', { name: 'انتقال از وردپرس', level: 1 })).toBeVisible()
  await page.locator('input[name="bundle"]').setInputFiles(BUNDLE)
  await page.getByRole('button', { name: 'بارگذاری و بررسی' }).click()
  await page.waitForURL(new RegExp(`${base.replace(/[.:/]/g, '\\$&')}/staff/import/\\d+`), { timeout: 60_000 })
}

/** Resolves every decision the report asks for (LMS choice, unmapped products) and saves once. */
async function decide(page: Page) {
  let changed = false
  const lms = page.locator('input[name="lms"][value="lifterlms"]')
  if ((await lms.count()) && !(await lms.isChecked())) {
    await lms.check()
    changed = true
  }
  for (const select of await page.locator('select[name^="product:"]').all()) {
    if ((await select.inputValue()) !== '') continue
    const suggested = select.locator('option', { hasText: '(پیشنهاد)' })
    await select.selectOption((await suggested.count()) ? ((await suggested.first().getAttribute('value')) ?? 'skip') : 'skip')
    changed = true
  }
  if (changed) {
    // The action answers with redirectTo; the browser reloads the job page with the new report.
    await page.evaluate(() => document.documentElement.setAttribute('data-stale', '1'))
    await page.getByRole('button', { name: 'ذخیره و بررسی دوباره' }).click()
    await page.waitForFunction(() => document.readyState === 'complete' && !document.documentElement.hasAttribute('data-stale'), undefined, { timeout: 60_000 })
  }
}

const cell = (page: Page, collection: string, action: string) => page.locator(`[data-testid="counts-table"] tr[data-collection="${collection}"] td[data-action="${action}"]`)

test('upload the fixture → dry run → map products → confirm → summary', async ({ page }) => {
  await staffLogin(page, DEMO, importer, '/staff/import')
  await page.waitForURL(`${DEMO}/staff/import`)
  if (SHOTS) {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: join(SHOTS, '01-start-375.png'), fullPage: true })
    await page.setViewportSize({ width: 1280, height: 900 })
  }
  await upload(page, DEMO)
  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'awaiting-confirm')
  // Dry run: detected stacks, counts, grouped warnings, held users, redirect preview. Nothing written yet.
  await expect(page.getByTestId('detected')).toContainText('LifterLMS')
  await expect(page.getByTestId('counts-table')).toBeVisible()
  await expect(page.getByTestId('warnings')).toBeVisible()
  await expect(page.getByTestId('held-users')).toContainText('شمارهٔ تکراری')
  await expect(page.getByTestId('redirects-preview')).toBeVisible()

  // Choosing the LMS can surface new unmapped products, so decide until nothing blocks.
  for (let i = 0; i < 3 && (await page.locator('[data-severity="blocking"]').count()); i++) await decide(page)
  await expect(page.locator('[data-severity="blocking"]')).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, '02-dry-run-desktop.png'), fullPage: true })

  await page.getByRole('button', { name: 'اجرای انتقال', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('هیچ چیزی از سایت وردپرس شما حذف نمی‌شود')
  if (SHOTS) await page.screenshot({ path: join(SHOTS, '03-confirm-desktop.png') })
  await dialog.getByRole('button', { name: 'بله، اجرا شود' }).click()

  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'done', { timeout: 120_000 })
  await expect(page.getByRole('heading', { name: 'نتیجهٔ انتقال' })).toBeVisible()
  await expect(page.getByTestId('counts-table')).toBeVisible()
  if (SHOTS) {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: join(SHOTS, '04-summary-375.png'), fullPage: true })
  }

  // Imported users exist in demo with the WordPress email as contact only (never the login email).
  const users = await admin.get(`/api/users?where[phone][equals]=09120000001&depth=0`)
  const doc = ((await users.json()) as { docs: { email: string; contactEmail?: string }[] }).docs[0]
  expect(doc?.email).toMatch(/@phone\.demo\.edvora\.local$/)
  expect(doc?.contactEmail).toBe('sara.rezaei@example.com')
})

test('re-uploading the same bundle changes nothing (idempotent)', async ({ page }) => {
  await staffLogin(page, DEMO, importer, '/staff/import')
  await page.waitForURL(`${DEMO}/staff/import`)
  await upload(page, DEMO)
  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'awaiting-confirm')
  // The previous run's decisions are reused for the same site.
  await expect(page.locator('[data-severity="blocking"]')).toHaveCount(0)
  for (const c of DATA) {
    const row = page.locator(`[data-testid="counts-table"] tr[data-collection="${c}"]`)
    if (!(await row.count())) continue
    await expect(cell(page, c, 'create'), `${c} create`).toHaveText('—')
    await expect(cell(page, c, 'update'), `${c} update`).toHaveText('—')
  }
  await expect(cell(page, 'users', 'unchanged')).not.toHaveText('—')
})

test('a bundle signed for demo is refused on the iba host', async ({ page }) => {
  const { email, password } = adminCreds()
  await staffLogin(page, IBA, { email, password }, '/staff/import')
  await page.waitForURL(`${IBA}/staff/import`)
  await upload(page, IBA)
  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'rejected')
  await expect(page.getByRole('alert').filter({ hasText: 'آکادمی' })).toBeVisible()
})

test('push API: signed ping works on demo; bad signature → 401; demo connection unknown on iba', async ({ request }) => {
  const path = '/api/import/push/ping'
  const ok = await request.get(`${DEMO}${path}`, { headers: { ...signRequest({ secret: 'edvora-fixture-secret', connectionId: 'cnx_fixture', method: 'GET', pathWithQuery: path }) } })
  expect(ok.status()).toBe(200)
  expect(await ok.json()).toMatchObject({ ok: true, tenant: 'demo' })

  const bad = await request.get(`${DEMO}${path}`, {
    headers: {
      'X-Edvora-Connection': 'cnx_fixture',
      'X-Edvora-Timestamp': String(Math.floor(Date.now() / 1000)),
      'X-Edvora-Nonce': randomBytes(16).toString('hex'),
      'X-Edvora-Signature': 'ab'.repeat(32),
    },
  })
  expect(bad.status()).toBe(401)
  expect(await bad.json()).toMatchObject({ ok: false, code: 'bad_signature' })

  // Replay of a valid request → 401.
  const headers = signRequest({ secret: 'edvora-fixture-secret', connectionId: 'cnx_fixture', method: 'GET', pathWithQuery: path })
  expect((await request.get(`${DEMO}${path}`, { headers: { ...headers } })).status()).toBe(200)
  const replay = await request.get(`${DEMO}${path}`, { headers: { ...headers } })
  expect(replay.status()).toBe(401)
  expect(await replay.json()).toMatchObject({ code: 'replay' })

  const iba = await request.get(`${IBA}${path}`, { headers: { ...signRequest({ secret: 'edvora-fixture-secret', connectionId: 'cnx_fixture', method: 'GET', pathWithQuery: path }) } })
  expect(iba.status()).toBe(401)
  expect(await iba.json()).toMatchObject({ code: 'unknown_connection' })
})

test('old Persian WordPress URLs redirect on the demo host only', async ({ request }) => {
  const old = `/product/${encodeURIComponent('مدیریت-استراتژیک-برند')}`
  const res = await request.get(`${DEMO}${old}`, { maxRedirects: 0 })
  expect(res.status()).toBe(308)
  expect(decodeURIComponent(res.headers().location ?? '')).toContain('/courses/مدیریت-استراتژیک-برند')

  const byId = await request.get(`${DEMO}/?p=1`, { maxRedirects: 0 })
  expect([301, 307, 308]).toContain(byId.status())
  expect(byId.headers().location).toContain('/blog/hello-world')

  expect((await request.get(`${IBA}${old}`, { maxRedirects: 0 })).status()).toBe(404)
  expect((await request.get(`${DEMO}/this-never-existed-${randomBytes(3).toString('hex')}`, { maxRedirects: 0 })).status()).toBe(404)
})

test('import desk is 403 for staff without import permissions', async ({ page }) => {
  const advisor = await createStaff(admin, 'demo', 'advisor', 'noimport')
  await staffLogin(page, DEMO, advisor, '/staff')
  await page.waitForURL((u) => u.pathname.startsWith('/staff') && !u.pathname.startsWith('/staff/login'))
  const res = await page.request.get(`${DEMO}/staff/import`, { maxRedirects: 0 })
  expect(res.status()).toBe(403)
  expect((await page.request.get(`${DEMO}/staff/import/plugin`, { maxRedirects: 0 })).status()).toBe(403)
})
