import { expect, test } from '@playwright/test'
import { fakePhone, login, startCheckout } from './helpers'

/**
 * Smoke test for a deployed demo environment (E-025). Skipped unless SMOKE_BASE_URL is set.
 * Run against Railway with the service's variables (admin login reads them, never prints them):
 *   railway run --service web -- env SMOKE_BASE_URL=https://<domain> E2E_NO_SERVER=1 pnpm e2e deployed-smoke
 */
const BASE = process.env.SMOKE_BASE_URL?.replace(/\/$/, '')

test.describe('deployed demo smoke', () => {
  test.skip(!BASE, 'SMOKE_BASE_URL not set')
  const base = BASE ?? ''

  test('home and course page serve the demo tenant only', async ({ page }) => {
    await page.goto(`${base}/`)
    await expect(page).toHaveTitle(/آکادمی نمونه ادورا/)
    await expect(page.getByText('برند ایران')).toHaveCount(0)
    await page.goto(`${base}/courses/demo-program`)
    await expect(page.getByRole('heading', { name: 'دوره نمونه مدیریت' })).toBeVisible()
  })

  test('OTP login (mock code) → mock checkout → result', async ({ page }) => {
    await login(page, base, fakePhone())
    await startCheckout(page, base, 'demo-program', { instalmentsLabel: '۴ قسط', coupon: 'TEST20' })
    expect(new URL(page.url()).origin).toBe(base)
    await expect(page.getByText('۳٬۸۴۰٬۰۰۰ تومان')).toBeVisible()
    await page.getByRole('link', { name: 'پرداخت موفق' }).click()
    await page.waitForURL(`${base}/payments/result?**`)
    expect(new URL(page.url()).searchParams.get('status')).toBe('partial')
  })

  test('/verify finds the sample certificate', async ({ page }) => {
    await page.goto(`${base}/verify?code=ED-MGT-001`)
    await expect(page.getByText('دانشجوی نمونه')).toBeVisible()
  })

  test('/admin login works with the seeded super admin', async ({ request }) => {
    const email = process.env.SEED_ADMIN_EMAIL
    const password = process.env.SEED_ADMIN_PASSWORD
    test.skip(!email || !password, 'SEED_ADMIN_* not in env (run via `railway run`)')
    const res = await request.post(`${base}/api/users/login`, { data: { email, password } })
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { user?: { roles?: string[] } }
    expect(body.user?.roles).toContain('super-admin')
    const admin = await request.get(`${base}/admin`)
    expect(admin.status()).toBe(200)
  })
})
