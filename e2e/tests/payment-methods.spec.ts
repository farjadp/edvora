import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { DEMO, fakePhone, login, startCheckout } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, type StaffUser } from './staff-helpers'

/**
 * E-045 (ADR 017): every payment method on the demo academy, all on mocks (PAYMENT_PROVIDER=mock, mock chain).
 * Four-eyes: the person who records a card-to-card / manual / unverified Tether payment can never confirm it; a
 * different finance person does. Staff are created per run through the REST API in `demo` only.
 */

const COURSE = 'demo-program'
let admin: APIRequestContext
let first: StaffUser
let second: StaffUser

test.beforeAll(async ({ playwright }) => {
  const c = adminCreds()
  admin = await apiAs(playwright, DEMO, c.email, c.password)
  first = await createStaff(admin, 'demo', 'finance', 'pay-first')
  second = await createStaff(admin, 'demo', 'finance', 'pay-second')
})

test.afterAll(async () => {
  await admin?.dispose()
})

/** A new student at the methods page of a fresh, pay-in-full order. Returns the order id. */
async function newOrder(page: Page): Promise<number> {
  await page.context().clearCookies()
  await login(page, DEMO, fakePhone())
  await startCheckout(page, DEMO, COURSE, { stopAtMethods: true })
  return Number(/\/pay\/(\d+)/.exec(page.url())![1])
}

const method = (page: Page, key: string) => page.getByTestId(`method-${key}`)

async function openMethod(page: Page, key: string) {
  const m = method(page, key)
  if (!(await m.evaluate((d) => (d as HTMLDetailsElement).open))) await m.locator('summary').click()
  return m
}

const paymentIdOf = (page: Page) => Number(/\/payments\/(\d+)/.exec(page.url())![1])

/** Staff browser session on the finance desk of the demo academy. */
async function asStaff(page: Page, u: StaffUser, path = '/staff/finance') {
  await page.context().clearCookies()
  await staffLogin(page, DEMO, u, path)
  await page.waitForURL(`${DEMO}${path}`)
}

async function submitCard(page: Page, tracking: string, expectSaved = true) {
  const m = await openMethod(page, 'card')
  await expect(m.getByTestId('card-number')).toHaveText('9999-9900-0000-0006')
  await m.getByLabel('۴ رقم آخر کارت شما').fill('۱۲۳۴')
  await m.getByLabel('شمارهٔ پیگیری یا مرجع').fill(tracking)
  const now = new Date(Date.now() + 3.5 * 3600 * 1000 - 5 * 60 * 1000).toISOString().slice(0, 16) // Tehran wall clock, 5 min ago
  await m.getByLabel('زمان واریز').fill(now)
  await m.getByRole('button', { name: 'ثبت اطلاعات واریز' }).click()
  if (expectSaved) await page.waitForURL(/\/payments\/\d+$/)
}

const tracking = () => String(Date.now()).slice(-10) + String(Math.floor(Math.random() * 90 + 10))

