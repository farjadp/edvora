import { expect, test, type APIRequestContext } from '@playwright/test'
import { DEMO, IBA } from './helpers'
import { adminCreds, apiAs, createStaff, nextCode, staffLogin, type StaffUser } from './staff-helpers'

// E-022: /staff desk shell, gate, 2FA flows, admin reset. Test users live in the demo academy only.

let admin: APIRequestContext

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
})

test.afterAll(async () => {
  await admin?.dispose()
})

test('anonymous → /staff/login with a safe next, no public chrome, noindex', async ({ page }) => {
  await page.goto(`${DEMO}/staff/leads`)
  await expect(page).toHaveURL(`${DEMO}/staff/login?next=%2Fstaff%2Fleads`)
  await expect(page.getByRole('heading', { name: 'ورود کارکنان' })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  // The public Stream header is not around staff pages.
  await expect(page.getByRole('link', { name: 'استعلام گواهی' })).toHaveCount(0)

  // A foreign `next` is dropped.
  const res = await page.request.get(`${DEMO}/staff/login?next=//evil.example`, { maxRedirects: 0 })
  expect(res.status()).toBe(200)
})

test('public pages keep their header and footer', async ({ page }) => {
  await page.goto(`${IBA}/`)
  await expect(page.getByRole('link', { name: 'استعلام گواهی' }).first()).toBeVisible()
})

test('wrong password shows one generic error', async ({ page }) => {
  await staffLogin(page, DEMO, { email: 'nobody@example.test', password: 'wrong-password' })
  await expect(page.getByRole('alert').filter({ hasText: 'ایمیل' })).toHaveText('ایمیل یا رمز عبور درست نیست.')
})

test('student account → 403 variant B with HTTP 403', async ({ page }) => {
  const student = await createStaff(admin, 'demo', 'student')
  await staffLogin(page, DEMO, student)
  await expect(page.getByRole('heading', { name: 'این بخش مخصوص کارکنان آکادمی است' })).toBeVisible()
  const res = await page.request.get(`${DEMO}/staff`, { maxRedirects: 0 })
  expect(res.status()).toBe(403)
  await expect(page.getByRole('link', { name: 'رفتن به پنل دانشجو' })).toBeVisible()
})

test('staff of another academy → 403 variant A on this host', async ({ page }) => {
  const advisor = await createStaff(admin, 'demo', 'advisor')
  // Same account, iba host: no membership there.
  await page.request.post(`${IBA}/api/users/login`, { data: { email: advisor.email, password: advisor.password } })
  const res = await page.request.get(`${IBA}/staff`, { maxRedirects: 0 })
  expect(res.status()).toBe(403)
  await page.goto(`${IBA}/staff`)
  await expect(page.getByRole('heading', { name: 'شما در این آکادمی دسترسی کارکنان ندارید' })).toBeVisible()
})

const LANDING: [template: string, desk: string, title: string][] = [
  ['academy-admin', 'overview', 'نمای کلی'],
  ['advisor', 'leads', 'مشتریان بالقوه'],
  ['finance', 'finance', 'مالی'],
  ['support', 'support', 'پشتیبانی'],
  ['instructor', 'teaching', 'آموزش'],
  ['content-editor', 'content', 'محتوا'],
]

for (const [template, desk, title] of LANDING) {
  test(`${template} lands on /staff/${desk}`, async ({ page }) => {
    const u = await createStaff(admin, 'demo', template)
    await staffLogin(page, DEMO, u)
    await expect(page).toHaveURL(`${DEMO}/staff/${desk}`)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    // E-028: the leads and finance desks have real bodies; the others are still E-022 placeholders.
    if (desk === 'leads') await expect(page.getByTestId('leads-desk')).toBeVisible()
    else if (desk === 'finance') await expect(page.getByTestId('finance-desk')).toBeVisible()
    else await expect(page.getByText('این میز هنوز آماده نیست.')).toBeVisible()
    // Tenant indicator + permission-filtered nav with the active item marked.
    await expect(page.getByRole('navigation', { name: 'ناوبری میز کار' }).first().locator('[aria-current="page"]')).toHaveAttribute('href', `/staff/${desk}`)
  })
}

test('advisor: nav is filtered and another desk is a 403 inside the shell', async ({ page }) => {
  const advisor = await createStaff(admin, 'demo', 'advisor')
  await staffLogin(page, DEMO, advisor)
  await expect(page).toHaveURL(`${DEMO}/staff/leads`)
  const nav = page.getByRole('navigation', { name: 'ناوبری میز کار' }).first()
  await expect(nav.getByRole('link')).toHaveText(['مشتریان', 'دانشجویان', 'امنیت حساب'])

  const res = await page.request.get(`${DEMO}/staff/finance`, { maxRedirects: 0 })
  expect(res.status()).toBe(403)
  await page.goto(`${DEMO}/staff/finance`)
  await expect(page.getByRole('heading', { name: 'به این بخش دسترسی ندارید' })).toBeVisible()
  await expect(page.getByText('finance.export', { exact: false })).toBeVisible()
  await expect(nav).toBeVisible()
})

test('staff turns on 2FA, signs out, verifies on next sign-in, then turns it off', async ({ page }) => {
  test.setTimeout(150_000)
  const u = await createStaff(admin, 'demo', 'advisor')
  await staffLogin(page, DEMO, u, '/staff/security')
  await expect(page).toHaveURL(`${DEMO}/staff/security`)

  await page.getByRole('button', { name: 'روشن‌کردن' }).click()
  await page.getByRole('button', { name: 'شروع' }).click()
  const key = page.locator('code')
  await expect(key).toHaveText(/^[A-Z2-7 ]{16,}$/)
  await expect(page.getByRole('img', { name: 'کد QR تأیید دومرحله‌ای' }).locator('svg')).toBeVisible()
  const secret = ((await key.textContent()) ?? '').replace(/\s+/g, '')

  // A wrong code first: 401 with attempts left.
  await page.getByLabel('کد تأیید').fill('000000')
  await page.getByRole('button', { name: 'فعال‌سازی' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'کد درست نیست' })).toContainText('۴ بار دیگر می‌توانید امتحان کنید')

  let last = await nextCode(secret, null)
  await page.getByLabel('کد تأیید').fill(last.code)
  await page.getByRole('button', { name: 'فعال‌سازی' }).click()
  await expect(page.getByText('تأیید دومرحله‌ای فعال شد.')).toBeVisible()
  await page.getByRole('button', { name: 'ادامه' }).click()
  await expect(page.getByText('روشن', { exact: true })).toBeVisible()

  // Sign out (POST route handler, 303 → /staff/login).
  await page.getByRole('button', { name: /منوی کاربر/ }).click()
  await page.getByRole('menuitem', { name: 'خروج' }).click()
  await expect(page).toHaveURL(`${DEMO}/staff/login`)
  expect((await page.request.get(`${DEMO}/staff`, { maxRedirects: 0 })).status()).toBe(307)

  // Sign in again: the session is pending until the code is entered.
  await staffLogin(page, DEMO, u)
  await expect(page).toHaveURL(`${DEMO}/staff/2fa/verify?next=%2Fstaff`)
  last = await nextCode(secret, last.step)
  await page.getByLabel('کد تأیید').fill(last.code)
  await page.getByRole('button', { name: 'تأیید و ادامه' }).click()
  await expect(page).toHaveURL(`${DEMO}/staff/leads`)

  // Turn it off with a fresh code.
  await page.goto(`${DEMO}/staff/security`)
  await page.getByRole('button', { name: 'خاموش‌کردن' }).click()
  last = await nextCode(secret, last.step)
  await page.getByLabel('کد تأیید').fill(last.code)
  await page.getByRole('button', { name: 'خاموش‌کردن' }).click()
  await expect(page.getByText('تأیید دومرحله‌ای خاموش شد.')).toBeVisible()
})

