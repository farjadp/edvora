import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  DEMO_HOST,
  PLATFORM,
  cronAuth,
  createSandbox,
  createSandboxApi,
  disposeSandbox,
  enterAs,
  expireNow,
  getChallenge,
  hooksConfigured,
  newVisitor,
  noisePng,
  runCleanup,
  shot,
  tenantOf,
  visitorIp,
  type Sandbox,
  type Visitor,
} from './sandbox-helpers'
import { adminCreds, apiAs, createStaff, staffLogin, tenantId } from './staff-helpers'

/**
 * E-029 QA: self-serve sandbox demo (docs/product/sandbox-demo.md ACs V/A/S/T/E/F and the section 6 isolation
 * checklist). Every test makes its own sandbox from its own "network" (X-Forwarded-For), cleans up after itself and
 * does not depend on the others. Needs SANDBOX_ENABLED, SANDBOX_E2E_HOOKS and SANDBOX_CRON_SECRET on the server
 * (see sandbox-helpers.ts); without them the whole file is skipped.
 */
test.skip(!hooksConfigured(), 'SANDBOX_E2E_HOOKS=true and SANDBOX_CRON_SECRET (>= 24 chars) are not configured')

const MEDIA_DIR = process.env.MEDIA_DIR || join(__dirname, '../../apps/web/media')
const TENANT_OWNED = [
  'courses', 'cohorts', 'lessons', 'orders', 'leads', 'coupons', 'enrollments', 'certificates', 'memberships', 'roles',
  'media', 'quizzes', 'questions', 'assignments', 'submissions', 'testimonials', 'posts', 'pages', 'audit-logs', 'learning-events',
  'attendance', 'live-sessions', 'quiz-attempts',
] as const

const banner = (page: Page) => page.locator('[role=status]', { hasText: /تا پایان|مانده است/ })

