import { readFileSync } from 'node:fs'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { DEMO, fakePhone, login, startCheckout } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, type StaffUser } from './staff-helpers'

/**
 * E-023 (ADR 021): the finance desk on the demo academy with mock providers. Overdue list (the seeded order has
 * instalment 2 overdue), contact notes, refunds with four-eyes (the requester never approves), and the Excel
 * export (finance.export only, audit-logged). Staff are created per run through the REST API in `demo` only.
 */

const COURSE = 'demo-program'
let admin: APIRequestContext
let first: StaffUser
let second: StaffUser
let support: StaffUser

test.beforeAll(async ({ playwright }) => {
  const c = adminCreds()
  admin = await apiAs(playwright, DEMO, c.email, c.password)
  first = await createStaff(admin, 'demo', 'finance', 'fin-first')
  second = await createStaff(admin, 'demo', 'finance', 'fin-second')
  support = await createStaff(admin, 'demo', 'support', 'fin-support')
})

test.afterAll(async () => {
  await admin?.dispose()
})

async function asStaff(page: Page, u: StaffUser, path = '/staff/finance') {
  await page.context().clearCookies()
  await staffLogin(page, DEMO, u, path)
  await page.waitForURL(`${DEMO}${path}`)
}

/** A new student pays a pay-in-full order (12,000,000 toman) on the mock gateway. Returns the order id. */
async function paidOrder(page: Page): Promise<number> {
  await page.context().clearCookies()
  await login(page, DEMO, fakePhone())
  await startCheckout(page, DEMO, COURSE, { stopAtMethods: true })
  const orderId = Number(/\/pay\/(\d+)/.exec(page.url())![1])
  const gw = page.locator('details', { has: page.locator('form[action="/payments/start"]') }).first()
  if (!(await gw.evaluate((d) => (d as HTMLDetailsElement).open))) await gw.locator('summary').click()
  await gw.getByRole('button', { name: /^پرداخت/ }).click()
  await page.waitForURL(/\/pay\/mock\?/)
  await page.getByRole('link', { name: 'پرداخت موفق' }).click()
  await page.waitForURL(/\/payments\/result\?/)
  expect(new URL(page.url()).searchParams.get('status')).toBe('paid')
  return orderId
}

async function orderStatus(orderId: number): Promise<string> {
  const res = await admin.get(`/api/orders/${orderId}?depth=0`)
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { status: string }).status
}