test('five wrong codes lock verification (429 with lockedUntil)', async ({ playwright }) => {
  const u = await createStaff(admin, 'demo', 'advisor')
  const api = await apiAs(playwright, DEMO, u.email, u.password)
  const setup = (await (await api.post('/api/users/2fa/setup')).json()) as { secret: string; qrSvg: string }
  expect(setup.qrSvg).toMatch(/^<svg /)
  const statuses: number[] = []
  let attemptsLeft: unknown
  for (let i = 0; i < 5; i++) {
    const r = await api.post('/api/users/2fa/enable', { data: { code: '000000' } })
    statuses.push(r.status())
    if (i === 0) attemptsLeft = ((await r.json()) as { attemptsLeft?: number }).attemptsLeft
  }
  expect(statuses).toEqual([401, 401, 401, 401, 429])
  expect(attemptsLeft).toBe(4)
  const locked = await api.post('/api/users/2fa/enable', { data: { code: (await nextCode(setup.secret, null)).code } })
  expect(locked.status()).toBe(429)
  const body = (await locked.json()) as { lockedUntil?: string }
  expect(Date.parse(body.lockedUntil ?? '')).toBeGreaterThan(Date.now())
  await api.dispose()
})

async function enable2fa(api: APIRequestContext): Promise<void> {
  const { secret } = (await (await api.post('/api/users/2fa/setup')).json()) as { secret: string }
  const r = await api.post('/api/users/2fa/enable', { data: { code: (await nextCode(secret, null)).code } })
  expect(r.ok()).toBeTruthy()
}