async function noHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(scrollWidth, `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth)
}

const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && 'id' in v ? Number((v as { id: unknown }).id) : null)

// ---------------------------------------------------------------------------------------------------------------
// V: getting a demo
// ---------------------------------------------------------------------------------------------------------------
test.describe('V: visitor gets a demo', () => {
  test('V1-V5, V9: 360px form -> credentials in under 10 s -> reload shows no passwords -> continue lands in /staff', async ({ browser }, info) => {
    const v = await newVisitor(browser, { viewport: { width: 360, height: 740 } })
    try {
      const { page } = v
      await page.goto('/demo')
      await expect(page.getByRole('heading', { level: 1 })).toContainText('آکادمی خودتان را ۳ ساعت آزمایش کنید')
      await expect(page.getByRole('button', { name: 'ساخت آکادمی آزمایشی' })).toBeVisible()
      // V1: no field is required; honeypot is invisible and not focusable.
      expect(await page.locator('form input[required]').count()).toBe(0)
      await expect(page.locator('input[name=website]')).toBeHidden()
      await noHorizontalScroll(page)
      // noindex on the demo page.
      await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/)

      // V2: worst case, tapped the moment the page is ready (the page itself waits out the 3 s minimum fill time).
      const t0 = Date.now()
      await page.getByRole('button', { name: 'ساخت آکادمی آزمایشی' }).click()
      await expect(page.getByRole('progressbar', { name: 'در حال ساخت آکادمی شما' })).toBeVisible() // progress state, never blank
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('آکادمی آزمایشی شما آماده است', { timeout: 10_000 })
      const ms = Date.now() - t0
      info.annotations.push({ type: 'time-to-credentials-ms', description: String(ms) })
      console.log(`[E-029] tap -> credentials on screen: ${ms} ms`)
      expect(ms, 'credentials within 10 s').toBeLessThan(10_000)

      // V3: two cards, each with login address, username, password, copy and enter buttons; Jalali expiry in Persian digits.
      for (const title of ['مدیر آکادمی', 'دانشجو']) {
        const card = page.getByRole('region', { name: title })
        await expect(card.getByText('نشانی ورود')).toBeVisible()
        await expect(card.getByText('نام کاربری')).toBeVisible()
        await expect(card.locator('code').nth(1)).toContainText('@sandbox.invalid')
        await expect(card.getByRole('button', { name: /کپی رمز عبور/ })).toBeVisible()
      }
      await expect(page.getByRole('button', { name: 'ورود به‌عنوان مدیر' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'ورود به‌عنوان دانشجو' })).toBeVisible()
      const expiry = await page.locator('main bdi').first().textContent()
      expect(expiry, 'Jalali clock time in Persian digits').toMatch(/^[۰-۹]{2}:[۰-۹]{2}$/)
      await expect(page.getByText('در ۳ ساعت چه چیزی را امتحان کنم؟')).toBeVisible()
      await noHorizontalScroll(page)

      const adminPassword = (await page.getByRole('region', { name: 'مدیر آکادمی' }).locator('code').nth(2).textContent())?.trim() ?? ''
      const studentPassword = (await page.getByRole('region', { name: 'دانشجو' }).locator('code').nth(2).textContent())?.trim() ?? ''
      expect(adminPassword.length).toBeGreaterThanOrEqual(10)
      expect(studentPassword.length).toBeGreaterThanOrEqual(10)
      const slug = new URL((await page.getByRole('region', { name: 'مدیر آکادمی' }).locator('code').first().textContent()) ?? '').pathname.split('/').pop()!

      // V4 / V9: reload -> remaining time + continue, passwords never shown again, no second sandbox.
      await page.reload()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('آکادمی آزمایشی شما هنوز فعال است')
      const html = await page.content()
      expect(html).not.toContain(adminPassword)
      expect(html).not.toContain(studentPassword)
      await expect(page.getByRole('button', { name: 'ساخت آکادمی آزمایشی' })).toHaveCount(0)
      const again = await createSandboxApi(page.request, {}, { skipWait: false })
      expect(again.status).toBe(409)
      expect(again.json.state).toBe('exists')

      // V5: "continue as admin" lands in /staff of THIS sandbox on the same host, with the banner.
      await page.getByRole('button', { name: 'ادامه به‌عنوان مدیر' }).click()
      await page.waitForURL(`${PLATFORM}/staff/**`)
      await expect(banner(page)).toBeVisible()
      await expect(banner(page)).toContainText('آکادمی آزمایشی')
      expect((await tenantOf(page.request)).slug).toBe(slug)
      await noHorizontalScroll(page)
    } finally {
      await disposeSandbox(v)
    }
  })

  test('V6, V7: Persian digits and spaces are normalised, bad email is a calm Persian error and creates nothing', async ({ browser }) => {
    const v = await newVisitor(browser)
    try {
      await v.page.goto('/demo')
      await v.page.getByLabel(/نام شما/).fill('  علی   رضایی ۱۲۳ ')
      await v.page.getByRole('textbox', { name: /ایمیل/ }).fill('not-an-email')
      await v.page.getByRole('button', { name: 'ساخت آکادمی آزمایشی' }).click()
      await expect(v.page.getByText('ایمیل واردشده درست به نظر نمی‌رسد.')).toBeVisible({ timeout: 15_000 })
      expect((await v.context.cookies()).map((c) => c.name)).not.toContain('edvora_sbx')
      await expect(v.page.getByRole('heading', { level: 1 })).toContainText('آکادمی خودتان را') // still the form

      // Persian digits inside a valid address are accepted (normalised to Latin).
      await v.page.getByRole('textbox', { name: /ایمیل/ }).fill('۱۲۳@example.com')
      await v.page.getByRole('button', { name: 'ساخت آکادمی آزمایشی' }).click()
      await expect(v.page.getByRole('heading', { level: 1 })).toHaveText('آکادمی آزمایشی شما آماده است', { timeout: 15_000 })
      // No email without the consent tick -> no lead notice.
      await expect(v.page.getByText('ایمیل شما ثبت شد')).toHaveCount(0)
    } finally {
      await disposeSandbox(v)
    }
  })

  test('V8: email + consent tick is saved as a platform lead and told so', async ({ browser }) => {
    const v = await newVisitor(browser)
    try {
      await v.page.goto('/demo')
      await v.page.getByRole('textbox', { name: /ایمیل/ }).fill(`qa-${Date.now()}@example.com`)
      await v.page.getByRole('checkbox').check()
      await v.page.getByRole('button', { name: 'ساخت آکادمی آزمایشی' }).click()
      await expect(v.page.getByText('ایمیل شما ثبت شد؛ فقط برای تماس دربارهٔ ادورا.')).toBeVisible({ timeout: 15_000 })
    } finally {
      await disposeSandbox(v)
    }
  })

  test('V5, T1, S12: student signs in on a second device (login address + password) and sees the banner in /dashboard and /learn', async ({ browser }) => {
    const owner = await newVisitor(browser)
    const device2 = await newVisitor(browser) // other cookies, other network
    try {
      const sb = await createSandbox(owner)
      const { page } = device2
      await page.goto(sb.loginUrl)
      await page.waitForURL(`${PLATFORM}/demo/login`)
      // A wrong password: calm Persian message, no stack trace.
      await page.getByLabel(/نام کاربری/).fill(sb.student.email)
      await page.getByLabel(/رمز عبور/).fill('wrong-password-1')
      await page.getByRole('button', { name: /^ورود/ }).click()
      await expect(page.locator('body')).not.toContainText(/stack|TypeError|at .*\.ts/)
      await expect(page).toHaveURL(/\/demo\/login\?error=/)
      await page.getByLabel(/نام کاربری/).fill(sb.student.email)
      await page.getByLabel(/رمز عبور/).fill(sb.student.password)
      await page.getByRole('button', { name: /^ورود/ }).click()
      await page.waitForURL(`${PLATFORM}/dashboard`)
      await expect(banner(page)).toBeVisible()
      await expect(page.getByTestId('dashboard-greeting')).toBeVisible()
      // One enrolment in the seeded cohort.
      await expect(page.getByText('دورهٔ نمونهٔ مدیریت کسب‌وکار').first()).toBeVisible()
      await page.goto('/learn/nemoone-modiriat')
      await expect(banner(page)).toBeVisible()
      await noHorizontalScroll(page)
    } finally {
      await device2.context.close()
      await disposeSandbox(owner)
    }
  })

  test('S8, section 6.4: phone/OTP login is refused inside a sandbox: no code is issued or shown, no SMS can leave', async ({ browser }) => {
    const v = await newVisitor(browser)
    try {
      await createSandbox(v)
      await enterAs(v, 'student')
      const anon = await newVisitor(browser)
      try {
        await anon.context.addCookies((await v.context.cookies()).filter((c) => c.name === 'edvora_sbx').map(({ name, value }) => ({ name, value, url: PLATFORM })))
        await anon.page.goto('/login')
        await anon.page.getByLabel('شماره موبایل').fill('09120001234')
        await anon.page.getByRole('button', { name: 'دریافت کد ورود' }).click()
        // A calm Persian refusal; never a dev code, never a code field, never a stack trace.
        await expect(anon.page.getByText('ورود با پیامک غیرفعال است')).toBeVisible()
        await expect(anon.page.locator('p', { hasText: 'حالت توسعه' })).toHaveCount(0)
        await expect(anon.page.getByLabel('کد ورود')).toHaveCount(0)
        await expect(anon.page.locator('body')).not.toContainText(/stack|TypeError|at .*\.ts/)
      } finally {
        await anon.context.close()
      }
    } finally {
      await disposeSandbox(v)
    }
  })

  test('T3, S7, S8: checkout inside a sandbox stays on the mock gateway (success and cancel); the browser talks to our host only', async ({ browser }) => {
    const v = await newVisitor(browser)
    const hosts = new Set<string>()
    v.page.on('request', (r) => hosts.add(new URL(r.url()).host))
    try {
      await createSandbox(v)
      await enterAs(v, 'student')
      await v.page.goto('/courses/nemoone-kargah-forush')
      await v.page.getByRole('button', { name: 'ثبت‌نام و پرداخت' }).click()
      await v.page.waitForURL(/\/pay\/mock\?/)
      expect(new URL(v.page.url()).origin).toBe(PLATFORM)
      await v.page.getByRole('link', { name: 'انصراف از پرداخت' }).click()
      await v.page.waitForURL(`${PLATFORM}/payments/result?**`)
      expect(new URL(v.page.url()).searchParams.get('status')).not.toBe('paid')
      await expect(v.page.locator('body')).not.toContainText(/Error|stack/)

      await v.page.goto('/courses/nemoone-kargah-forush')
      await v.page.getByRole('button', { name: 'ثبت‌نام و پرداخت' }).click()
      await v.page.waitForURL(/\/pay\/mock\?/)
      await v.page.getByRole('link', { name: 'پرداخت موفق' }).click()
      await v.page.waitForURL(`${PLATFORM}/payments/result?**`)
      expect(new URL(v.page.url()).searchParams.get('status')).toBe('paid')
      expect([...hosts].filter((h) => !h.startsWith('localhost:')), 'no external host contacted from the browser').toEqual([])
    } finally {
      await disposeSandbox(v)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
// A: abuse protection
// ---------------------------------------------------------------------------------------------------------------
test.describe('A: abuse protection', () => {
  test('A1, A2: honeypot, too-fast submit, reused and forged proof-of-work all give the same quiet retry and create nothing', async ({ playwright }) => {
    const api = await playwright.request.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': visitorIp() } })
    try {
      const bots = await createSandboxApi(api, { website: 'http://spam.example' })
      expect(bots.status).toBe(400)
      expect(bots.json.state).toBe('retry')
      expect(bots.res.headers()['set-cookie'] ?? '').not.toContain('edvora_sbx')

      const fast = await createSandboxApi(api, {}, { skipWait: true })
      expect(fast.status).toBe(400)
      expect(fast.json.state).toBe('retry')

      const ch = await getChallenge(api)
      const forged = await api.post(`${PLATFORM}/demo/api/create`, { data: { token: ch.token, counter: 1 }, headers: { 'X-Forwarded-For': visitorIp() } })
      expect(forged.status()).toBe(400)
      const garbage = await api.post(`${PLATFORM}/demo/api/create`, { data: { token: 'x'.repeat(40), counter: 1 }, headers: { 'X-Forwarded-For': visitorIp() } })
      expect(garbage.status()).toBe(400)
      const notJson = await api.post(`${PLATFORM}/demo/api/create`, { data: 'nope', headers: { 'content-type': 'text/plain', 'X-Forwarded-For': visitorIp() } })
      expect([400, 415]).toContain(notJson.status())

      // Single use: a valid solved token works once; replaying the very same body is refused.
      const ok = await createSandboxApi(api)
      expect(ok.status).toBe(200)
      // (other network: this one has used up its 10 requests a minute)
      const replay = await api.post(`${PLATFORM}/demo/api/create`, { data: { token: ok.ch.token, counter: ok.counter }, headers: { 'X-Forwarded-For': visitorIp() } })
      expect(replay.status()).toBe(400)
      // Clean up the one sandbox that was created (this api context owns its cookies).
      await api.post(`${PLATFORM}/demo/api/test/expire?purge=1`, { headers: cronAuth() })
      await runCleanup(api)
    } finally {
      await api.dispose()
    }
  })

  test('A3, A4: 10 requests/min per network, 429 after; spoofing the left side of X-Forwarded-For buys nothing (hops=1: the last entry counts)', async ({ playwright }) => {
    const real = visitorIp()
    const api = await playwright.request.newContext()
    try {
      const statuses: number[] = []
      for (let i = 0; i < 13; i++) {
        const r = await api.get(`${PLATFORM}/demo/api/challenge`, { headers: { 'X-Forwarded-For': `203.0.113.${i}, ${real}` } })
        statuses.push(r.status())
      }
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBeTruthy()
      expect(statuses.slice(10)).toEqual([429, 429, 429])
      const limited = await api.get(`${PLATFORM}/demo/api/challenge`, { headers: { 'X-Forwarded-For': `203.0.113.99, ${real}` } })
      expect(((await limited.json()) as { state: string }).state).toBe('rate-limited')
      // A different last entry is a different network: allowed.
      const other = await api.get(`${PLATFORM}/demo/api/challenge`, { headers: { 'X-Forwarded-For': visitorIp() } })
      expect(other.status()).toBe(200)
    } finally {
      await api.dispose()
    }
  })

  test('the demo endpoints do not exist on academy hosts', async ({ request }) => {
    expect((await request.get(`${DEMO_HOST}/demo`)).status()).toBe(404)
    expect((await request.get(`${DEMO_HOST}/demo/api/challenge`)).status()).toBe(404)
    expect((await request.post(`${DEMO_HOST}/demo/api/create`, { data: {} })).status()).toBe(404)
  })

  test('cron/e2e endpoints refuse requests without the bearer secret', async ({ request }) => {
    const h = { 'X-Forwarded-For': visitorIp() }
    expect((await request.post(`${PLATFORM}/demo/api/cleanup`, { headers: h })).status()).toBe(404)
    expect((await request.post(`${PLATFORM}/demo/api/cleanup`, { headers: { ...h, Authorization: 'Bearer wrong' } })).status()).toBe(404)
    expect((await request.post(`${PLATFORM}/demo/api/test/expire`, { headers: h })).status()).toBe(404)
    expect((await request.post(`${PLATFORM}/demo/ops/purge`, { headers: h, maxRedirects: 0 })).status()).not.toBe(200)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// S + section 6: isolation and hard limits of a sandbox admin
// ---------------------------------------------------------------------------------------------------------------
test.describe('S / isolation: sandbox admin against demo and iba', () => {
  let v: Visitor
  let sb: Sandbox
  let sbxId: number
  let realAdmin: APIRequestContext | null = null
  let demoId = 0
  let ibaId = 0
  let demoCourseId = 0
  let demoCourseTitle = ''

  test.beforeAll(async ({ browser, playwright }) => {
    v = await newVisitor(browser)
    sb = await createSandbox(v)
    await enterAs(v, 'admin')
    sbxId = (await tenantOf(v.context.request)).id
    const { email, password } = adminCreds()
    if (email && password) {
      realAdmin = await apiAs(playwright, DEMO_HOST, email, password)
      demoId = await tenantId(realAdmin, 'demo')
      ibaId = await tenantId(realAdmin, 'iba')
      const c = await realAdmin.get(`/api/courses?where[tenant][equals]=${demoId}&limit=1&depth=0`)
      const d = ((await c.json()) as { docs: { id: number; title: string }[] }).docs[0]
      demoCourseId = d?.id ?? 0
      demoCourseTitle = d?.title ?? ''
    }
  })
  test.afterAll(async () => {
    await realAdmin?.dispose()
    await disposeSandbox(v)
  })

  const api = () => v.context.request

  test('S9, checklist 1: REST with where[tenant] tampering returns only sandbox rows (and the real tenants really have data)', async () => {
    test.skip(!realAdmin, 'needs SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD to know the demo and iba ids')
    // Canary: the real tenants do have rows, so "empty" below means "hidden", not "nothing there".
    const canary = await realAdmin!.get(`/api/courses?where[tenant][in]=${demoId},${ibaId}&limit=1&depth=0`)
    expect(((await canary.json()) as { totalDocs: number }).totalDocs).toBeGreaterThan(0)

    for (const col of TENANT_OWNED) {
      const tampered = await api().get(`${PLATFORM}/api/${col}?where[tenant][in]=${demoId},${ibaId}&limit=100&depth=0`)
      if (tampered.ok()) expect(((await tampered.json()) as { totalDocs: number }).totalDocs, `${col} tampered`).toBe(0)
      const neq = await api().get(`${PLATFORM}/api/${col}?where[tenant][not_equals]=${sbxId}&limit=100&depth=0`)
      if (neq.ok()) expect(((await neq.json()) as { totalDocs: number }).totalDocs, `${col} not_equals own`).toBe(0)
      const all = await api().get(`${PLATFORM}/api/${col}?limit=200&depth=0`)
      if (all.ok()) {
        const docs = ((await all.json()) as { docs: { tenant?: unknown }[] }).docs
        for (const d of docs) expect(idOf(d.tenant), `${col}: foreign row`).toBe(sbxId)
      }
      expect([200, 400, 403, 404], `${col} status`).toContain(all.status())
    }
    // tenants: exactly the sandbox, whatever the filter says.
    for (const q of [`where[slug][in]=demo,iba`, `where[id][in]=${demoId},${ibaId}`, `where[id][not_equals]=${sbxId}`]) {
      const r = await api().get(`${PLATFORM}/api/tenants?${q}&limit=50&depth=0`)
      expect(((await r.json()) as { totalDocs: number }).totalDocs, q).toBe(0)
    }
    // users: nobody outside the sandbox.
    const users = await api().get(`${PLATFORM}/api/users?limit=200&depth=0`)
    const rows = ((await users.json()) as { docs: { sandboxTenant?: unknown; tenants?: { tenant: unknown }[] }[] }).docs
    expect(rows.length).toBeGreaterThan(0)
    for (const u of rows) {
      expect(idOf(u.sandboxTenant)).toBe(sbxId)
      for (const t of u.tenants ?? []) expect(idOf(t.tenant)).toBe(sbxId)
    }
  })

  test('S9: reading or writing another tenant by id is refused, and the real data is unchanged', async () => {
    test.skip(!realAdmin || !demoCourseId, 'needs the seeded super admin and a demo course')
    expect([403, 404]).toContain((await api().get(`${PLATFORM}/api/courses/${demoCourseId}`)).status())
    const patch = await api().patch(`${PLATFORM}/api/courses/${demoCourseId}`, { data: { title: 'hacked by sandbox' } })
    expect([403, 404]).toContain(patch.status())
    const mk = await api().post(`${PLATFORM}/api/courses`, { data: { title: 'x', slug: 'x-evil', tenant: demoId } })
    expect(mk.ok()).toBeFalsy()
    const u = await api().post(`${PLATFORM}/api/users`, { data: { email: `evil-${Date.now()}@sandbox.invalid`, password: 'Aa1!aaaaaaaa', roles: ['student'], tenants: [{ tenant: demoId }] } })
    expect(u.status()).toBe(403)
    const m = await api().post(`${PLATFORM}/api/memberships`, { data: { tenant: demoId, user: 1, status: 'active' } })
    expect(m.ok()).toBeFalsy()
    const after = await realAdmin!.get(`/api/courses/${demoCourseId}?depth=0`)
    expect(((await after.json()) as { title: string }).title).toBe(demoCourseTitle)
    // Sandbox pages by URL: another tenant's course slug is a 404 inside the sandbox.
    const page = await v.page.goto('/courses/demo-program')
    expect(page?.status()).toBe(404)
  })

  test('checklist 1: GraphQL gives no foreign data (whatever its state)', async () => {
    test.skip(!realAdmin || !demoCourseTitle, 'needs the seeded super admin and a demo course')
    for (const query of ['{ Courses(limit: 100) { docs { id title tenant { id slug } } } }', '{ Tenants(limit: 100) { docs { id slug } } }', '{ Orders(limit: 100) { docs { id } } }']) {
      const res = await api().post(`${PLATFORM}/api/graphql`, { data: { query } })
      const text = await res.text()
      test.info().annotations.push({ type: 'graphql-status', description: String(res.status()) })
      expect(text).not.toContain(demoCourseTitle)
      expect(text).not.toMatch(/"slug":"(demo|iba)"/)
      expect(text).not.toMatch(/at .*\.(ts|js):\d+/) // no stack trace
    }
    // Anonymous GraphQL gets nothing either.
  })

  test('checklist 1: another academy\'s media file is not served to a sandbox admin; listing and ids are tenant-filtered', async () => {
    test.skip(!realAdmin, 'needs the seeded super admin')
    const list = await realAdmin!.get(`/api/media?where[tenant][equals]=${demoId}&limit=1&depth=0`)
    const media = ((await list.json()) as { docs: { id: number; url?: string }[] }).docs[0]
    test.skip(!media?.url, 'the demo academy has no media file to probe')
    const file = await api().get(`${PLATFORM}${media!.url}`)
    expect([401, 403, 404], 'media URL of another tenant').toContain(file.status())
    expect(file.headers()['content-type'] ?? '').not.toMatch(/^image\//)
    expect([403, 404]).toContain((await api().get(`${PLATFORM}/api/media/${media!.id}`)).status())
    const tampered = await api().get(`${PLATFORM}/api/media?where[tenant][equals]=${demoId}&limit=10&depth=0`)
    expect(((await tampered.json()) as { totalDocs: number }).totalDocs).toBe(0)
  })

  test('checklist 2: sandbox credentials give no access to demo or iba; demo staff cannot enter a sandbox', async ({ playwright, browser }) => {
    test.skip(!realAdmin, 'needs the seeded super admin')
    // Sandbox admin signs in through the real staff login of demo and iba: never lands in a staff desk there.
    for (const base of [DEMO_HOST, PLATFORM]) {
      const other = await browser.newContext({ locale: 'fa-IR', extraHTTPHeaders: { 'X-Forwarded-For': visitorIp() } })
      const page = await other.newPage()
      try {
        await staffLogin(page, base, sb.admin)
        await page.waitForLoadState('networkidle')
        expect(page.url(), `${base} staff desk`).not.toMatch(/\/staff\/(overview|leads|courses|orders)/)
        // Whatever token REST login minted, it opens nothing there.
        const tok = await other.request.post(`${base}/api/users/login`, { data: { email: sb.admin.email, password: sb.admin.password } })
        if (tok.ok()) {
          test.info().annotations.push({ type: 'observation', description: `REST /api/users/login with sandbox credentials mints a token on ${base} (it opens nothing there)` })
          expect((await other.request.get(`${base}/staff/overview`, { maxRedirects: 0 })).status()).not.toBe(200)
          const courses = ((await (await other.request.get(`${base}/api/courses?limit=100&depth=0`)).json()) as { docs: { tenant: unknown }[] }).docs
          for (const c of courses) expect(idOf(c.tenant)).toBe(sbxId) // nothing from demo/iba, only its own sandbox
        }
      } finally {
        await other.close()
      }
    }
    // The other way round: a real demo staff member's password does not open a sandbox.
    const staff = await createStaff(realAdmin!, 'demo', 'advisor', 'sbx-probe')
    const form = await api().post(`${PLATFORM}/demo/api/login`, { form: { email: staff.email, password: staff.password }, maxRedirects: 0 })
    expect(form.status()).toBe(303)
    expect(form.headers().location).toContain('/demo/login?error=')
    const rest = await playwright.request.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': visitorIp() } })
    try {
      await rest.post(`${PLATFORM}/api/users/login`, { data: { email: staff.email, password: staff.password } })
      const sandboxRows = ((await (await rest.get(`${PLATFORM}/api/courses?where[tenant][equals]=${sbxId}&limit=10&depth=0`)).json()) as { totalDocs: number }).totalDocs
      expect(sandboxRows, 'demo staff reads nothing from a sandbox').toBe(0)
    } finally {
      await rest.dispose()
    }
  })

  test('S10, C4: /admin is a real 403 inside a sandbox, with a Persian explanation', async () => {
    const res = await v.page.goto('/admin')
    expect(res?.status()).toBe(403)
    await expect(v.page.locator('body')).not.toContainText(/stack|TypeError/)
    for (const path of ['/admin/collections/tenants', '/admin/collections/users', '/admin/collections/demo-sandboxes']) {
      expect((await api().get(`${PLATFORM}${path}`)).status(), path).toBe(403)
    }
    // Without the selector cookie the sandbox token still opens nothing in /admin.
    const bare = await v.page.context().browser()!.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': visitorIp() } })
    try {
      const token = (await v.context.cookies()).find((c) => c.name === 'payload-token')!
      await bare.addCookies([{ ...token, url: PLATFORM }].map(({ name, value }) => ({ name, value, url: PLATFORM })))
      const r = await bare.request.get(`${PLATFORM}/admin`, { maxRedirects: 0 })
      expect(r.status()).not.toBe(200)
    } finally {
      await bare.close()
    }
  })

  test('S4: gateway, domain, plan, features, slug and sandbox flags cannot be written (403) and do not change', async () => {
    const before = await tenantOf(api())
    const full = async () => ((await (await api().get(`${PLATFORM}/api/tenants/${sbxId}?depth=0`)).json()) as Record<string, unknown>)
    const snapshot = await full()
    const attempts: Record<string, unknown>[] = [
      { zarinpalMerchantId: '00000000-0000-0000-0000-000000000000' },
      { domains: [{ domain: 'evil.example.com' }] },
      { plan: 'enterprise' },
      { features: ['site'] },
      { slug: 'iba' },
      { isSandbox: false },
      { expiresAt: '2099-01-01T00:00:00.000Z' },
      { purgeAt: '2099-01-01T00:00:00.000Z' },
    ]
    for (const data of attempts) {
      const r = await api().patch(`${PLATFORM}/api/tenants/${sbxId}`, { data })
      expect(r.status(), JSON.stringify(data)).toBe(403)
    }
    const after = await full()
    for (const k of ['zarinpalMerchantId', 'domains', 'plan', 'features', 'slug', 'isSandbox', 'expiresAt', 'purgeAt']) expect(after[k], k).toEqual(snapshot[k])
    expect((await tenantOf(api())).expiresAt).toBe(before.expiresAt)
    expect((await api().post(`${PLATFORM}/api/tenants`, { data: { name: 'x', slug: 'another' } })).status()).toBe(403)
    expect([403, 404]).toContain((await api().patch(`${PLATFORM}/api/tenants/${sbxId + 1000}`, { data: { name: 'x' } })).status())
  })

  test('section 6.3, S1: no super-admin elevation, no way out of the sandbox flag, platform collections closed', async ({ playwright }) => {
    const me = ((await (await api().get(`${PLATFORM}/api/users/me`)).json()) as { user: { id: number; roles?: string[]; sandboxTenant?: unknown } }).user
    expect(me.roles ?? []).not.toContain('super-admin')

    const self = await api().patch(`${PLATFORM}/api/users/${me.id}`, { data: { roles: ['super-admin'], sandboxTenant: null } })
    const selfDoc = ((await self.json()) as { doc?: { roles?: string[]; sandboxTenant?: unknown } }).doc
    expect(selfDoc?.roles ?? []).not.toContain('super-admin')
    expect(idOf(selfDoc?.sandboxTenant)).toBe(sbxId)

    const email = `su-${Date.now()}@sandbox.invalid`
    const created = await api().post(`${PLATFORM}/api/users`, { data: { email, password: 'Aa1!aaaaaaaa', roles: ['super-admin'], sandboxTenant: null, tenants: [{ tenant: sbxId }] } })
    const doc = ((await created.json()) as { doc?: { roles?: string[]; sandboxTenant?: unknown } }).doc
    if (created.ok()) {
      expect(doc?.roles ?? []).not.toContain('super-admin')
      expect(idOf(doc?.sandboxTenant), 'staff created in a sandbox belong to it').toBe(sbxId)
      // And the new account is a sandbox account: sees only the sandbox, no /admin.
      const k = await playwright.request.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': visitorIp() } })
      try {
        const login = await k.post(`${PLATFORM}/api/users/login`, { data: { email, password: 'Aa1!aaaaaaaa' } })
        expect(login.ok()).toBeTruthy()
        const tenants = ((await (await k.get(`${PLATFORM}/api/tenants?limit=50&depth=0`)).json()) as { docs: { id: number }[] }).docs
        expect(tenants.map((t) => t.id)).toEqual([sbxId])
        expect((await k.get(`${PLATFORM}/admin`, { maxRedirects: 0 })).status()).not.toBe(200)
      } finally {
        await k.dispose()
      }
    }
    for (const col of ['demo-sandboxes', 'demo-leads']) expect((await api().get(`${PLATFORM}/api/${col}`)).status(), col).toBe(403)
    expect((await api().get(`${PLATFORM}/demo/ops`, { maxRedirects: 0 })).status()).not.toBe(200)
    expect((await api().get(`${PLATFORM}/demo/ops/leads.csv`, { maxRedirects: 0 })).status()).not.toBe(200)
  })

  test('S5, E3: staff a sandbox admin adds inherit the expiry; a longer membership is clamped', async () => {
    const tenant = await tenantOf(api())
    const role = ((await (await api().get(`${PLATFORM}/api/roles?limit=1&depth=0`)).json()) as { docs: { id: number }[] }).docs[0]
    expect(role).toBeTruthy()
    const email = `crew-${Date.now()}@sandbox.invalid`
    const user = await api().post(`${PLATFORM}/api/users`, { data: { email, password: 'Aa1!aaaaaaaa', roles: ['student'], tenants: [{ tenant: sbxId }] } })
    expect(user.status()).toBe(201)
    const userId = ((await user.json()) as { doc: { id: number } }).doc.id
    const m = await api().post(`${PLATFORM}/api/memberships`, { data: { tenant: sbxId, user: userId, roles: [role!.id], status: 'active', expiresAt: '2099-01-01T00:00:00.000Z' } })
    expect(m.status(), await m.text()).toBe(201)
    const exp = ((await m.json()) as { doc: { expiresAt: string } }).doc.expiresAt
    expect(new Date(exp).getTime()).toBeLessThanOrEqual(new Date(tenant.expiresAt!).getTime())
    // No expiry at all -> filled with the sandbox expiry.
    const u2 = await api().post(`${PLATFORM}/api/users`, { data: { email: `crew2-${Date.now()}@sandbox.invalid`, password: 'Aa1!aaaaaaaa', roles: ['student'], tenants: [{ tenant: sbxId }] } })
    const m2 = await api().post(`${PLATFORM}/api/memberships`, { data: { tenant: sbxId, user: ((await u2.json()) as { doc: { id: number } }).doc.id, roles: [role!.id], status: 'active' } })
    expect(m2.status()).toBe(201)
    expect(new Date(((await m2.json()) as { doc: { expiresAt: string } }).doc.expiresAt).getTime()).toBeLessThanOrEqual(new Date(tenant.expiresAt!).getTime())
  })

  test('S3: the sandbox admin can run the academy: create a course in the sandbox and see it', async () => {
    const title = `دورهٔ QA ${Date.now()}`
    const c = await api().post(`${PLATFORM}/api/courses`, { data: { title, slug: `qa-${Date.now()}`, tenant: sbxId, status: 'draft', price: 50_000_000 } })
    expect(c.status(), await c.text()).toBe(201)
    const list = await api().get(`${PLATFORM}/api/courses?where[title][equals]=${encodeURIComponent(title)}&depth=0`)
    expect(((await list.json()) as { totalDocs: number }).totalDocs).toBe(1)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// S6 + E4: uploads and cleanup
// ---------------------------------------------------------------------------------------------------------------
test('S6, E4, E5, E6: upload quota refuses above the limit; cleanup deletes rows and files, is a no-op the second time and leaves demo and iba alone', async ({ browser, playwright }) => {
  const v = await newVisitor(browser)
  const { email, password } = adminCreds()
  const realAdmin = email && password ? await apiAs(playwright, DEMO_HOST, email, password) : null
  try {
    const sb = await createSandbox(v)
    await enterAs(v, 'admin')
    const api = v.context.request
    const tenant = await tenantOf(api)

    // Baseline of the real academies (E5).
    const snapshot = async () => {
      if (!realAdmin) return null
      const out: Record<string, number> = {}
      for (const slug of ['demo', 'iba']) {
        const id = await tenantId(realAdmin, slug)
        for (const col of ['courses', 'orders', 'enrollments', 'leads', 'users']) {
          const where = col === 'users' ? `where[tenants.tenant][equals]=${id}` : `where[tenant][equals]=${id}`
          const r = await realAdmin.get(`/api/${col}?${where}&limit=1&depth=0`)
          out[`${slug}.${col}`] = r.ok() ? ((await r.json()) as { totalDocs: number }).totalDocs : -1
        }
      }
      return out
    }
    const baseline = await snapshot()
    const publicBefore = [(await v.context.request.get(`${DEMO_HOST}/`)).status(), (await v.context.request.get(`${PLATFORM}/`, { headers: { Cookie: '' } })).status()]
    expect(publicBefore[0]).toBe(200)

    // S6: ~2.3 MB each; quota is 5 MB.
    const upload = async (name: string, buf: Buffer, mime = 'image/png') =>
      api.post(`${PLATFORM}/api/media`, { multipart: { _payload: JSON.stringify({ alt: 'QA', tenant: tenant.id }), file: { name, mimeType: mime, buffer: buf } } })
    const a = await upload(`qa-a-${Date.now()}.png`, noisePng(900, 900))
    const b = await upload(`qa-b-${Date.now()}.png`, noisePng(900, 900))
    expect(a.status(), await a.text()).toBe(201)
    expect(b.status(), await b.text()).toBe(201)
    const over = await upload(`qa-c-${Date.now()}.png`, noisePng(900, 900))
    expect(over.status()).toBe(413)
    expect(JSON.stringify(await over.json())).toContain('مگابایت')
    expect((await upload(`qa-big-${Date.now()}.png`, noisePng(1500, 1500))).status()).toBe(413)
    const text = await upload('notes.txt', Buffer.from('hello'), 'text/plain')
    expect(text.status()).toBe(400)
    const exe = await upload('evil.pdf', Buffer.from('MZ\x90\x00\x03'), 'application/pdf')
    expect(exe.status()).toBe(400)
    const media = ((await (await api.get(`${PLATFORM}/api/media?limit=10&depth=0`)).json()) as { docs: { filename: string; url: string }[] }).docs
    expect(media.length, 'only the two accepted files are stored').toBe(2)
    const names = media.map((m) => m.filename)
    for (const n of names) expect(existsSync(join(MEDIA_DIR, n)), `${n} on disk`).toBeTruthy()

    // E4: hard delete.
    await expireNow(v, true)
    const run1 = await runCleanup(api)
    expect(run1.purged).toContain(tenant.id)
    expect(run1.failed).toEqual([])
    for (const n of names) {
      expect(existsSync(join(MEDIA_DIR, n)), `${n} removed`).toBeFalsy()
      expect(existsSync(join(MEDIA_DIR, n.replace('.png', '-640x360.png'))), `${n} card size removed`).toBeFalsy()
      expect(existsSync(join(MEDIA_DIR, n.replace('.png', '-1600x900.png'))), `${n} hero size removed`).toBeFalsy()
    }
    if (realAdmin) {
      for (const col of ['courses', 'orders', 'enrollments', 'leads', 'memberships', 'roles', 'lessons', 'cohorts', 'media']) {
        const r = await realAdmin.get(`/api/${col}?where[tenant][equals]=${tenant.id}&limit=1&depth=0`)
        expect(((await r.json()) as { totalDocs: number }).totalDocs, `${col} of the purged sandbox`).toBe(0)
      }
      const t = await realAdmin.get(`/api/tenants?where[slug][equals]=${sb.slug}&limit=1&depth=0`)
      expect(((await t.json()) as { totalDocs: number }).totalDocs).toBe(0)
      for (const e of [sb.admin.email, sb.student.email]) {
        const u = await realAdmin.get(`/api/users?where[email][equals]=${encodeURIComponent(e)}&limit=1&depth=0`)
        expect(((await u.json()) as { totalDocs: number }).totalDocs, e).toBe(0)
      }
      // E5: demo and iba are untouched.
      expect(await snapshot()).toEqual(baseline)
    }
    expect((await v.context.request.get(`${DEMO_HOST}/`)).status()).toBe(200)

    // E6: a second run has nothing left to do.
    const run2 = await runCleanup(api)
    expect(run2.purged).toEqual([])
    expect(run2.failed).toEqual([])
    expect(run2.revoked).toBe(0)

    // V10 after purge: the owner still sees the ended state (not a 404, not data), and the old login is refused.
    await v.page.goto('/demo')
    await expect(v.page.getByRole('heading', { level: 1 })).toHaveText('زمان آکادمی آزمایشی شما تمام شد')
    const login = await api.post(`${PLATFORM}/demo/api/login`, { form: { email: sb.admin.email, password: sb.admin.password }, maxRedirects: 0 })
    expect(login.headers().location).toContain('/demo?state=ended')
  } finally {
    await realAdmin?.dispose()
    await disposeSandbox(v)
  }
})

test('E5: a forged sandbox selector cookie cannot switch the platform host to demo or any real academy', async ({ browser }) => {
  const v = await newVisitor(browser)
  try {
    const forged = Buffer.from(JSON.stringify({ k: 'sbx', tid: 2, exp: Date.now() + 3_600_000 })).toString('base64url')
    await v.context.addCookies([{ name: 'edvora_sbx', value: `${forged}.AAAA`, url: PLATFORM }])
    await v.page.goto('/')
    await expect(v.page.locator('[role=status]', { hasText: 'تا پایان' })).toHaveCount(0)
    await expect(v.page.locator('body')).not.toContainText('آکادمی آزمایشی')
    // The expire hook cannot be pointed at a real academy either: no valid selector -> 400.
    const hook = await v.context.request.post(`${PLATFORM}/demo/api/test/expire?purge=1`, { headers: cronAuth() })
    expect(hook.status()).toBe(400)
  } finally {
    await v.context.close()
  }
})

// ---------------------------------------------------------------------------------------------------------------
// E: expiry (simulated through the e2e hook; the clock and the hook end a sandbox the same way)
// ---------------------------------------------------------------------------------------------------------------
test.describe('E: expiry', () => {
  test('E1, E2, T5, V10: after expiry login is refused, sessions die on the next load, a server-action POST is refused, a replayed token reads nothing', async ({ browser }) => {
    const v = await newVisitor(browser)
    try {
      const sb = await createSandbox(v)
      const { page, context } = v
      await enterAs(v, 'student')
      await enterAs(v, 'admin')

      // Capture a real server action (mark a lesson watched) before the sandbox ends.
      await page.goto('/learn/nemoone-modiriat')
      await page.getByRole('link', { name: /معرفی دوره/ }).first().click()
      await page.waitForURL(`${PLATFORM}/learn/nemoone-modiriat/**`)
      let action: { url: string; headers: Record<string, string>; body: string } | null = null
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.headers()['next-action']) action = { url: r.url(), headers: r.headers(), body: r.postData() ?? '' }
      })
      const mark = page.getByRole('button', { name: 'علامت‌گذاری به‌عنوان دیده‌شده' })
      if (await mark.count()) await mark.first().click()
      await expect.poll(() => action, { timeout: 15_000 }).not.toBeNull()

      const token = (await context.cookies()).find((c) => c.name === 'payload-token')!.value
      await expireNow(v)

      // E1: logins refused with the ended state, no account details.
      const fresh = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': visitorIp() } })
      try {
        const form = await fresh.request.post(`${PLATFORM}/demo/api/login`, { form: { email: sb.admin.email, password: sb.admin.password }, maxRedirects: 0 })
        expect(form.status()).toBe(303) // no selector in this browser: back to /demo
        const rest = await fresh.request.post(`${PLATFORM}/api/users/login`, { data: { email: sb.admin.email, password: sb.admin.password } })
        expect(rest.status()).toBe(403)
        expect(await rest.text()).toContain('آکادمی آزمایشی')
        const restStudent = await fresh.request.post(`${PLATFORM}/api/users/login`, { data: { email: sb.student.email, password: sb.student.password } })
        expect(restStudent.status()).toBe(403)
        // Via the login address of the ended sandbox: the ended state.
        const sel = await fresh.request.get(sb.loginUrl, { maxRedirects: 0 })
        expect(sel.headers().location).toContain('/demo?state=ended')
      } finally {
        await fresh.close()
      }
      // Same browser, expired selector, wrong/right password: ended.
      const sameBrowser = await context.request.post(`${PLATFORM}/demo/api/login`, { form: { email: sb.admin.email, password: sb.admin.password }, maxRedirects: 0 })
      expect(sameBrowser.headers().location).toContain('/demo?state=ended')

      // T5: a server-action POST (a real captured one) is refused before it runs.
      const a = action!
      const replay = await context.request.post(a.url, {
        headers: { 'next-action': a.headers['next-action']!, 'content-type': a.headers['content-type'] ?? 'text/plain;charset=UTF-8' },
        data: a.body,
      })
      expect(replay.status()).toBe(403)
      expect(await replay.text()).not.toMatch(/stack|at .*\.ts/)
      // Plain API writes too.
      expect((await context.request.post(`${PLATFORM}/api/courses`, { data: { title: 'late' } })).status()).toBe(403)
      expect((await context.request.get(`${PLATFORM}/api/users/me`)).status()).toBe(403)

      // E2: the next page load ends the session in the same request and shows the ended state.
      for (const path of ['/staff/overview', '/dashboard', '/learn/nemoone-modiriat', '/']) {
        await page.goto(path)
        await page.waitForURL(`${PLATFORM}/demo?state=ended`)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('زمان آکادمی آزمایشی شما تمام شد')
      }
      const names = (await context.cookies()).map((c) => c.name)
      expect(names).not.toContain('payload-token')
      expect(names).not.toContain('edvora_session')
      await expect(page.getByText('اطلاعات آزمایشی پاک می‌شود')).toBeVisible()
      await expect(page.locator('body')).not.toContainText(sb.admin.email)

      // Replaying a captured payload-token with no selector cookie at all (the proxy cannot help): reads only what an
      // anonymous visitor reads, and writes nothing.
      const replayCtx = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': visitorIp() } })
      try {
        await replayCtx.addCookies([{ name: 'payload-token', value: token, url: PLATFORM }])
        const t = await tenantOfRaw(replayCtx.request)
        for (const col of ['orders', 'leads', 'coupons', 'certificates', 'audit-logs', 'roles', 'enrollments']) {
          const r = await replayCtx.request.get(`${PLATFORM}/api/${col}?where[tenant][equals]=${t}&limit=5&depth=0`)
          if (r.ok()) expect(((await r.json()) as { totalDocs: number }).totalDocs, `${col} readable with a replayed token`).toBe(0)
        }
        expect((await replayCtx.request.post(`${PLATFORM}/api/courses`, { data: { title: 'late', tenant: t } })).ok()).toBeFalsy()
        expect((await replayCtx.request.patch(`${PLATFORM}/api/tenants/${t}`, { data: { name: 'late' } })).ok()).toBeFalsy()
        expect((await replayCtx.request.get(`${PLATFORM}/staff/overview`, { maxRedirects: 0 })).status()).not.toBe(200)
        // After the cleanup job's revoke step the token is dead altogether.
        await runCleanup(replayCtx.request)
        const me = await replayCtx.request.get(`${PLATFORM}/api/users/me`)
        expect(((await me.json()) as { user: unknown }).user).toBeNull()
      } finally {
        await replayCtx.close()
      }
    } finally {
      await disposeSandbox(v)
    }
  })

  test('V10: the expired state offers a new demo; the new one is a different sandbox with fresh data', async ({ browser }) => {
    const v = await newVisitor(browser)
    try {
      const first = await createSandbox(v)
      await expireNow(v)
      await v.page.goto('/demo')
      await expect(v.page.getByRole('heading', { level: 1 })).toHaveText('زمان آکادمی آزمایشی شما تمام شد')
      await v.page.getByRole('button', { name: 'ساخت آکادمی آزمایشی جدید' }).click()
      await v.page.getByRole('button', { name: 'ساخت آکادمی آزمایشی' }).click()
      await expect(v.page.getByRole('heading', { level: 1 })).toHaveText('آکادمی آزمایشی شما آماده است', { timeout: 15_000 })
      const slug = new URL((await v.page.getByRole('region', { name: 'مدیر آکادمی' }).locator('code').first().textContent()) ?? '').pathname.split('/').pop()
      expect(slug).not.toBe(first.slug)
    } finally {
      await disposeSandbox(v)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
// S12: the countdown banner
// ---------------------------------------------------------------------------------------------------------------
test.describe('S12: countdown banner', () => {
  test('normal tone in /staff, /dashboard, /learn; warning tone at 15 minutes or less without layout shift on 360 px', async ({ browser }) => {
    const v = await newVisitor(browser, { viewport: { width: 360, height: 740 } })
    try {
      await createSandbox(v)
      await enterAs(v, 'admin')
      const { page } = v
      await page.clock.install({ time: new Date() })
      await page.goto('/staff/overview')
      const bar = banner(page)
      await expect(bar).toBeVisible()
      await expect(bar).toContainText(/تا پایان/)
      await expect(bar).toContainText(/[۰-۹]/) // Persian digits
      await expect(bar).not.toContainText(/[0-9]/)
      const normal = await bar.boundingBox()
      expect(normal!.height).toBeGreaterThanOrEqual(36)
      await noHorizontalScroll(page)
      const contentTop = await page.locator('main').first().evaluate((el) => el.getBoundingClientRect().top)

      // 3 h TTL: jump to 16 minutes left -> still normal; to 14 -> warning.
      await page.clock.fastForward('02:43:30')
      await expect(bar).toContainText('تا پایان')
      await page.clock.fastForward('00:02:30')
      await expect(bar).toContainText('مانده است. کارهایتان پس از پایان پاک می‌شود.', { timeout: 20_000 })
      await expect(bar).toContainText('کمتر از')
      const warn = await bar.boundingBox()
      expect(warn!.height, 'no layout shift when the tone changes').toBe(normal!.height)
      expect(await page.locator('main').first().evaluate((el) => el.getBoundingClientRect().top)).toBe(contentTop)
      await expect(bar.getByRole('link')).toBeVisible()
      await expect(bar.getByRole('button')).toHaveCount(0) // no close button
      await noHorizontalScroll(page)
      const box = await bar.getByRole('link').boundingBox()
      expect(box!.x + box!.width, 'link inside the 360 px viewport').toBeLessThanOrEqual(360)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      // RTL: the text starts at the right edge.
      expect(await bar.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')
    } finally {
      await disposeSandbox(v)
    }
  })

  test('the warning is also shown in /dashboard and /learn at 360 px', async ({ browser }) => {
    const v = await newVisitor(browser, { viewport: { width: 360, height: 740 } })
    try {
      await createSandbox(v)
      await enterAs(v, 'student')
      await v.page.clock.install({ time: new Date() })
      for (const path of ['/dashboard', '/learn/nemoone-modiriat']) {
        await v.page.goto(path)
        await expect(banner(v.page)).toBeVisible()
        await v.page.clock.fastForward('02:50:00')
        await expect(banner(v.page)).toContainText('مانده است', { timeout: 20_000 })
        await noHorizontalScroll(v.page)
      }
    } finally {
      await disposeSandbox(v)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
// F: capacity
// ---------------------------------------------------------------------------------------------------------------
test('F1-F3, A6: at SANDBOX_MAX_ACTIVE the next demo sees the full state; simultaneous submits at cap-1 create exactly one; a freed slot is reusable at once', async ({ browser, playwright }) => {
  test.setTimeout(240_000)
  const max = Number(process.env.SANDBOX_MAX_ACTIVE ?? 20)
  test.skip(max > 40, 'SANDBOX_MAX_ACTIVE is too large to fill in a test')
  const visitors: Visitor[] = []
  try {
    // Count what is already live (other runs / leftovers), then fill up to cap - 1 with fresh visitors.
    const probe = await playwright.request.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': visitorIp() } })
    const page0 = await probe.get(`${PLATFORM}/demo`)
    expect(page0.status()).toBe(200)
    await probe.dispose()

    const newOne = async () => {
      const v = await newVisitor(browser)
      visitors.push(v)
      return v
    }
    // Prepare challenges first so one 3.3 s wait serves them all.
    const makeAttempt = async () => {
      const v = await newOne()
      const ch = await getChallenge(v.context.request)
      return { v, ch }
    }
    let created = 0
    const prepared = await Promise.all(Array.from({ length: max + 5 }, () => makeAttempt()))
    await new Promise((r) => setTimeout(r, 3_400))
    const { createHash } = await import('node:crypto')
    const solve = (nonce: string, bits: number) => {
      for (let c = 0; ; c++) {
        const d = createHash('sha256').update(`${nonce}:${c}`).digest()
        let z = 0
        for (const b of d) {
          if (b === 0) {
            z += 8
            continue
          }
          z += Math.clz32(b) - 24
          break
        }
        if (z >= bits) return c
      }
    }
    const post = (a: { v: Visitor; ch: { token: string; nonce: string; bits: number } }) =>
      a.v.context.request.post(`${PLATFORM}/demo/api/create`, { data: { token: a.ch.token, counter: solve(a.ch.nonce, a.ch.bits) } })

    // Fill to cap - 1 (stops early if leftovers from elsewhere already use slots), then race the last five.
    const live: Visitor[] = []
    for (let i = 0; i < max - 1; i++) {
      const r = await post(prepared[i]!)
      if (((await r.json()) as { state: string }).state !== 'ready') break
      created++
      live.push(prepared[i]!.v)
    }
    const race = prepared.slice(max - 1, max + 4)
    const results = await Promise.all(race.map((a) => post(a).then(async (r) => ({ a, status: r.status(), body: (await r.json()) as { state: string } }))))
    const ready = results.filter((r) => r.body.state === 'ready')
    const full = results.filter((r) => r.body.state === 'full')
    for (const r of ready) live.push(r.a.v)
    expect(ready.length + full.length, JSON.stringify(results.map((r) => r.body.state))).toBe(results.length)
    expect(ready.length, 'A6: at cap - 1, at most one of the simultaneous submits wins').toBeLessThanOrEqual(1)
    if (created === max - 1) expect(ready.length, 'A6: exactly one wins').toBe(1)
    expect(full.length, 'the cap was reached during the run').toBeGreaterThan(0)
    for (const f of full) expect(f.status).toBe(503)

    // No overshoot: a further creation is refused with the soonest-expiry hint.
    const extra = await newOne()
    const exCh = await getChallenge(extra.context.request)
    await new Promise((r) => setTimeout(r, 3_400))
    const refused = await extra.context.request.post(`${PLATFORM}/demo/api/create`, { data: { token: exCh.token, counter: solve(exCh.nonce, exCh.bits) } })
    expect(refused.status()).toBe(503)
    const refusedBody = (await refused.json()) as { state: string; nextFreeInFa: string | null }
    expect(refusedBody.state).toBe('full')
    expect(refusedBody.nextFreeInFa, 'soonest expiry is shown').toMatch(/[۰-۹]/)

    // F1 on the page, F3 interest form still works.
    await extra.page.goto('/demo')
    await expect(extra.page.getByRole('heading', { level: 1 })).toHaveText('ظرفیت آکادمی‌های آزمایشی فعلاً پر است.')
    await noHorizontalScroll(extra.page)
    await shot(extra.page, '05-full-desktop-light')
    await extra.page.setViewportSize({ width: 360, height: 740 })
    await noHorizontalScroll(extra.page)
    await shot(extra.page, '05-full-360-light')
    const interest = await extra.context.request.post(`${PLATFORM}/demo/api/interest`, { data: { email: `qa-full-${Date.now()}@example.com`, consent: true, source: 'full-state' } })
    expect(interest.ok(), await interest.text()).toBeTruthy()

    // F2: a sandbox that expires frees its slot immediately (before grace cleanup).
    const victim = live[0]!
    await expireNow(victim)
    const retry = await getChallenge(extra.context.request)
    await new Promise((r) => setTimeout(r, 3_400))
    const afterFree = await extra.context.request.post(`${PLATFORM}/demo/api/create`, { data: { token: retry.token, counter: solve(retry.nonce, retry.bits) } })
    expect(afterFree.status(), await afterFree.text()).toBe(200)
  } finally {
    for (const v of visitors) {
      try {
        await v.context.request.post(`${PLATFORM}/demo/api/test/expire?purge=1`, { headers: cronAuth() })
      } catch {
        // already closed
      }
    }
    const last = visitors[0]
    if (last) {
      try {
        await runCleanup(last.context.request)
      } catch {
        // nothing more to do
      }
    }
    await Promise.all(visitors.map((v) => v.context.close().catch(() => undefined)))
  }
})

/** The tenant id the platform host resolves for this context's token (its own sandbox, via tenants list). */
async function tenantOfRaw(api: APIRequestContext): Promise<number> {
  const res = await api.get(`${PLATFORM}/api/users/me?depth=0`)
  const me = ((await res.json()) as { user?: { sandboxTenant?: unknown } }).user
  return idOf(me?.sandboxTenant) ?? 0
}
