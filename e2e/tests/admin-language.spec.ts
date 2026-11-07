import { expect, test } from '@playwright/test'
import { IBA } from './helpers'
import { adminCreds } from './staff-helpers'

// E-035: /admin opens in Persian/RTL whatever the browser language; English only by the person's own choice.
test.use({ locale: 'en-US', extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' } })

/** Group and collection labels that must never show in English while the admin is in Persian. */
const ENGLISH = ['People & access', 'Quizzes & assignments', 'Academies', 'Create New', 'Collections', 'Learning', 'Sales', 'Content', 'Dashboard', 'Orders', 'Leads (CRM)']

test('English browser, no cookie → /admin/login is fa + RTL', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto(`${IBA}/admin/login`)
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa')
  await expect(page.locator('html')).toHaveAttribute('dir', /rtl/i)
  expect((await context.cookies()).find((c) => c.name === 'payload-lng')?.value).toBe('fa')
})

test('signed in: fa admin has no English labels; choosing English in Account sticks across reloads', async ({ page, context }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  await context.clearCookies()
  const res = await page.request.post(`${IBA}/api/users/login`, { data: { email, password } })
  expect(res.ok()).toBeTruthy()

  await page.goto(`${IBA}/admin`)
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa')
  await expect(page.locator('.c-dash__title')).toBeVisible()
  const nav = (await page.locator('aside.nav').innerText()) + (await page.locator('main, .template-default__wrap').first().innerText())
  for (const label of ENGLISH) expect(nav, label).not.toMatch(new RegExp(`(^|\\n|\\s)${label.replace(/[()&]/g, '\\$&')}(\\s|\\n|$)`))

  // The person's own choice: Account → language → English.
  await page.goto(`${IBA}/admin/account`)
  await page.locator('#language-select').click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 30_000 })
  expect((await context.cookies()).find((c) => c.name === 'payload-lng')?.value).toBe('en')

  for (let i = 0; i < 2; i++) {
    await page.goto(`${IBA}/admin`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('html')).toHaveAttribute('dir', /ltr/i)
  }
})
