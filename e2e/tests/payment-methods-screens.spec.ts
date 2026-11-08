import { test, type Page } from '@playwright/test'
import { DEMO, fakePhone, login, startCheckout } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin } from './staff-helpers'

/**
 * E-045 screenshots for the PR and docs/design/e045 (not part of CI: run with SCREENS=1).
 *   SCREENS=1 E2E_NO_SERVER=1 E2E_PORT=3061 pnpm e2e payment-methods-screens
 */
test.skip(!process.env.SCREENS, 'screenshots only on demand (SCREENS=1)')

const OUT = 'docs/design/e045'
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })

test('payment method screens', async ({ page, playwright }) => {
  test.setTimeout(300_000)
  const c = adminCreds()
  const admin = await apiAs(playwright, DEMO, c.email, c.password)
  const a = await createStaff(admin, 'demo', 'finance', 'shot-a')

  for (const [w, h] of [[1440, 900], [375, 812]] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.context().clearCookies()
    await login(page, DEMO, fakePhone())
    await startCheckout(page, DEMO, 'demo-program', { stopAtMethods: true, instalmentsLabel: '۴ قسط' })
    await shot(page, `pay-methods-${w}`)
    await page.getByTestId('method-card').locator('summary').click()
    await shot(page, `pay-card-${w}`)
    await page.getByTestId('method-card').locator('summary').click()
    await page.getByTestId('method-usdt').locator('summary').click()
    await page.getByRole('button', { name: 'دیدن آدرس و مبلغ تتر' }).click()
    await page.waitForURL(/\/payments\/\d+$/)
    await shot(page, `usdt-invoice-${w}`)
    await page.getByLabel('شناسهٔ تراکنش (TxID / Hash)').fill(`d${Date.now().toString(16)}`.padEnd(64, '3'))
    await page.getByRole('button', { name: 'ثبت و بررسی تراکنش' }).click()
    await page.waitForSelector('[data-status="submitted"]')
    await shot(page, `status-waiting-${w}`)
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.context().clearCookies()
  await staffLogin(page, DEMO, a, '/staff/finance')
  await page.waitForURL(`${DEMO}/staff/finance`)
  await page.getByTestId('review-queue').scrollIntoViewIfNeeded()
  await shot(page, 'finance-queue-1440')

  await page.context().clearCookies()
  await page.goto(`${DEMO}/admin/login`)
  await page.getByLabel(/ایمیل|Email/).fill(c.email)
  await page.getByLabel(/رمز|Password/).fill(c.password)
  await page.getByRole('button', { name: /ورود|Login/ }).click()
  await page.waitForURL(/\/admin(?!\/login)/)
  const list = (await (await admin.get('/api/payment-methods?where[method][equals]=usdt&limit=1&depth=0')).json()) as { docs: { id: number }[] }
  await page.goto(`${DEMO}/admin/collections/payment-methods/${list.docs[0]!.id}`)
  await page.waitForSelector('.ed-warning')
  await shot(page, 'admin-usdt-1440')
  const zp = (await (await admin.get('/api/payment-methods?where[method][equals]=zarinpal&limit=1&depth=0')).json()) as { docs: { id: number }[] }
  await page.goto(`${DEMO}/admin/collections/payment-methods/${zp.docs[0]!.id}`)
  await page.waitForTimeout(1500)
  await shot(page, 'admin-gateway-1440')
  await admin.dispose()
})
