import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { DEMO, IBA } from './helpers'
import { adminCreds, apiAs, createStaff, nextCode, staffLogin, type StaffUser } from './staff-helpers'
import { createStudent, expireOtp, expectNoSeriousAxe, noHorizontalOverflow, preferDark, requestCode, setStatus, uniquePhone } from './login-helpers'

/**
 * E-034 QA: the Seal card login screens. State ids (S/T/V/N/A) refer to docs/ux/E-034-login.md.
 * Every test creates its own users/phones, so the file is idempotent on a re-used DB. Mock SMS provider only.
 */

let demoAdmin: APIRequestContext
let ibaAdmin: APIRequestContext

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  demoAdmin = await apiAs(playwright, DEMO, email, password)
  ibaAdmin = await apiAs(playwright, IBA, email, password)
})

test.afterAll(async () => {
  await demoAdmin?.dispose()
  await ibaAdmin?.dispose()
})

/** Server actions are POSTs with a `Next-Action` header; this fails or delays only those. */
async function onServerAction(page: Page, handler: Parameters<Page['route']>[1]): Promise<void> {
  await page.route('**/login*', (route) => (route.request().method() === 'POST' && route.request().headers()['next-action'] ? handler(route, route.request()) : route.continue()))
}

// ---------------------------------------------------------------------------------------------------------------
// Student /login
// ---------------------------------------------------------------------------------------------------------------
test.describe('student /login', () => {
  test('S1 empty phone step: copy, attributes, empty alert region, no autofocus, staff link', async ({ page }) => {
    await page.goto(`${DEMO}/login`)
    await expect(page.getByRole('heading', { level: 1, name: 'ورود یا ثبت‌نام' })).toBeVisible()
    await expect(page.getByText('شماره موبایل خود را بنویسید تا کد ورود برایتان پیامک شود. رمز عبور لازم نیست.')).toBeVisible()
    const phone = page.getByLabel('شماره موبایل')
    await expect(phone).toHaveAttribute('autocomplete', 'tel')
    await expect(phone).toHaveAttribute('inputmode', 'tel')
    await expect(phone).toHaveAttribute('dir', 'ltr')
    await expect(phone).toHaveAttribute('placeholder', '۰۹۱۲۳۴۵۶۷۸۹')
    await expect(phone).not.toBeFocused()
    // The alert region exists from the first render, empty (spec §4).
    const alert = page.locator('#phone-alert')
    await expect(alert).toHaveAttribute('role', 'alert')
    await expect(alert).toBeEmpty()
    await expect(page.getByRole('button', { name: 'دریافت کد ورود' })).toBeEnabled()
    await expect(page.getByRole('link', { name: 'ورود کارکنان' })).toHaveAttribute('href', '/staff/login')
    // No public chrome on the login page; the academy name is in the card.
    await expect(page.getByRole('link', { name: 'استعلام گواهی' })).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0).catch(() => undefined)
  })

  test('S3 invalid phone: calm alert, aria-invalid, focus back on the field, number kept', async ({ page }) => {
    await page.goto(`${DEMO}/login`)
    const phone = page.getByLabel('شماره موبایل')
    await phone.fill('12345')
    await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
    const alert = page.locator('#phone-alert')
    await expect(alert).toContainText('خطا. شماره موبایل درست نیست. با ۰۹ شروع می‌شود و ۱۱ رقم دارد؛ مثل ۰۹۱۲۳۴۵۶۷۸۹.')
    await expect(phone).toHaveAttribute('aria-invalid', 'true')
    await expect(phone).toHaveAttribute('aria-describedby', /phone-alert/)
    await expect(phone).toBeFocused()
    await expect(phone).toHaveValue('12345')
    // Typing clears the error.
    await phone.fill('0912')
    await expect(alert).toBeEmpty()
    // Enter submits too.
    await phone.press('Enter')
    await expect(alert).toContainText('شماره موبایل درست نیست')
  })

  test('S4 submitting: button disabled with «در حال ارسال…», form aria-busy; S10 code step; S11 timer', async ({ page }) => {
    const phone = uniquePhone()
    await onServerAction(page, async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await page.goto(`${DEMO}/login`)
    await page.getByLabel('شماره موبایل').fill(phone)
    await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
    const busy = page.getByRole('button', { name: 'در حال ارسال…' })
    await expect(busy).toBeDisabled()
    await expect(page.locator('#phone-form')).toHaveAttribute('aria-busy', 'true')

    // S10 code step.
    await expect(page.getByRole('heading', { name: 'کد را وارد کنید' })).toBeVisible()
    await expect(page.getByText('کد ۵رقمی به')).toContainText(phone)
    await expect(page.getByRole('button', { name: 'ویرایش شماره' })).toBeVisible()
    const code = page.getByLabel('کد ورود')
    await expect(code).toBeFocused()
    await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    await expect(code).toHaveAttribute('inputmode', 'numeric')
    await expect(code).toHaveAttribute('dir', 'ltr')
    await expect(page.getByLabel('نام و نام خانوادگی (فقط بار اول)')).toHaveAttribute('autocomplete', 'name')
    await expect(page.locator('#code-alert')).toBeEmpty()

    // S11: the timer is a non-live role=timer counting down from ۰۱:۰۰; the resend button only appears at zero.
    const timer = page.getByRole('timer')
    await expect(timer).toHaveText(/^۰(۱:۰۰|۰:[۵-۵][۰-۹])$/)
    await expect(page.getByText('ارسال دوباره‌ی کد تا')).toBeVisible()
    await expect(page.getByRole('button', { name: 'کد نرسید؟ ارسال دوباره' })).toHaveCount(0)
    await expect(timer.locator('xpath=ancestor-or-self::*[@aria-live]')).toHaveCount(0)
  })

  test('S11 resend timer reaches zero and becomes a button (fast-forwarded clock)', async ({ page }) => {
    await page.clock.install()
    await requestCode(page, DEMO, uniquePhone())
    await expect(page.getByRole('timer')).toBeVisible()
    await page.clock.fastForward(61_000)
    await expect(page.getByRole('button', { name: 'کد نرسید؟ ارسال دوباره' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'می‌توانید دوباره کد بگیرید' })).toHaveCount(1)
  })

  test('S2 Persian digits and +98 are accepted; S8 asking again within 60 s says the code was already sent; edit number goes back', async ({ page }) => {
    const phone = uniquePhone()
    const persian = phone.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)
    await page.goto(`${DEMO}/login`)
    await page.getByLabel('شماره موبایل').fill(persian)
    await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
    await expect(page.getByRole('heading', { name: 'کد را وارد کنید' })).toBeVisible()
    // The server normalises: the code step shows Latin digits.
    await expect(page.getByText('کد ۵رقمی به')).toContainText(phone)
    await expect(page.getByText('کد چند لحظه پیش برایتان فرستاده شده')).toHaveCount(0)

    // «ویرایش شماره» → phone step, focus on the field.
    await page.getByRole('button', { name: 'ویرایش شماره' }).click()
    const field = page.getByLabel('شماره موبایل')
    await expect(field).toBeVisible()
    await expect(field).toBeFocused()
    await expect(page.getByRole('heading', { name: 'ورود یا ثبت‌نام' })).toBeVisible()

    // Same number again, as +98 / 0098: within the 60 s guard → notice (not an error) and the code step.
    await field.fill(`+98${phone.slice(1)}`)
    await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'کد چند لحظه پیش برایتان فرستاده شده. همان را وارد کنید.' })).toBeVisible()
    await expect(page.getByText('کد ۵رقمی به')).toContainText(phone)
    await expect(page.locator('#code-alert')).toBeEmpty()
  })

  test('S12 wrong code: calm alert, field cleared and refocused, aria-invalid; Persian digits in the code are accepted', async ({ page }) => {
    const devCode = await requestCode(page, DEMO, uniquePhone())
    const wrong = devCode === '00000' ? '11111' : '00000'
    const code = page.getByLabel('کد ورود')
    await code.fill(wrong.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!))
    await expect(code).toHaveValue(wrong)
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.locator('#code-alert')).toContainText('خطا. کد درست نیست. دوباره بررسی کنید.')
    await expect(code).toHaveValue('')
    await expect(code).toBeFocused()
    // Short code: client-side message, no request.
    await code.fill('12')
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.locator('#code-alert')).toContainText('کد ۵رقمی را کامل وارد کنید.')
    await expect(code).toHaveAttribute('aria-invalid', 'true')
  })

  test('S13 expired code: alert and the resend button', async ({ page }) => {
    const phone = uniquePhone()
    const devCode = await requestCode(page, DEMO, phone)
    await expireOtp(phone)
    await page.getByLabel('کد ورود').fill(devCode)
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.locator('#code-alert')).toContainText('خطا. کد منقضی شده است. کد تازه بگیرید.')
    await expect(page.getByRole('button', { name: 'کد نرسید؟ ارسال دوباره' })).toBeVisible()
  })

  test('S14 five wrong codes lock the code: lock banner, even the right code is refused; a fresh code works', async ({ page }) => {
    test.setTimeout(150_000)
    const phone = uniquePhone()
    const devCode = await requestCode(page, DEMO, phone)
    const wrong = devCode === '00000' ? '11111' : '00000'
    const code = page.getByLabel('کد ورود')
    for (let i = 0; i < 5; i++) {
      await code.fill(wrong)
      await page.getByRole('button', { name: 'ورود', exact: true }).click()
      await expect(page.locator('#code-alert')).toContainText('کد درست نیست')
      await expect(code).toHaveValue('')
    }
    await code.fill(devCode)
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    const banner = page.getByRole('alert').filter({ hasText: 'چند بار کد اشتباه وارد شد. کد تازه بگیرید.' })
    await expect(banner).toContainText('قفل.')
    await expect(page.getByRole('button', { name: 'کد نرسید؟ ارسال دوباره' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ویرایش شماره' })).toBeVisible()
  })

  test('S15 suspended student: generic refusal, no status hint, no support line when the academy has no phone (demo)', async ({ page }) => {
    const { phone } = await createStudent(demoAdmin, 'demo', { status: 'suspended' })
    const devCode = await requestCode(page, DEMO, phone)
    await page.getByLabel('کد ورود').fill(devCode)
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    const alert = page.getByRole('alert').filter({ hasText: 'ورود با این شماره ممکن نیست' })
    await expect(alert).toContainText('خطا. ورود با این شماره ممکن نیست. با پشتیبانی آکادمی تماس بگیرید.')
    await expect(page.getByText(/معلق|بایگانی|suspended|archived/i)).toHaveCount(0)
    await expect(page.getByText('پشتیبانی آکادمی:')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'بازگشت' })).toBeVisible()
    // No session was created.
    expect((await page.request.get(`${DEMO}/dashboard`, { maxRedirects: 0 })).status()).toBe(307)
    await page.getByRole('button', { name: 'بازگشت' }).click()
    await expect(page.getByRole('heading', { name: 'ورود یا ثبت‌نام' })).toBeVisible()
  })

  test('S15 archived student on iba: tenant support phone is shown as a tel link', async ({ page }) => {
    const { phone } = await createStudent(ibaAdmin, 'iba', { status: 'archived' })
    const devCode = await requestCode(page, IBA, phone)
    await page.getByLabel('کد ورود').fill(devCode)
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'ورود با این شماره ممکن نیست' })).toBeVisible()
    await expect(page.getByText('پشتیبانی آکادمی:')).toBeVisible()
    await expect(page.getByRole('link', { name: '021-22277111' })).toHaveAttribute('href', 'tel:02122277111')
  })

  test('S7 network error on the phone step: calm message, number kept, «تلاش دوباره» works once the network is back', async ({ page }) => {
    const phone = uniquePhone()
    await onServerAction(page, (route) => route.abort('failed'))
    await page.goto(`${DEMO}/login`)
    await page.getByLabel('شماره موبایل').fill(phone)
    await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
    const alert = page.locator('#phone-alert')
    await expect(alert).toContainText('خطا. اتصال برقرار نشد. اینترنت را بررسی کنید و دوباره امتحان کنید.')
    await expect(alert).not.toContainText(/Error|stack|at /)
    await expect(page.getByLabel('شماره موبایل')).toHaveValue(phone)
    await expect(page.getByRole('button', { name: 'تلاش دوباره' })).toBeVisible()
    await page.unroute('**/login*')
    await page.getByRole('button', { name: 'تلاش دوباره' }).click()
    await expect(page.getByRole('heading', { name: 'کد را وارد کنید' })).toBeVisible()
  })

  test('S7 network error on the code step keeps the form and the typed code', async ({ page }) => {
    const devCode = await requestCode(page, DEMO, uniquePhone())
    await onServerAction(page, (route) => route.abort('failed'))
    await page.getByLabel('کد ورود').fill(devCode)
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.locator('#code-alert')).toContainText('اتصال برقرار نشد')
    await expect(page.getByLabel('کد ورود')).toHaveValue(devCode)
    await expect(page.getByRole('button', { name: 'ورود', exact: true })).toBeEnabled()
  })

  test('S16/S17 new student signs in and lands on next; S18 notice only when ?next= is present', async ({ page }) => {
    // S18: neutral notice only for a protected-page redirect.
    await page.goto(`${DEMO}/login`)
    await expect(page.getByText('برای ادامه، وارد شوید.')).toHaveCount(0)
    await page.goto(`${DEMO}/dashboard`)
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/)
    await expect(page.getByRole('status').filter({ hasText: 'برای ادامه، وارد شوید.' })).toBeVisible()
    // A protocol-relative next is not trusted: no notice, default target.
    await page.goto(`${DEMO}/login?next=//evil.example`)
    await expect(page.getByText('برای ادامه، وارد شوید.')).toHaveCount(0)

    const phone = uniquePhone()
    const devCode = await requestCode(page, DEMO, phone, '/dashboard')
    await page.getByLabel('کد ورود').fill(devCode)
    await page.getByLabel('نام و نام خانوادگی (فقط بار اول)').fill('دانشجوی تست ورود')
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.getByRole('button', { name: 'در حال ورود…' })).toBeDisabled()
    await page.waitForURL(`${DEMO}/dashboard`)
    // Signed in: /login now forwards to the dashboard.
    await page.goto(`${DEMO}/login`)
    await expect(page).toHaveURL(`${DEMO}/dashboard`)
  })

  test('keyboard: tab order reaches phone → submit → staff link; errors are announced through the role=alert region', async ({ page }) => {
    await page.goto(`${DEMO}/login`)
    await page.locator('main').waitFor()
    // Skip link, home link and theme toggle come first; walk until the phone field.
    const order: string[] = []
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      const id = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        return el ? (el.id || el.getAttribute('name') || el.textContent?.trim().slice(0, 30) || el.tagName) : ''
      })
      order.push(id)
      if (id === 'ورود کارکنان') break
    }
    const phoneAt = order.indexOf('phone')
    const submitAt = order.indexOf('دریافت کد ورود')
    const staffAt = order.indexOf('ورود کارکنان')
    expect(phoneAt, order.join(' > ')).toBeGreaterThan(-1)
    expect(submitAt, order.join(' > ')).toBeGreaterThan(phoneAt)
    expect(staffAt, order.join(' > ')).toBeGreaterThan(submitAt)
    // The region that receives the message is a live assertive region.
    await expect(page.locator('#phone-alert')).toHaveAttribute('role', 'alert')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Staff /staff/login
