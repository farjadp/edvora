import { expect, type Page } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3000)

/** Tenant base URLs. The tenant comes from the Host header. */
export const DEMO = `http://demo.localhost:${port}`
export const IBA = `http://localhost:${port}`

/** Fake test numbers only (0912000xxxx). Random suffix so re-runs against the same DB don't collide. */
export function fakePhone(): string {
  return `0912000${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
}

/** Phone OTP login with the mock SMS provider: the dev code is printed on the login screen. */
export async function login(page: Page, base: string, phone: string, next = '/dashboard'): Promise<void> {
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel('شماره موبایل').fill(phone)
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click()

  const devCode = page.locator('p', { hasText: 'حالت توسعه' }).locator('span')
  await expect(devCode).toHaveText(/^\d{5}$/)
  const code = (await devCode.textContent())?.trim() ?? ''

  await page.getByLabel('کد ورود').fill(code)
  await page.getByLabel(/نام و نام خانوادگی/).fill('دانشجوی تست')
  await page.getByRole('button', { name: 'ورود', exact: true }).click()
  await page.waitForURL(`${base}${next}`)
}

/** The course page's enrol card: pick a payment plan, optional coupon, go to the gateway. */
export async function startCheckout(page: Page, base: string, slug: string, opts: { instalmentsLabel?: string; coupon?: string; stopAtMethods?: boolean } = {}) {
  await page.goto(`${base}/courses/${slug}`)
  if (opts.instalmentsLabel) await page.locator('label', { hasText: opts.instalmentsLabel }).click()
  if (opts.coupon) await page.getByPlaceholder('کد تخفیف (اختیاری)').fill(opts.coupon)
  await page.getByRole('button', { name: 'ثبت‌نام و پرداخت' }).click()
  // ADR 017: checkout lands on the order's payment page; the first online gateway leads to the mock bank page.
  await page.waitForURL(/\/pay\/\d+/)
  if (opts.stopAtMethods) return
  await payWithFirstGateway(page)
}

/** On /pay/<order>: opens the first online-gateway method and goes to the (mock) bank page. */
export async function payWithFirstGateway(page: Page) {
  const gw = page.locator('details', { has: page.locator('form[action="/payments/start"]') }).first()
  if (!(await gw.evaluate((d) => (d as HTMLDetailsElement).open))) await gw.locator('summary').click()
  await gw.getByRole('button', { name: /^پرداخت/ }).click()
  await page.waitForURL(/\/pay\/mock\?/)
}

/** Dashboard row of the orders table for a course. */
export function orderRow(page: Page, courseTitle: string) {
  return page.locator('tbody tr', { hasText: courseTitle })
}