test.describe('payment methods (ADR 017)', () => {
  test('checkout lists only the academy’s enabled methods, in its order', async ({ page }) => {
    await newOrder(page)
    // 12,000,000 toman, pay in full.
    await expect(page.getByTestId('pay-amount')).toHaveText('۱۲٬۰۰۰٬۰۰۰ تومان')
    const keys = await page.locator('[data-testid^="method-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    expect(keys).toEqual(['method-zarinpal', 'method-saman', 'method-card', 'method-usdt'])
    await expect(page.getByText('ثبت دستی')).toHaveCount(0)
  })

  test('online gateway (Saman on the mock) → paid, and a replayed callback changes nothing', async ({ page }) => {
    await newOrder(page)
    const m = await openMethod(page, 'saman')
    await m.getByRole('button', { name: /^پرداخت/ }).click()
    await page.waitForURL(/\/pay\/mock\?/)
    const callback = await page.getByRole('link', { name: 'پرداخت موفق' }).getAttribute('href')
    await page.getByRole('link', { name: 'پرداخت موفق' }).click()
    await page.waitForURL(/\/payments\/result\?/)
    expect(new URL(page.url()).searchParams.get('status')).toBe('paid')
    // Replay: idempotent, still paid, no second enrollment or payment.
    await page.goto(callback!)
    await page.waitForURL(/\/payments\/result\?/)
    expect(new URL(page.url()).searchParams.get('status')).toBe('paid')
  })

  test('card-to-card: student submits, first person records, the recorder cannot confirm, a second person confirms', async ({ page }) => {
    const orderId = await newOrder(page)
    const code = tracking()
    await submitCard(page, code)
    const pid = paymentIdOf(page)
    await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'submitted')
    await expect(page.getByRole('heading', { name: 'پرداخت شما ثبت شد' })).toBeVisible()

    // No double payment while it waits: the pay page says so and offers no methods.
    await page.goto(`${DEMO}/pay/${orderId}`)
    await expect(page.getByTestId('pay-awaiting')).toBeVisible()
    await expect(page.locator('[data-testid^="method-"]')).toHaveCount(0)

    await test.step('first finance person records it', async () => {
      await asStaff(page, first)
      const card = page.getByTestId(`payment-${pid}`)
      await expect(card).toContainText(code)
      await expect(card.getByRole('button', { name: 'تأیید نهایی' })).toHaveCount(0)
      await card.getByRole('button', { name: 'بررسی شد، ثبت برای تأیید' }).click()
      await expect(page.getByTestId(`payment-${pid}`)).toHaveAttribute('data-status', 'recorded')
    })

    await test.step('the recorder is not offered confirm (four-eyes)', async () => {
      await page.reload()
      const card = page.getByTestId(`payment-${pid}`)
      await expect(card).toContainText('تأیید نهایی با همکار دیگری است')
      await expect(card.getByRole('button', { name: 'تأیید نهایی' })).toHaveCount(0)
    })

    await test.step('a second finance person confirms it', async () => {
      await asStaff(page, second)
      const card = page.getByTestId(`payment-${pid}`)
      await card.getByRole('button', { name: 'تأیید نهایی' }).click()
      await expect(page.getByTestId(`payment-${pid}`)).toHaveCount(0) // left the queue
      await page.goto(`${DEMO}/staff/payments/orders/${orderId}`)
      await expect(page.getByTestId('instalment-0')).toHaveAttribute('data-status', 'paid')
      await expect(page.getByTestId(`payment-${pid}`)).toHaveAttribute('data-status', 'confirmed')
    })

    await test.step('the same tracking number cannot be used again', async () => {
      await newOrder(page)
      await submitCard(page, code, false)
      await expect(page.locator('p[role="alert"]')).toContainText('این شمارهٔ پیگیری قبلاً')
    })
  })

  test('card-to-card rejected with a reason: the student sees it calmly', async ({ page }) => {
    await newOrder(page)
    await submitCard(page, tracking())
    const pid = paymentIdOf(page)
    const student = await page.context().cookies()
    await asStaff(page, first)
    const card = page.getByTestId(`payment-${pid}`)
    await card.getByRole('button', { name: 'رد' }).click()
    await card.getByLabel('دلیل رد (دانشجو آن را می‌بیند)').fill('واریزی با این شمارهٔ پیگیری در حساب پیدا نشد.')
    await card.getByRole('button', { name: 'ثبت رد' }).click()
    await expect(page.getByTestId(`payment-${pid}`)).toHaveCount(0)

    // Who rejected and why, as stored (the student's page shows `rejectionReason`).
    const res = await admin.get(`/api/payments/${pid}?depth=0`)
    const doc = (await res.json()) as { status: string; rejectionReason: string; rejectedBy: number }
    expect(doc.status).toBe('rejected')
    expect(doc.rejectionReason).toContain('پیدا نشد')
    expect(doc.rejectedBy).toBe(first.id)

    await page.context().clearCookies()
    await page.context().addCookies(student)
    await page.goto(`${DEMO}/payments/${pid}`)
    await expect(page.getByRole('heading', { name: 'پرداخت تأیید نشد' })).toBeVisible()
    await expect(page.getByTestId('rejection-reason')).toContainText('پیدا نشد')
    await expect(page.getByRole('link', { name: 'پرداخت دوباره' })).toBeVisible()
  })

  test('manual payment: recorded by one person, confirmed by another', async ({ page }) => {
    const orderId = await newOrder(page)
    await asStaff(page, first, `/staff/payments/orders/${orderId}`)
    const form = page.getByTestId('manual-payment-form')
    await form.getByLabel('شیوه').selectOption('cash')
    await form.getByLabel('زمان پرداخت').fill(new Date(Date.now() + 3.5 * 3600 * 1000 - 60_000).toISOString().slice(0, 16))
    await form.getByLabel('شمارهٔ رسید / مرجع (اختیاری)').fill('R-1001')
    await form.getByRole('button', { name: 'ثبت پرداخت دستی' }).click()
    const row = page.locator('[data-testid^="payment-"][data-status="recorded"]')
    await expect(row).toHaveCount(1)
    await expect(row.getByRole('button', { name: 'تأیید نهایی' })).toHaveCount(0)

    await asStaff(page, second, `/staff/payments/orders/${orderId}`)
    await page.locator('[data-testid^="payment-"][data-status="recorded"]').getByRole('button', { name: 'تأیید نهایی' }).click()
    await expect(page.locator('[data-testid^="payment-"][data-status="confirmed"]')).toHaveCount(1)
    await expect(page.getByTestId('instalment-0')).toHaveAttribute('data-status', 'paid')
  })

  test('Tether TRC20: quote at the manual rate, verified on-chain (mock), hash reuse refused', async ({ page }) => {
    const hash = `a${Date.now().toString(16)}`.padEnd(64, '0')
    await newOrder(page)
    const m = await openMethod(page, 'usdt')
    await m.getByRole('button', { name: 'دیدن آدرس و مبلغ تتر' }).click()
    await page.waitForURL(/\/payments\/\d+$/)
    // 120,000,000 rial at 1,000,000 rial per USDT.
    await expect(page.getByTestId('usdt-amount')).toHaveText('120.00 USDT')
    await expect(page.getByTestId('usdt-wallet')).toHaveText(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)
    await page.getByLabel('شناسهٔ تراکنش (TxID / Hash)').fill(hash)
    await page.getByRole('button', { name: 'ثبت و بررسی تراکنش' }).click()
    await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'confirmed')

    await newOrder(page)
    await (await openMethod(page, 'usdt')).getByRole('button', { name: 'دیدن آدرس و مبلغ تتر' }).click()
    await page.waitForURL(/\/payments\/\d+$/)
    await page.getByLabel('شناسهٔ تراکنش (TxID / Hash)').fill(hash)
    await page.getByRole('button', { name: 'ثبت و بررسی تراکنش' }).click()
    await expect(page.locator('p[role="alert"]')).toContainText('قبلاً برای پرداخت دیگری ثبت شده')
  })

  test('Tether: a short amount fails; an unavailable verifier goes to the four-eyes queue', async ({ page }) => {
    await newOrder(page)
    await (await openMethod(page, 'usdt')).getByRole('button', { name: 'دیدن آدرس و مبلغ تتر' }).click()
    await page.waitForURL(/\/payments\/\d+$/)
    await page.getByLabel('شناسهٔ تراکنش (TxID / Hash)').fill(`b${Date.now().toString(16)}`.padEnd(64, '1'))
    await page.getByRole('button', { name: 'ثبت و بررسی تراکنش' }).click()
    await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'failed')
    await expect(page.getByTestId('usdt-failed')).toContainText('کمتر است')

    await page.getByRole('link', { name: 'پرداخت دوباره' }).click()
    await (await openMethod(page, 'usdt')).getByRole('button', { name: 'دیدن آدرس و مبلغ تتر' }).click()
    await page.waitForURL(/\/payments\/\d+$/)
    const pid = paymentIdOf(page)
    await page.getByLabel('شناسهٔ تراکنش (TxID / Hash)').fill(`d${Date.now().toString(16)}`.padEnd(64, '2'))
    await page.getByRole('button', { name: 'ثبت و بررسی تراکنش' }).click()
    await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'submitted')

    await asStaff(page, first)
    await page.getByTestId(`payment-${pid}`).getByRole('button', { name: 'بررسی شد، ثبت برای تأیید' }).click()
    await expect(page.getByTestId(`payment-${pid}`)).toHaveAttribute('data-status', 'recorded')
    await asStaff(page, second)
    await page.getByTestId(`payment-${pid}`).getByRole('button', { name: 'تأیید نهایی' }).click()
    await expect(page.getByTestId(`payment-${pid}`)).toHaveCount(0)
    const doc = (await (await admin.get(`/api/payments/${pid}?depth=0`)).json()) as { status: string; verifiedBy: string; recordedBy: number; confirmedBy: number }
    expect(doc).toMatchObject({ status: 'confirmed', verifiedBy: 'people', recordedBy: first.id, confirmedBy: second.id })
  })

  test('API: nobody writes payments; credentials are sealed and never returned; finance cannot read settings', async ({ playwright }) => {
    expect((await admin.post('/api/payments', { data: { order: 1, user: 1, method: 'manual', instalmentIndexes: [0], amount: 1, status: 'confirmed' } })).status()).toBe(403)
    const list = (await (await admin.get('/api/payment-methods?where[method][equals]=zibal&depth=0&limit=1')).json()) as { docs: { id: number }[] }
    const id = list.docs[0]!.id
    const secret = `zibal-merchant-${Date.now()}`
    const patched = await admin.patch(`/api/payment-methods/${id}`, { data: { cred_merchantId: secret } })
    expect(patched.ok(), await patched.text()).toBeTruthy()
    const body = await (await admin.get(`/api/payment-methods/${id}?depth=0`)).text()
    expect(body).not.toContain(secret)
    expect(body).not.toContain('credentialsSealed')
    expect(JSON.parse(body).credentialsSet).toContain('merchantId')
    // An empty input keeps the stored value.
    await admin.patch(`/api/payment-methods/${id}`, { data: { title: 'زیبال', cred_merchantId: '' } })
    expect(JSON.parse(await (await admin.get(`/api/payment-methods/${id}?depth=0`)).text()).credentialsSet).toContain('merchantId')
    // Audit rows never carry the secret.
    expect(await (await admin.get(`/api/audit-logs?where[targetCollection][equals]=payment-methods&limit=20&depth=0`)).text()).not.toContain(secret)

    const fin = await apiAs(playwright, DEMO, first.email, first.password)
    const r = await fin.get('/api/payment-methods?depth=0')
    expect(r.status() === 403 || ((await r.json()) as { docs: unknown[] }).docs.length === 0).toBeTruthy()
    await fin.dispose()
  })
})
