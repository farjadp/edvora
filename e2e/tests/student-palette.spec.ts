import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DEMO, IBA, fakePhone } from './helpers'
import { loginAny, repoRoot } from './gamification-helpers'
import { adminCreds, apiAs } from './staff-helpers'

/**
 * Student palette (2026-11-07): /login, /dashboard and /learn take the Edvora turquoise/petrol palette through the
 * [data-student] tokens; the public site keeps the academy colours. axe (wcag2a + wcag2aa) must find no serious or
 * critical violation in light or dark. With SHOTS=1, screenshots go to docs/design/students/.
 */
test.describe.configure({ mode: 'serial' })

const shots = process.env.SHOTS === '1'
const shotDir = path.join(repoRoot, 'docs', 'design', 'students')
let admin: APIRequestContext

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'admin creds missing')
  admin = await apiAs(playwright, DEMO, email, password)
  if (shots) mkdirSync(shotDir, { recursive: true })
})

test.afterAll(async () => {
  await admin?.dispose()
})

const bgOf = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('[data-student]') ?? document.body).backgroundColor)

async function check(page: Page, name: string) {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(500)
    expect(await bgOf(page), `${name} [${theme}] background`).toBe(theme === 'light' ? 'rgb(247, 243, 232)' : 'rgb(10, 34, 49)')
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect.soft(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`), `${name} [${theme}]`).toEqual([])
    if (shots) await page.screenshot({ path: path.join(shotDir, `after-${name}-${theme}.png`), fullPage: true })
  }
}

test('public site keeps the academy palette', async ({ page }) => {
  for (const url of [`${DEMO}/`, `${IBA}/`]) {
    await page.goto(url)
    expect(await page.locator('[data-student]').count(), url).toBe(0)
  }
})

test('student login (both academies)', async ({ page }) => {
  await page.goto(`${DEMO}/login`)
  await expect(page.locator('[data-student]')).toHaveCount(1)
  await check(page, 'login-demo')
  await page.goto(`${IBA}/login`)
  await check(page, 'login-iba')
})

test('student dashboard and certificate', async ({ page }) => {
  test.setTimeout(120_000)
  // Plain login is enough for colours; the full Seal dashboard is covered by gamification-a11y.spec.ts.
  const phone = fakePhone()
  await loginAny(page, DEMO, phone)
  await page.goto(`${DEMO}/dashboard`)
  await expect(page.getByTestId('dashboard')).toBeVisible()
  await check(page, 'dashboard')

  const users = (await (await admin.get(`/api/users?where[phone][equals]=${phone}&depth=0`)).json()) as { docs: { id: number }[] }
  const certs = (await (await admin.get(`/api/certificates?where[code][equals]=ED-MGT-001&depth=0`)).json()) as { docs: { id: number }[] }
  const certId = certs.docs[0]!.id
  const set = await admin.patch(`/api/certificates/${certId}`, { data: { user: users.docs[0]!.id } })
  expect(set.ok(), await set.text()).toBeTruthy()
  try {
    await page.goto(`${DEMO}/dashboard/certificates/${certId}`)
    await expect(page.getByTestId('certificate-finale')).toBeVisible()
    await check(page, 'certificate')
  } finally {
    await admin.patch(`/api/certificates/${certId}`, { data: { user: null } })
  }
})