test('admin reset of 2FA is permission-gated, revokes sessions and is audit-logged', async ({ playwright, page }) => {
  test.setTimeout(150_000)
  const target: StaffUser = await createStaff(admin, 'demo', 'advisor', 'reset-target')
  const targetApi = await apiAs(playwright, DEMO, target.email, target.password)
  await enable2fa(targetApi)

  // Another advisor (no users.2fa.reset) is refused.
  const peer = await createStaff(admin, 'demo', 'advisor', 'peer')
  const peerApi = await apiAs(playwright, DEMO, peer.email, peer.password)
  const refused = await peerApi.post('/api/users/2fa/reset', { data: { userId: target.id } })
  expect(refused.status()).toBe(403)
  await peerApi.dispose()

  // Invalid input is refused before anything else.
  expect((await admin.post('/api/users/2fa/reset', { data: { userId: 'abc' } })).status()).toBe(400)

  // The academy admin resets it from the Payload user edit page.
  const academyAdmin = await createStaff(admin, 'demo', 'academy-admin', 'reset-admin')
  // Not on yourself.
  const selfApi = await apiAs(playwright, DEMO, academyAdmin.email, academyAdmin.password)
  const self = await selfApi.post('/api/users/2fa/reset', { data: { userId: academyAdmin.id } })
  expect(self.status()).toBe(403)
  await selfApi.dispose()

  await page.request.post(`${DEMO}/api/users/login`, { data: { email: academyAdmin.email, password: academyAdmin.password } })
  await page.goto(`${DEMO}/admin/collections/users/${target.id}`)
  await page.getByText(/^(وضعیت و دسترسی|Status & access)$/).first().click()
  await page.getByRole('button', { name: 'بازنشانی تأیید دومرحله‌ای' }).click()
  await expect(page.getByRole('alertdialog')).toContainText(target.name)
  await page.getByRole('button', { name: 'بازنشانی', exact: true }).click()
  await expect(page.getByText(`تأیید دومرحله‌ای ${target.name} بازنشانی شد.`)).toBeVisible()

  // Target: 2FA off, every session ended.
  const me = (await (await targetApi.get('/api/users/me')).json()) as { user: unknown }
  expect(me.user).toBeNull()
  await targetApi.dispose()
  const after = (await (await admin.get(`/api/users/${target.id}?depth=0`)).json()) as { twoFactorEnabled?: boolean }
  expect(after.twoFactorEnabled).toBe(false)

  // Audit row, written by the academy admin.
  const logs = (await (await admin.get(`/api/audit-logs?where[and][0][action][equals]=users.2fa.reset&where[and][1][docId][equals]=${target.id}&depth=0`)).json()) as {
    docs: { actor: number; targetCollection: string }[]
  }
  expect(logs.docs).toHaveLength(1)
  expect(logs.docs[0]!.actor).toBe(academyAdmin.id)
  expect(logs.docs[0]!.targetCollection).toBe('users')

  // Already off now: 409.
  const again = await admin.post('/api/users/2fa/reset', { data: { userId: target.id } })
  expect(again.status()).toBe(409)
})