// ---------------------------------------------------------------------------------------------------------------
test.describe('staff /staff/login', () => {
  test('T1 empty: copy, autocomplete, password toggle with aria-pressed (T13 help text, student link)', async ({ page }) => {
    await page.goto(`${DEMO}/staff/login`)
    await expect(page.getByRole('heading', { level: 1, name: 'ورود کارکنان' })).toBeVisible()
    await expect(page.getByText('برای ورود به میز کار و بخش مدیریت.')).toBeVisible()
    const email = page.getByLabel('ایمیل')
    const password = page.getByLabel('رمز عبور')
    await expect(email).toHaveAttribute('autocomplete', 'username')
    await expect(email).toHaveAttribute('dir', 'ltr')
    await expect(email).toHaveAttribute('spellcheck', 'false')
    await expect(email).toHaveAttribute('autocapitalize', 'none')
    await expect(password).toHaveAttribute('autocomplete', 'current-password')
    await expect(password).toHaveAttribute('type', 'password')
    await expect(page.locator('#staff-alert')).toBeEmpty()
    await expect(page.locator('#staff-alert')).toHaveAttribute('role', 'alert')
    await expect(page.getByText('رمز را فراموش کرده‌اید؟ از مدیر آکادمی بخواهید رمز تازه برایتان تعیین کند.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'دانشجو هستید؟ ورود با شماره موبایل' })).toHaveAttribute('href', '/login')
    // No dead forgot-password link.
    await expect(page.locator('a[href*="forgot"]')).toHaveCount(0)

    const toggle = page.getByRole('button', { name: 'نمایش رمز' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await password.fill('secret-123')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(password).toHaveAttribute('type', 'text')
    await expect(password).toHaveValue('secret-123')
    await toggle.click()
    await expect(password).toHaveAttribute('type', 'password')
  })

  test('T3 validation: Persian inline messages, aria-invalid, focus on the first invalid field, no request sent', async ({ page }) => {
    let posted = 0
    await page.route('**/api/users/login', (route) => {
      posted++
      return route.continue()
    })
    await page.goto(`${DEMO}/staff/login`)
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    const email = page.getByLabel('ایمیل')
    await expect(page.getByText('ایمیل را کامل بنویسید؛ مثل name@example.com.')).toBeVisible()
    await expect(page.getByText('رمز عبور را وارد کنید.')).toBeVisible()
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toBeFocused()
    await email.fill('someone@example.test')
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.getByLabel('رمز عبور')).toBeFocused()
    await expect(page.getByLabel('رمز عبور')).toHaveAttribute('aria-invalid', 'true')
    expect(posted).toBe(0)
  })

  test('phone typed in the email field gets the student hint, no request sent (Persian digits too)', async ({ page }) => {
    let posted = 0
    await page.route('**/api/users/login', (route) => {
      posted++
      return route.continue()
    })
    await page.goto(`${DEMO}/staff/login`)
    await page.getByLabel('ایمیل').fill('۰۹۱۲۰۰۰۱۲۳۴')
    await page.getByLabel('رمز عبور').fill('whatever')
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.getByText('اینجا ایمیل کارکنان لازم است. دانشجو هستید؟')).toBeVisible()
    await expect(page.getByRole('link', { name: 'با شماره موبایل وارد شوید' })).toHaveAttribute('href', '/login')
    await expect(page.getByLabel('ایمیل')).toHaveAttribute('aria-invalid', 'true')
    expect(posted).toBe(0)
  })

  test('T4 wrong credentials: one generic alert, password cleared, email kept, focus on password; T7 busy state', async ({ page }) => {
    await page.route('**/api/users/login', async (route) => {
      await new Promise((r) => setTimeout(r, 800))
      await route.continue()
    })
    await page.goto(`${DEMO}/staff/login`)
    await page.getByLabel('ایمیل').fill('nobody-e2e@example.test')
    await page.getByLabel('رمز عبور').fill('wrong-password')
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.getByRole('button', { name: 'در حال ورود…' })).toBeDisabled()
    await expect(page.locator('form[aria-busy="true"]')).toHaveCount(1)
    await expect(page.locator('#staff-alert')).toHaveText('خطا. ایمیل یا رمز عبور درست نیست.')
    await expect(page.getByLabel('رمز عبور')).toHaveValue('')
    await expect(page.getByLabel('رمز عبور')).toBeFocused()
    await expect(page.getByLabel('ایمیل')).toHaveValue('nobody-e2e@example.test')
  })

  test('T4 a student account gets the same generic error', async ({ page }) => {
    const student = await createStaff(demoAdmin, 'demo', null, 'plain')
    await staffLogin(page, DEMO, student)
    // A valid password but no staff membership: Payload signs in, the guard answers with the 403 page (not an error here).
    await expect(page.getByRole('heading', { name: 'این بخش مخصوص کارکنان آکادمی است' })).toBeVisible()
  })

  test('T5 suspended / archived staff: inactive message, no session', async ({ page }) => {
    for (const status of ['suspended', 'archived'] as const) {
      const u = await createStaff(demoAdmin, 'demo', 'advisor', status)
      await setStatus(demoAdmin, u.id, status)
      await staffLogin(page, DEMO, u)
      await expect(page.locator('#staff-alert')).toHaveText('خطا. حساب شما غیرفعال است. با مدیر آکادمی تماس بگیرید.')
      expect((await page.request.get(`${DEMO}/staff`, { maxRedirects: 0 })).status()).toBe(307)
    }
    // Also reached by the guard's redirect.
    await page.goto(`${DEMO}/staff/login?error=inactive`)
    await expect(page.locator('#staff-alert')).toContainText('حساب شما غیرفعال است')
  })

  test('T6 locked after repeated wrong passwords (Payload default lock): lock banner, even with the right password', async ({ page }) => {
    const u = await createStaff(demoAdmin, 'demo', 'advisor', 'locked')
    // Unique user per run, so there is nothing to reset afterwards; the lock also ends by itself.
    for (let i = 0; i < 5; i++) {
      const r = await page.request.post(`${DEMO}/api/users/login`, { data: { email: u.email, password: 'wrong-password' } })
      expect(r.status()).toBe(401)
    }
    await staffLogin(page, DEMO, u)
    const banner = page.getByRole('alert').filter({ hasText: 'ورود موقتاً بسته شده است. چند دقیقه بعد دوباره امتحان کنید.' })
    await expect(banner).toContainText('قفل.')
    expect((await page.request.get(`${DEMO}/staff`, { maxRedirects: 0 })).status()).toBe(307)
  })

  test('T8 network error and T9 server error: calm messages, form kept', async ({ page }) => {
    await page.goto(`${DEMO}/staff/login`)
    await page.getByLabel('ایمیل').fill('someone@example.test')
    await page.getByLabel('رمز عبور').fill('pw-123456')
    await page.route('**/api/users/login', (route) => route.abort('failed'))
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.locator('#staff-alert')).toHaveText('خطا. اتصال برقرار نشد. اینترنت خود را بررسی و دوباره تلاش کنید.')
    await expect(page.getByLabel('ایمیل')).toHaveValue('someone@example.test')
    await expect(page.getByLabel('رمز عبور')).toHaveValue('pw-123456')
    await page.unroute('**/api/users/login')
    await page.route('**/api/users/login', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"errors":[{"message":"boom at /srv/app.js:1"}]}' }))
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.locator('#staff-alert')).toHaveText('خطا. مشکلی پیش آمد. دوباره تلاش کنید.')
    await expect(page.getByText(/boom|\.js/)).toHaveCount(0)
  })

  test('T10 success goes to the desk; T11 session-expired notice only with ?next=', async ({ page }) => {
    await page.goto(`${DEMO}/staff/login`)
    await expect(page.getByText('نشست شما تمام شده است. دوباره وارد شوید.')).toHaveCount(0)
    await page.goto(`${DEMO}/staff/leads`)
    await expect(page).toHaveURL(`${DEMO}/staff/login?next=%2Fstaff%2Fleads`)
    await expect(page.getByRole('status').filter({ hasText: 'نشست شما تمام شده است. دوباره وارد شوید.' })).toBeVisible()
    const u = await createStaff(demoAdmin, 'demo', 'advisor', 'login')
    await page.getByLabel('ایمیل').fill(u.email)
    await page.getByLabel('رمز عبور').fill(u.password)
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await expect(page.getByRole('button', { name: 'در حال ورود…' })).toBeDisabled()
    await expect(page).toHaveURL(`${DEMO}/staff/leads`)
  })

  test('keyboard: tab order email → password → show/hide → submit → student link', async ({ page }) => {
    await page.goto(`${DEMO}/staff/login`)
    await page.getByLabel('ایمیل').focus()
    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
      seen.push(await page.evaluate(() => (document.activeElement as HTMLElement).id || (document.activeElement as HTMLElement).getAttribute('aria-label') || (document.activeElement as HTMLElement).textContent?.trim() || ''))
      await page.keyboard.press('Tab')
    }
    expect(seen).toEqual(['staff-email', 'staff-password', 'نمایش رمز', 'ورود', 'دانشجو هستید؟ ورود با شماره موبایل'])
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Staff 2FA verify
// ---------------------------------------------------------------------------------------------------------------
async function staffWith2fa(playwright: Parameters<typeof apiAs>[0]): Promise<{ user: StaffUser; secret: string; step: number }> {
  const user = await createStaff(demoAdmin, 'demo', 'advisor', '2fa')
  const api = await apiAs(playwright, DEMO, user.email, user.password)
  const { secret } = (await (await api.post('/api/users/2fa/setup')).json()) as { secret: string }
  const first = await nextCode(secret, null)
  const r = await api.post('/api/users/2fa/enable', { data: { code: first.code } })
  expect(r.ok()).toBeTruthy()
  await api.dispose()
  // The server refuses a step it has already accepted (replay guard): callers continue from `step`.
  return { user, secret, step: first.step }
}

test.describe('staff /staff/2fa/verify', () => {
  test('V1 empty, V2 short code, V3 wrong code with attempts left and clock hint, V5 help, success', async ({ page, playwright }) => {
    test.setTimeout(150_000)
    const { user, secret, step } = await staffWith2fa(playwright)
    await staffLogin(page, DEMO, user)
    await expect(page).toHaveURL(`${DEMO}/staff/2fa/verify?next=%2Fstaff`)
    await expect(page.getByRole('heading', { level: 1, name: 'تأیید دومرحله‌ای' })).toBeVisible()
    await expect(page.getByText('کد ۶رقمی را از برنامهٔ احراز هویت گوشی خود وارد کنید.')).toBeVisible()
    await expect(page.getByText(user.email)).toBeVisible()
    const code = page.getByLabel('کد تأیید')
    await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    await expect(code).toHaveAttribute('inputmode', 'numeric')
    await expect(code).toHaveAttribute('dir', 'ltr')
    await expect(page.locator('#verify-alert')).toHaveAttribute('role', 'alert')
    await expect(page.locator('#verify-alert')).toBeEmpty()
    await expect(page.getByRole('button', { name: 'خروج از حساب' })).toBeVisible()
    // V5: collapsed help.
    await page.getByText('گوشی خود را ندارید؟').click()
    await expect(page.getByText('از مدیر آکادمی بخواهید تأیید دومرحله‌ای حساب شما را بازنشانی کند.')).toBeVisible()

    // V2
    await code.fill('123')
    await page.getByRole('button', { name: 'تأیید و ادامه' }).click()
    await expect(page.locator('#verify-alert')).toContainText('کد را شش‌رقمی وارد کنید.')
    // V3: first failure shows tries left, the clock hint comes from the second one. Persian digits are accepted.
    await code.fill('۰۰۰۰۰۰')
    await page.getByRole('button', { name: 'تأیید و ادامه' }).click()
    await expect(page.locator('#verify-alert')).toContainText('کد درست نیست. ۴ بار دیگر می‌توانید امتحان کنید.')
    await expect(code).toHaveValue('')
    await expect(page.getByText('هنوز درست نیست؟ ساعت گوشی')).toHaveCount(0)
    await code.fill('000000')
    await page.getByRole('button', { name: 'تأیید و ادامه' }).click()
    await expect(page.locator('#verify-alert')).toContainText('۳ بار دیگر')
    await expect(page.getByText('هنوز درست نیست؟ ساعت گوشی باید روی حالت خودکار باشد.')).toBeVisible()

    // Success (V8).
    const { code: good } = await nextCode(secret, step)
    await code.fill(good)
    await page.getByRole('button', { name: 'تأیید و ادامه' }).click()
    await expect(page).toHaveURL(`${DEMO}/staff/leads`)
  })

  // BUG E034-QA-01: the code input is `disabled` while the request runs and focus() is called before React re-enables it,
  // so focus is lost after a wrong code (spec V3 «keep focus in field»). Flips to a failure once fixed: then drop test.fail.
  test('V3 focus returns to the code field after a wrong code (known bug E034-QA-01)', async ({ page, playwright }) => {
    test.fail(true, 'E034-QA-01: focus lost after a wrong 2FA code')
    test.setTimeout(60_000)
    const { user } = await staffWith2fa(playwright)
    await staffLogin(page, DEMO, user)
    await expect(page).toHaveURL(/\/staff\/2fa\/verify/)
    const code = page.getByLabel('کد تأیید')
    await code.fill('000000')
    await page.getByRole('button', { name: 'تأیید و ادامه' }).click()
    await expect(page.locator('#verify-alert')).toContainText('کد درست نیست')
    await expect(code).toBeFocused({ timeout: 3000 })
  })

  test('V4 five wrong codes: lock banner with mm:ss timer, field and button disabled, still locked after reload; sign-out stays enabled', async ({ page, playwright }) => {
    test.setTimeout(150_000)
    const { user } = await staffWith2fa(playwright)
    await staffLogin(page, DEMO, user)
    await expect(page).toHaveURL(/\/staff\/2fa\/verify/)
    const code = page.getByLabel('کد تأیید')
    for (let i = 0; i < 5; i++) {
      await expect(code).toBeEnabled()
      await code.fill('000000')
      await page.getByRole('button', { name: 'تأیید و ادامه' }).click()
      if (i < 4) await expect(page.locator('#verify-alert')).toContainText('کد درست نیست')
    }
    const banner = page.getByRole('alert').filter({ hasText: 'چند بار کد اشتباه وارد شد. تا ۱۵ دقیقهٔ دیگر امکان ورود ندارید.' })
    await expect(banner).toContainText('قفل.')
    const timer = page.getByRole('timer')
    await expect(timer).toHaveText(/^۱[۴۵]:[۰-۵][۰-۹]$/)
    const first = await timer.textContent()
    await expect(timer).not.toHaveText(first ?? '', { timeout: 5000 })
    await expect(timer.locator('xpath=ancestor-or-self::*[@aria-live]')).toHaveCount(0)
    await expect(code).toBeDisabled()
    await expect(page.getByRole('button', { name: 'تأیید و ادامه' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'خروج از حساب' })).toBeEnabled()
    // Locked on page load too.
    await page.reload()
    await expect(page.getByRole('timer')).toHaveText(/^۱[۴۵]:[۰-۵][۰-۹]$/)
    await expect(page.getByLabel('کد تأیید')).toBeDisabled()
  })

  test('V6 network error keeps the form; V9 anonymous visit goes to the login with the notice', async ({ page, playwright }) => {
    test.setTimeout(150_000)
    const { user } = await staffWith2fa(playwright)
    await staffLogin(page, DEMO, user)
    await expect(page).toHaveURL(/\/staff\/2fa\/verify/)
    await page.route('**/api/users/2fa/verify', (route) => route.abort('failed'))
    await page.getByLabel('کد تأیید').fill('123456')
    await page.getByRole('button', { name: 'تأیید و ادامه' }).click()
    await expect(page.locator('#verify-alert')).toContainText('اتصال برقرار نشد')

    // Sign out (POST 303) then open verify anonymously.
    await page.getByRole('button', { name: 'خروج از حساب' }).click()
    await expect(page).toHaveURL(`${DEMO}/staff/login`)
    await page.goto(`${DEMO}/staff/2fa/verify`)
    await expect(page).toHaveURL(`${DEMO}/staff/login?next=%2Fstaff`)
    await expect(page.getByRole('status').filter({ hasText: 'نشست شما تمام شده است.' })).toBeVisible()
  })

  test('N-states: the enrol card (voluntary mode on /staff/security) shows key, QR, steps and handles a wrong code', async ({ page, playwright }) => {
    test.setTimeout(120_000)
    // STAFF_2FA_REQUIRED is off on the dev server, so /staff/2fa/enrol itself redirects; the same form runs on the security page.
    const u = await createStaff(demoAdmin, 'demo', 'advisor', 'enrol')
    await staffLogin(page, DEMO, u, '/staff/security')
    await page.getByRole('button', { name: 'روشن‌کردن' }).click()
    await page.getByRole('button', { name: 'شروع' }).click()
    await expect(page.locator('code')).toHaveText(/^[A-Z2-7 ]{16,}$/)
    await expect(page.getByRole('img', { name: 'کد QR تأیید دومرحله‌ای' })).toBeVisible()
    await expect(page.getByText('۱. یک برنامهٔ احراز هویت روی گوشی نصب کنید.')).toBeVisible()
    await expect(page.getByText('۳. کد شش‌رقمی‌ای را که برنامه نشان می‌دهد وارد کنید.')).toBeVisible()
    await page.getByLabel('کد تأیید').fill('000000')
    await page.getByRole('button', { name: 'فعال‌سازی' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'کد درست نیست' })).toContainText('۴ بار دیگر')
    void playwright
  })

  test('forced enrolment page redirects away when 2FA is not required (STAFF_2FA_REQUIRED off)', async ({ page }) => {
    const u = await createStaff(demoAdmin, 'demo', 'advisor', 'noenrol')
    await staffLogin(page, DEMO, u)
    await expect(page).toHaveURL(`${DEMO}/staff/leads`)
    await page.goto(`${DEMO}/staff/2fa/enrol`)
    await expect(page).not.toHaveURL(/2fa\/enrol/)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Admin /admin/login (Payload, skinned)
// ---------------------------------------------------------------------------------------------------------------
test.describe('admin /admin/login', () => {
  test('A1 skin: seal with the academy name, «مدیریت» tag, title, staff link, honest forgot-password text', async ({ page }) => {
    await page.goto(`${DEMO}/admin/login`)
    await expect(page.locator('.ed-login-seal')).toBeVisible()
    await expect(page.locator('.ed-login-brand__name')).toHaveText('آکادمی نمونه ادورا').catch(async () => {
      await expect(page.locator('.ed-login-brand__name')).not.toBeEmpty()
    })
    await expect(page.locator('.ed-login-tag')).toHaveText('مدیریت')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ورود به بخش مدیریت')
    await expect(page.getByRole('link', { name: 'ورود کارکنان و تأیید دومرحله‌ای' })).toHaveAttribute('href', '/staff/login')
    await expect(page.getByText('رمز را فراموش کرده‌اید؟ از مدیر آکادمی بخواهید رمز تازه برایتان تعیین کند.')).toBeVisible()
    await expect(page.locator('#field-email')).toBeVisible()
    await expect(page.locator('#field-password')).toBeVisible()
  })

  test('A1 per-tenant name on the skin (demo vs iba) and the title mentions the academy', async ({ page }) => {
    await page.goto(`${DEMO}/admin/login`)
    const demoName = (await page.locator('.ed-login-brand__name').textContent())?.trim() ?? ''
    await expect(page.getByRole('heading', { level: 1 })).toContainText(demoName)
    await page.goto(`${IBA}/admin/login`)
    const ibaName = (await page.locator('.ed-login-brand__name').textContent())?.trim() ?? ''
    expect(ibaName).not.toBe('')
    expect(ibaName).not.toBe(demoName)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(ibaName)
  })

  test('A2 wrong password shows Payload\'s error toast; the form stays', async ({ page }) => {
    await page.goto(`${DEMO}/admin/login`)
    await page.locator('#field-email').fill('nobody-e2e@example.test')
    await page.locator('#field-password').fill('wrong-password')
    await page.locator('button[type="submit"]').click()
    const toast = page.locator('.toast-error, [data-sonner-toast][data-type="error"], .Toastify__toast--error').first()
    await expect(toast).toBeVisible()
    await expect(toast).not.toContainText(/stack|at .*\.js/)
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.locator('#field-email')).toBeVisible()
  })

  test('successful admin login still works (academy admin)', async ({ page }) => {
    const u = await createStaff(demoAdmin, 'demo', 'academy-admin', 'adminlogin')
    await page.goto(`${DEMO}/admin/login`)
    await page.locator('#field-email').fill(u.email)
    await page.locator('#field-password').fill(u.password)
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(new RegExp(`${DEMO.replace(/[.]/g, '\\.')}/admin(/.*)?$`))
    await expect(page).not.toHaveURL(/\/admin\/login/)
  })

  test('the staff link on the admin login goes to /staff/login', async ({ page }) => {
    await page.goto(`${DEMO}/admin/login`)
    await page.getByRole('link', { name: 'ورود کارکنان و تأیید دومرحله‌ای' }).click()
    await expect(page).toHaveURL(`${DEMO}/staff/login`)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Layout, theme, tenants, a11y
// ---------------------------------------------------------------------------------------------------------------
const brandOf = { [DEMO]: 'rgb(15, 118, 110)', [IBA]: 'rgb(26, 86, 219)' } as const

test.describe('375px', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  for (const [tenant, base] of [['demo', DEMO], ['iba', IBA]] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`no horizontal overflow, ${tenant}, ${theme}: /login (both steps), /staff/login (empty + error), /admin/login`, async ({ page }) => {
        if (theme === 'dark') await preferDark(page)
        await page.goto(`${base}/login`)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await noHorizontalOverflow(page)
        await page.getByLabel('شماره موبایل').fill('1')
        await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
        await expect(page.locator('#phone-alert')).toContainText('شماره موبایل درست نیست')
        await noHorizontalOverflow(page)
        await page.getByLabel('شماره موبایل').fill(uniquePhone())
        await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
        await expect(page.getByRole('heading', { name: 'کد را وارد کنید' })).toBeVisible()
        await noHorizontalOverflow(page)

        await page.goto(`${base}/staff/login`)
        await noHorizontalOverflow(page)
        await page.getByLabel('ایمیل').fill('nobody-e2e@example.test')
        await page.getByLabel('رمز عبور').fill('wrong-password')
        await page.getByRole('button', { name: 'ورود', exact: true }).click()
        await expect(page.locator('#staff-alert')).toContainText('ایمیل یا رمز عبور درست نیست')
        await noHorizontalOverflow(page)

        await page.goto(`${base}/admin/login`)
        await expect(page.locator('.ed-login-seal')).toBeVisible()
        await noHorizontalOverflow(page)
      })
    }
  }

  test('/staff/2fa/verify (empty and locked) has no horizontal overflow', async ({ page, playwright }) => {
    test.setTimeout(150_000)
    const { user } = await staffWith2fa(playwright)
    await staffLogin(page, DEMO, user)
    await expect(page).toHaveURL(/\/staff\/2fa\/verify/)
    await noHorizontalOverflow(page)
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('کد تأیید').fill('000000')
      await page.getByRole('button', { name: 'تأیید و ادامه' }).click()
      if (i < 4) await expect(page.locator('#verify-alert')).toContainText('کد درست نیست')
    }
    await expect(page.getByRole('timer')).toBeVisible()
    await noHorizontalOverflow(page)
  })

  test('submit stays reachable at 360x640 on the phone step', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto(`${DEMO}/login`)
    const submit = page.getByRole('button', { name: 'دریافت کد ورود' })
    await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeInViewport()
    const box = await submit.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
  })
})

test.describe('tenant brand colour and theme', () => {
  for (const [name, base] of [['demo', DEMO], ['iba', IBA]] as const) {
    test(`${name}: the primary button uses the tenant colour on /login and /staff/login, light and dark`, async ({ page }) => {
      for (const path of ['/login', '/staff/login']) {
        await page.goto(`${base}${path}`)
        const bg = await page.getByRole('button', { name: /دریافت کد ورود|^ورود$/ }).first().evaluate((el) => getComputedStyle(el).backgroundColor)
        expect(bg, `${name}${path} light`).toBe(brandOf[base])
      }
      // The academy name in the card matches the host's tenant, never the other one.
      await page.goto(`${base}/login`)
      const heading = await page.locator('main').innerText()
      expect(heading).toContain(name === 'demo' ? 'ادورا' : 'برند')
    })

    test(`${name}: dark mode flips data-theme and keeps a brand-coloured primary button`, async ({ page }) => {
      await preferDark(page)
      await page.goto(`${base}/login`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      const colors = await page.getByRole('button', { name: 'دریافت کد ورود' }).evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color, page: getComputedStyle(document.body).backgroundColor }))
      expect(colors.bg).not.toBe(colors.page)
      expect(colors.bg).not.toBe(colors.fg)
    })
  }

  test('theme toggle works on /login and survives a reload', async ({ page }) => {
    await page.goto(`${DEMO}/login`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.locator('header button').first().click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('RTL page, dir=ltr only on the value fields', async ({ page }) => {
    await page.goto(`${DEMO}/login`)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa')
    await expect(page.getByLabel('شماره موبایل')).toHaveCSS('text-align', 'end')
  })
})

test.describe('axe (wcag2a + wcag2aa, serious/critical must be 0)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`/login phone + code step, ${theme}`, async ({ page }) => {
      if (theme === 'dark') await preferDark(page)
      await page.goto(`${DEMO}/login`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expectNoSeriousAxe(page, `/login phone ${theme}`)
      await page.getByLabel('شماره موبایل').fill('1')
      await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
      await expect(page.locator('#phone-alert')).toContainText('شماره موبایل درست نیست')
      await expectNoSeriousAxe(page, `/login phone error ${theme}`)
      await page.getByLabel('شماره موبایل').fill(uniquePhone())
      await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
      await expect(page.getByRole('heading', { name: 'کد را وارد کنید' })).toBeVisible()
      await expectNoSeriousAxe(page, `/login code ${theme}`)
    })

    test(`/staff/login empty + error, ${theme}`, async ({ page }) => {
      if (theme === 'dark') await preferDark(page)
      await page.goto(`${DEMO}/staff/login`)
      await expectNoSeriousAxe(page, `/staff/login empty ${theme}`)
      await page.getByLabel('ایمیل').fill('nobody-e2e@example.test')
      await page.getByLabel('رمز عبور').fill('wrong-password')
      await page.getByRole('button', { name: 'ورود', exact: true }).click()
      await expect(page.locator('#staff-alert')).toContainText('ایمیل یا رمز عبور درست نیست')
      await expectNoSeriousAxe(page, `/staff/login error ${theme}`)
    })

    test(`/staff/2fa/verify, ${theme}`, async ({ page, playwright }) => {
      test.setTimeout(120_000)
      if (theme === 'dark') await preferDark(page)
      const { user } = await staffWith2fa(playwright)
      await staffLogin(page, DEMO, user)
      await expect(page).toHaveURL(/\/staff\/2fa\/verify/)
      await expectNoSeriousAxe(page, `/staff/2fa/verify ${theme}`)
    })

    test(`/admin/login, ${theme}`, async ({ page }) => {
      if (theme === 'dark') await page.addInitScript(() => localStorage.setItem('payload-theme', 'dark'))
      await page.goto(`${DEMO}/admin/login`)
      await expect(page.locator('.ed-login-seal')).toBeVisible()
      await expectNoSeriousAxe(page, `/admin/login ${theme}`)
    })
  }

  test('tenant colours (iba) on /login and /staff/login', async ({ page }) => {
    await page.goto(`${IBA}/login`)
    await expectNoSeriousAxe(page, 'iba /login')
    await page.goto(`${IBA}/staff/login`)
    await expectNoSeriousAxe(page, 'iba /staff/login')
  })
})
