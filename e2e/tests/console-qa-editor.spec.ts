import { expect, test } from '@playwright/test'
import { DEMO } from './helpers'
import { adminCreds, apiAs } from './staff-helpers'

// E-035 QA: the Lexical editor (E-031) still works and stays readable in the console palette, light and dark.
// Types into the editor but never saves.
for (const theme of ['light', 'dark'] as const) {
  test(`lexical editor in the lesson form works and is readable (${theme})`, async ({ browser, playwright }) => {
    const { email, password } = adminCreds()
    test.skip(!email || !password, 'SEED_ADMIN_* not available')
    const admin = await apiAs(playwright, DEMO, email, password)
    const lesson = ((await (await admin.get('/api/lessons?limit=1&depth=0')).json()) as { docs: { id: number }[] }).docs[0]!.id
    await admin.dispose()
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fa-IR' })
    await context.addCookies([{ name: 'payload-theme', value: theme, url: DEMO }])
    await context.addInitScript((t) => localStorage.setItem('theme', t), theme)
    expect((await context.request.post(`${DEMO}/api/users/login`, { data: { email, password } })).ok()).toBeTruthy()
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${DEMO}/admin/collections/lessons/${lesson}`)
    const editor = page.locator('.ContentEditable__root').first()
    await expect(editor).toBeVisible({ timeout: 30_000 })
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' متن آزمایشی QA')
    await editor.click({ clickCount: 3 })
    await page.locator('button.toolbar-popup__button-bold').first().click()
    await expect(editor.locator('strong.LexicalEditorTheme__textBold').first()).toBeVisible()
    // Toolbar exists with the block-type picker; the editor text keeps readable contrast against its own background.
    await expect(page.locator('.fixed-toolbar, .toolbar-popup, [class*="toolbar"]').first()).toBeVisible()
    const contrast = await editor.evaluate((el) => {
      const lum = (c: string) => {
        const m = c.match(/[\d.]+/g)!.map(Number)
        const [r, g, b] = m.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
      }
      let bg = el as HTMLElement | null
      let bgc = 'rgba(0, 0, 0, 0)'
      while (bg && /rgba\(0, 0, 0, 0\)|transparent/.test(bgc)) { bgc = getComputedStyle(bg).backgroundColor; bg = bg.parentElement }
      const fg = getComputedStyle(el).color
      const [a, b] = [lum(fg), lum(bgc)].sort((x, y) => y - x)
      return Math.round(((a! + 0.05) / (b! + 0.05)) * 100) / 100
    })
    expect(contrast, 'editor text contrast').toBeGreaterThanOrEqual(4.5)
    expect(errors, 'page errors').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
    await context.close()
  })
}
