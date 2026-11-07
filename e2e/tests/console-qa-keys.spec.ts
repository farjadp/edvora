import { expect, test, type Page } from '@playwright/test'
import { DEMO } from './helpers'
import { adminCreds } from './staff-helpers'

// E-035 QA: keyboard behaviour of the console shell (drawer focus trap, palette), on /staff and /admin.
test.beforeEach(async ({ context }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_* not available')
  const r = await context.request.post(`${DEMO}/api/users/login`, { data: { email, password } })
  expect(r.ok()).toBeTruthy()
})

const inside = (page: Page, selector: string) => page.evaluate((s) => Boolean(document.activeElement?.closest(s)), selector)

test('/staff 375: drawer opens with focus inside, Tab/Shift+Tab stay trapped, Esc closes and focus returns to the burger', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${DEMO}/staff/overview`)
  const burger = page.getByRole('button', { name: 'باز کردن منو' })
  await burger.focus()
  await page.keyboard.press('Enter')
  const drawer = page.locator('#console-drawer')
  await expect(drawer).toBeVisible()
  expect(await inside(page, '#console-drawer')).toBe(true)
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    expect(await inside(page, '#console-drawer'), `Tab #${i}`).toBe(true)
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await inside(page, '#console-drawer'), `Shift+Tab #${i}`).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(burger).toBeFocused()
  // Body scroll lock is released.
  expect(await page.evaluate(() => document.body.classList.contains('overflow-hidden'))).toBe(false)
})

test('/staff: palette via Ctrl+K, arrows, Enter navigates, Esc closes; Tab stays in the dialog; focus returns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${DEMO}/staff/overview`)
  await page.getByRole('button', { name: /جست‌وجو در بخش‌ها/ }).first().focus()
  await page.keyboard.press('Control+k')
  const dlg = page.getByRole('dialog', { name: 'جست‌وجو در بخش‌ها' })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByRole('textbox')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  expect(await inside(page, '[aria-label="جست‌وجو در بخش‌ها"] ul')).toBe(true)
  await page.keyboard.press('ArrowUp')
  await expect(dlg.getByRole('textbox')).toBeFocused()
  // Tab trapped?
  const leaks: number[] = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    if (!(await inside(page, '[aria-label="جست‌وجو در بخش‌ها"]'))) leaks.push(i)
  }
  expect(leaks, 'Tab presses that left the palette').toEqual([])
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await expect(page.getByRole('button', { name: /جست‌وجو در بخش‌ها/ }).first()).toBeFocused()
  // Search + Enter goes to the first hit.
  await page.keyboard.press('Control+k')
  await expect(dlg).toBeVisible()
  await dlg.getByRole('textbox').fill('سفارش')
  await expect(dlg.locator('a').first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).not.toHaveURL(/overview$/)
  // Persian vs Arabic letters in the query (ي ك).
  await page.goto(`${DEMO}/staff/overview`)
  await page.waitForLoadState('networkidle')
  await page.keyboard.press('Control+k')
  await expect(dlg).toBeVisible()
  await dlg.getByRole('textbox').fill('دانشجويان')
  await expect(dlg.locator('a').first()).toContainText('دانشجو')
})

test('/admin: palette via Ctrl+K and 375 nav drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${DEMO}/admin`)
  await page.waitForLoadState('networkidle')
  await page.keyboard.press('Control+k')
  const dlg = page.getByRole('dialog', { name: 'جست‌وجو در بخش‌ها' })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByRole('textbox')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  expect(await inside(page, '.c-pal__list')).toBe(true)
  const leaks: number[] = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    if (!(await inside(page, '.c-pal__box'))) leaks.push(i)
  }
  expect(leaks, 'Tab presses that left the admin palette').toEqual([])
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
  await page.keyboard.press('Control+k')
  await dlg.getByRole('textbox').fill('سفارش')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/admin\/collections\/orders/)
})

test('/admin 375: nav drawer traps Tab, Esc closes it and focus returns to the burger', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${DEMO}/admin`)
  await page.waitForLoadState('networkidle')
  await page.locator('.template-default__nav-toggler').focus()
  await page.keyboard.press('Enter')
  const nav = page.locator('aside.nav')
  await expect(nav).toHaveClass(/nav--nav-open/)
  const leaks: number[] = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const ok = await page.evaluate(() => Boolean(document.activeElement?.closest('aside.nav') || document.activeElement?.classList.contains('template-default__nav-toggler')))
    if (!ok) leaks.push(i)
  }
  expect(leaks, 'Tab presses that left the drawer').toEqual([])
  await page.keyboard.press('Escape')
  await expect(nav).not.toHaveClass(/nav--nav-open/)
  await expect(page.locator('.template-default__nav-toggler')).toBeFocused()
})