test.describe('finance desk (E-023)', () => {
  test('overview shows the four KPIs in toman with Persian digits', async ({ page }) => {
    await asStaff(page, first)
    await expect(page.getByTestId('finance-tabs')).toBeVisible()
    for (const id of ['kpi-collected', 'kpi-due-week', 'kpi-overdue', 'kpi-pending']) await expect(page.getByTestId(id)).toBeVisible()
    await expect(page.getByTestId('kpi-overdue')).toContainText(/[۰-۹]/)
    await expect(page.getByTestId('kpi-overdue')).not.toContainText(/[0-9]/)
  })

  test('overdue list shows the seeded overdue instalment; filters and a contact note work', async ({ page }) => {
    await asStaff(page, first, '/staff/finance?tab=overdue')
    const view = page.getByTestId('overdue-view')
    // Seed: «دانشجوی نمونه», «دوره نمونه مدیریت», instalment 2 of 3, 4,000,000 toman, due 5 days before the seed.
    const row = view.locator('tbody tr', { hasText: 'دانشجوی نمونه' }).filter({ hasText: '۴٬۰۰۰٬۰۰۰ تومان' }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('دوره نمونه مدیریت')
    await expect(row).toContainText(/[۰-۹]+ روز/)
    await expect(row.getByRole('link', { name: 'ثبت پرداخت دستی' })).toHaveAttribute('href', /\/staff\/payments\/orders\/\d+#h-manual$/)

    // Days-overdue bucket filter: 60+ hides it, 1–7 keeps it.
    await page.goto(`${DEMO}/staff/finance?tab=overdue&late=60%2B`)
    await expect(page.getByTestId('overdue-view').locator('tbody tr', { hasText: 'دانشجوی نمونه' })).toHaveCount(0)
    await page.goto(`${DEMO}/staff/finance?tab=overdue&late=1-7`)
    const again = page.getByTestId('overdue-view').locator('tbody tr', { hasText: 'دانشجوی نمونه' }).filter({ hasText: '۴٬۰۰۰٬۰۰۰ تومان' }).first()
    await expect(again).toBeVisible()

    // Record a contact note → it becomes the row's «آخرین تماس».
    const contact = again.locator('[data-testid^="contact-"]')
    await contact.locator('summary').click()
    await contact.getByLabel('نتیجه').selectOption('promised')
    const note = `قول پرداخت تا آخر هفته ${Date.now()}`
    await contact.getByLabel('یادداشت (اختیاری)').fill(note)
    await contact.getByRole('button', { name: 'ثبت یادداشت' }).click()
    await page.waitForURL(/tab=overdue/)
    await expect(page.getByTestId('overdue-view').locator('tbody tr', { hasText: note }).getByTestId('last-contact')).toContainText('قول پرداخت داد')
  })

  test('upcoming instalments: 7 and 30 day windows', async ({ page }) => {
    await asStaff(page, first, '/staff/finance?tab=upcoming&days=30')
    // Seed: instalment 3 of the same order is due 25 days after the seed.
    await expect(page.getByTestId('upcoming-view').locator('tbody tr', { hasText: 'دانشجوی نمونه' }).first()).toBeVisible()
    await page.goto(`${DEMO}/staff/finance?tab=upcoming&days=7`)
    await expect(page.getByTestId('upcoming-view')).toBeVisible()
  })

  test('refund needs a second person: request → the requester cannot approve → second approves and pays back', async ({ page }) => {
    const orderId = await paidOrder(page)
    const orderPage = `/staff/payments/orders/${orderId}`

    // First finance person asks for more than was paid (refused), then a partial refund of 2,000,000 toman.
    await asStaff(page, first, orderPage)
    const form = page.getByTestId('refund-request-form')
    await form.getByLabel('مبلغ بازپرداخت (تومان)').fill('۱۳٬۰۰۰٬۰۰۰')
    await form.getByLabel('دلیل بازپرداخت').fill('انصراف دانشجو پیش از شروع دوره')
    await form.getByRole('button', { name: 'ثبت درخواست بازپرداخت' }).click()
    await expect(form.getByRole('alert')).toContainText('بیشتر است')
    await form.getByLabel('مبلغ بازپرداخت (تومان)').fill('2000000')
    await form.getByRole('button', { name: 'ثبت درخواست بازپرداخت' }).click()
    const refund = page.locator('[data-testid^="refund-"][data-status]').first()
    await expect(refund).toHaveAttribute('data-status', 'requested')
    const refundId = Number((await refund.getAttribute('data-testid'))!.replace('refund-', ''))
    // The requester is never offered approval (four-eyes), and the server refuses it anyway.
    await expect(refund.getByRole('button', { name: 'تأیید بازپرداخت' })).toHaveCount(0)
    await expect(refund.getByRole('button', { name: 'لغو درخواست' })).toBeVisible()

    // Second person approves, then records the bank reference.
    await asStaff(page, second, orderPage)
    const r2 = page.getByTestId(`refund-${refundId}`)
    await r2.getByRole('button', { name: 'تأیید بازپرداخت' }).click()
    await expect(page.getByTestId(`refund-${refundId}`)).toHaveAttribute('data-status', 'approved')
    await page.getByTestId(`refund-${refundId}`).getByRole('button', { name: 'ثبت واریز' }).click()
    await page.getByTestId(`refund-${refundId}`).getByLabel('شمارهٔ پیگیری واریز').fill('PAYA-E2E-1')
    await page.getByTestId(`refund-${refundId}`).getByRole('button', { name: 'ثبت واریز بازپرداخت' }).click()
    await expect(page.getByTestId(`refund-${refundId}`)).toHaveAttribute('data-status', 'refunded')
    // Partial: the order stays paid.
    expect(await orderStatus(orderId)).toBe('paid')

    // Full refund of the rest (10,000,000) closes the order.
    await asStaff(page, first, orderPage)
    await page.getByTestId('refund-request-form').getByRole('button', { name: 'کل مبلغ' }).click()
    await expect(page.getByTestId('refund-request-form').getByLabel('مبلغ بازپرداخت (تومان)')).toHaveValue('10000000')
    await page.getByTestId('refund-request-form').getByLabel('دلیل بازپرداخت').fill('بازگشت باقی‌ماندهٔ مبلغ')
    await page.getByTestId('refund-request-form').getByRole('button', { name: 'ثبت درخواست بازپرداخت' }).click()
    const full = page.locator('[data-testid^="refund-"][data-status="requested"]').first()
    await expect(full).toBeVisible()
    const fullId = (await full.getAttribute('data-testid'))!
    await asStaff(page, second, orderPage)
    await page.getByTestId(fullId).getByRole('button', { name: 'تأیید بازپرداخت' }).click()
    await expect(page.getByTestId(fullId)).toHaveAttribute('data-status', 'approved')
    await page.getByTestId(fullId).getByRole('button', { name: 'ثبت واریز' }).click()
    await page.getByTestId(fullId).getByLabel('شمارهٔ پیگیری واریز').fill('PAYA-E2E-2')
    await page.getByTestId(fullId).getByRole('button', { name: 'ثبت واریز بازپرداخت' }).click()
    await expect(page.getByTestId(fullId)).toHaveAttribute('data-status', 'refunded')
    expect(await orderStatus(orderId)).toBe('refunded')
    await expect(page.getByTestId('refund-request-form')).toHaveCount(0)

    // Every step is in the audit log.
    const audit = await admin.get(`/api/audit-logs?where[targetCollection][equals]=refunds&where[docId][equals]=${refundId}&limit=10&depth=0`)
    const actions = ((await audit.json()) as { docs: { action: string }[] }).docs.map((d) => d.action).sort()
    expect(actions).toEqual(['refunds.approved', 'refunds.refunded', 'refunds.requested'])

    // Full refund → certificates revoked / XP reversed (Farjad: «Revoke both»), recorded on the refund's audit trail.
    const fullAudit = await admin.get(`/api/audit-logs?where[targetCollection][equals]=refunds&where[docId][equals]=${fullId.replace('refund-', '')}&limit=10&depth=0`)
    expect(((await fullAudit.json()) as { docs: { action: string }[] }).docs.map((d) => d.action)).toContain('refunds.revoked')
  })

  test('Excel export downloads an .xlsx for finance; others get 404', async ({ page }) => {
    await asStaff(page, first, '/staff/finance?tab=export')
    const form = page.getByTestId('export-form')
    const [download] = await Promise.all([page.waitForEvent('download'), form.getByRole('button', { name: 'دریافت فایل اکسل' }).click()])
    expect(download.suggestedFilename()).toMatch(/^finance-demo-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.xlsx$/)
    const bytes = readFileSync((await download.path())!)
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(bytes.toString('latin1')).toContain('xl/worksheets/sheet3.xml')

    const audit = await admin.get(`/api/audit-logs?where[action][equals]=finance.exported&where[actor][equals]=${first.id}&limit=1&depth=0`)
    expect(((await audit.json()) as { totalDocs: number }).totalDocs).toBeGreaterThan(0)

    // Support (no finance.export): no export tab and the route answers 404.
    await page.context().clearCookies()
    await staffLogin(page, DEMO, support)
    await page.waitForURL(/\/staff\//)
    const res = await page.request.get(`${DEMO}/staff/payments/export?from=2026-01-01&to=2026-01-31`)
    expect(res.status()).toBe(404)
  })
})
