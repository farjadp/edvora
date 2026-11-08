import { expect, test, type Browser } from '@playwright/test'
import { PLATFORM, createSandbox, disposeSandbox, enterAs, expireNow, hooksConfigured, newVisitor, shot, wantShots, type Visitor } from './sandbox-helpers'

/**
 * PR screenshots for E-029 (docs/agents/handoffs/E-029/). Skipped unless E2E_SCREENSHOTS=1:
 *   E2E_SCREENSHOTS=1 pnpm e2e sandbox-demo-screens
 * The "full" state is captured by the capacity test in sandbox-demo.spec.ts (a real full state).
 */
test.skip(!wantShots() || !hooksConfigured(), 'set E2E_SCREENSHOTS=1 (and the sandbox e2e hooks) to capture the PR screenshots')

const SIZES = [
  { id: '360', viewport: { width: 360, height: 740 } },
  { id: 'desktop', viewport: { width: 1280, height: 800 } },
] as const
const SCHEMES = ['light', 'dark'] as const

async function visitor(browser: Browser, size: (typeof SIZES)[number], scheme: (typeof SCHEMES)[number]): Promise<Visitor> {
  const v = await newVisitor(browser, { viewport: size.viewport, colorScheme: scheme })
  // The site themes through localStorage('theme'), not prefers-color-scheme.
  await v.context.addInitScript((t) => window.localStorage.setItem('theme', t), scheme)
  return v
}

for (const size of SIZES) {
  for (const scheme of SCHEMES) {
    test(`/demo form and credentials screen — ${size.id} ${scheme}`, async ({ browser }) => {
      const v = await visitor(browser, size, scheme)
      try {
        await v.page.goto('/demo')
        await expect(v.page.getByRole('heading', { level: 1 })).toContainText('آکادمی خودتان را')
        await shot(v.page, `01-demo-form-${size.id}-${scheme}`)
        await v.page.getByRole('button', { name: 'ساخت آکادمی آزمایشی' }).click()
        await expect(v.page.getByRole('heading', { level: 1 })).toHaveText('آکادمی آزمایشی شما آماده است', { timeout: 15_000 })
        await shot(v.page, `02-credentials-${size.id}-${scheme}`)
      } finally {
        await disposeSandbox(v)
      }
    })
  }
}

test('states: rate-limited and expired', async ({ browser }) => {
  for (const size of SIZES) {
    const v = await visitor(browser, size, 'light')
    try {
      await v.page.goto('/demo?state=rate-limited')
      await expect(v.page.getByRole('heading', { level: 1 })).toContainText('درخواست‌های شما از حد مجاز گذشته است')
      await shot(v.page, `03-rate-limited-${size.id}-light`)
    } finally {
      await v.context.close()
    }
    const e = await visitor(browser, size, size.id === '360' ? 'light' : 'dark')
    try {
      await createSandbox(e)
      await expireNow(e)
      await e.page.goto('/demo')
      await expect(e.page.getByRole('heading', { level: 1 })).toHaveText('زمان آکادمی آزمایشی شما تمام شد')
      await shot(e.page, `04-expired-${size.id}-${size.id === '360' ? 'light' : 'dark'}`)
    } finally {
      await disposeSandbox(e)
    }
  }
})

test('returning visitor state (passwords not shown again)', async ({ browser }) => {
  const v = await visitor(browser, SIZES[0], 'light')
  try {
    await createSandbox(v)
    await v.page.goto('/demo')
    await expect(v.page.getByRole('heading', { level: 1 })).toHaveText('آکادمی آزمایشی شما هنوز فعال است')
    await shot(v.page, '06-returning-360-light')
  } finally {
    await disposeSandbox(v)
  }
})

for (const size of SIZES) {
  test(`banner in /staff and /dashboard — ${size.id}`, async ({ browser }) => {
    const scheme = size.id === 'desktop' ? 'dark' : 'light'
    const v = await visitor(browser, size, scheme)
    try {
      await createSandbox(v)
      await v.page.clock.install({ time: new Date() })
      await enterAs(v, 'admin')
      await v.page.goto('/staff/overview')
      await expect(v.page.locator('[role=status]', { hasText: 'تا پایان' })).toBeVisible()
      await shot(v.page, `07-banner-staff-${size.id}-${scheme}`)
      // Warning tone (15 minutes or less).
      await v.page.clock.fastForward('02:50:00')
      await expect(v.page.locator('[role=status]', { hasText: 'مانده است' })).toBeVisible({ timeout: 20_000 })
      await shot(v.page, `08-banner-warning-staff-${size.id}-${scheme}`)

      await enterAs(v, 'student')
      await v.page.goto('/dashboard')
      await expect(v.page.locator('[role=status]', { hasText: /تا پایان|مانده است/ })).toBeVisible()
      await shot(v.page, `09-banner-dashboard-${size.id}-${scheme}`)
      await v.page.goto('/learn/nemoone-modiriat')
      await expect(v.page.locator('[role=status]', { hasText: /تا پایان|مانده است/ })).toBeVisible()
      await shot(v.page, `10-banner-learn-${size.id}-${scheme}`)
    } finally {
      await disposeSandbox(v)
    }
  })

  test(`/admin is a real 403 and phone login is refused — ${size.id}`, async ({ browser }) => {
    const v = await visitor(browser, size, 'light')
    try {
      await createSandbox(v)
      await enterAs(v, 'admin')
      const res = await v.page.goto('/admin')
      expect(res?.status()).toBe(403)
      await shot(v.page, `11-admin-403-${size.id}-light`)
      // Phone/OTP login inside a sandbox.
      const anon = await newVisitor(await v.context.browser()!, { viewport: size.viewport })
      try {
        await anon.context.addCookies((await v.context.cookies()).filter((c) => c.name === 'edvora_sbx').map(({ name, value }) => ({ name, value, url: PLATFORM })))
        await anon.page.goto('/login')
        await anon.page.getByLabel('شماره موبایل').fill('09120001234')
        await anon.page.getByRole('button', { name: 'دریافت کد ورود' }).click()
        await expect(anon.page.getByText('ورود با پیامک غیرفعال است')).toBeVisible()
        await shot(anon.page, `12-sms-login-refused-${size.id}-light`)
      } finally {
        await anon.context.close()
      }
    } finally {
      await disposeSandbox(v)
    }
  })
}
