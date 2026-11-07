import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { DEMO } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, type StaffUser } from './staff-helpers'
import { createConnectionUi, sql } from './wp-import-helpers'

// E-032 QA — layout of the import desk: 375 px (no horizontal scroll), desktop, light and dark, RTL, Persian digits
// and Jalali dates. Screenshots are written when E032_SCREENSHOTS is set (docs/agents/handoffs/E-032/qa-*.png).

const SHOTS = process.env.E032_SCREENSHOTS ? join(__dirname, '../../docs/agents/handoffs/E-032') : null
const BUNDLE = join(__dirname, '../../packages/integrations/src/wordpress/fixtures/sample-latest.edvora-bundle')

let admin: APIRequestContext
let importer: StaffUser
const pages: { name: string; path: string }[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright, browser }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
  importer = await createStaff(admin, 'demo', 'academy-admin', 'qa-layout')

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await staffLogin(page, DEMO, importer, '/staff/import')
  await page.waitForURL(`${DEMO}/staff/import`)
  // draft job with a visible connection (secret shown once on this very screen)
  const conn = await createConnectionUi(page, DEMO, 'اتصال آزمایشی چیدمان')
  pages.push({ name: 'secret', path: '/staff/import' })
  pages.push({ name: 'draft', path: `/staff/import/${conn.jobId}` })
  // an awaiting-confirm job from the committed fixture bundle (signed with the seeded demo-only connection)
  await page.goto(`${DEMO}/staff/import`)
  await page.locator('input[name="bundle"]').setInputFiles(BUNDLE)
  await page.getByRole('button', { name: 'بارگذاری و بررسی' }).click()
  await page.waitForURL(new RegExp('/staff/import/\\d+$'), { timeout: 60_000 })
  pages.push({ name: 'dry-run', path: new URL(page.url()).pathname })
  await ctx.close()

  const [done] = await sql<{ id: number }>("select id from import_jobs where tenant_id = (select id from tenants where slug = 'demo') and status = 'done' order by id desc limit 1")
  if (done) pages.push({ name: 'summary', path: `/staff/import/${done.id}` })
  const [rejected] = await sql<{ id: number }>("select id from import_jobs where tenant_id = (select id from tenants where slug = 'demo') and status = 'rejected' order by id desc limit 1")
  if (rejected) pages.push({ name: 'rejected', path: `/staff/import/${rejected.id}` })
  pages.unshift({ name: 'start', path: '/staff/import' })
})
test.afterAll(async () => {
  await admin?.dispose()
})

const viewports = [
  { label: '375', size: { width: 375, height: 812 } },
  { label: 'desktop', size: { width: 1280, height: 900 } },
] as const
const themes = ['light', 'dark'] as const

async function open(browser: Browser, size: { width: number; height: number }, theme: string) {
  const ctx = await browser.newContext({ viewport: size, locale: 'fa-IR', isMobile: size.width < 500, hasTouch: size.width < 500 })
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme)
  const page = await ctx.newPage()
  await staffLogin(page, DEMO, importer, '/staff/import')
  await page.waitForURL(`${DEMO}/staff/import`)
  return { ctx, page }
}

/** Latin digits outside code/URL/inputs would break "Persian digits in the UI" (AGENTS.md). */
async function latinDigitsInProse(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const skip = 'code, pre, input, textarea, select, option, [dir="ltr"], .font-latin, script, style, noscript, [data-testid="next-route-announcer"], nextjs-portal'
    const out: string[] = []
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!el || el.closest(skip)) continue
      // Pure numbers only: labels typed by the admin ("qa-1a2b", file names) are their own text.
      const m = (n.textContent ?? '').match(/(?<![\p{L}\d_-])[0-9][0-9.,:/-]*(?![\p{L}\d_-])/gu)
      if (m) out.push(...m.map((x) => `${x} ⟵ ${el.tagName.toLowerCase()}`))
    }
    return out
  })
}

for (const v of viewports) {
  for (const theme of themes) {
    test(`import desk at ${v.label}, ${theme}: no horizontal scroll, RTL, Persian digits, no serious a11y violations`, async ({ browser }) => {
      const { ctx, page } = await open(browser, v.size, theme)
      for (const p of pages) {
        await page.goto(`${DEMO}${p.path}`)
        await page.waitForLoadState('networkidle')
        expect(await page.evaluate(() => document.documentElement.dataset.theme), `${p.name} theme`).toBe(theme)
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).direction)).toBe('rtl')
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
        expect(scrollWidth, `${p.name}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth)
        // Wide tables scroll inside their own container, never the page.
        const wide = await page.evaluate(() => [...document.querySelectorAll('table')].filter((t) => t.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !t.closest('.overflow-x-auto')).length)
        expect(wide, `${p.name}: tables outside an overflow container`).toBe(0)
        expect(await latinDigitsInProse(page), `${p.name}: Latin digits in prose`).toEqual([])
        if (v.label === '375' || theme === 'dark') {
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['scrollable-region-focusable']).analyze() // QA-E032-05 has its own test below
          const bad = axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical').map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
          expect(bad, `${p.name} axe`).toEqual([])
        }
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `qa-${p.name}-${v.label}-${theme}.png`), fullPage: true })
      }
      await ctx.close()
    })
  }
}

test('dates are Jalali (Persian month names), never Gregorian digits', async ({ browser }) => {
  const { ctx, page } = await open(browser, { width: 1280, height: 900 }, 'light')
  await page.goto(`${DEMO}/staff/import`)
  const text = await page.locator('main').innerText()
  expect(text).toMatch(/اعتبار تا [۰-۹]{1,2} (فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند) [۰-۹]{4}/)
  expect(text).not.toMatch(/\b20\d\d[-/]\d\d[-/]\d\d\b/)
  await ctx.close()
})

test('QA-E032-05: horizontally scrollable tables can be reached by keyboard (tabindex on the scroll container)', async ({ browser }) => {
  // The counts table and the redirect preview scroll inside `.overflow-x-auto` boxes at 375 px; axe reports
  // "scrollable-region-focusable" (serious): a keyboard user cannot scroll them. Remove test.fail when fixed.
  test.fail(true, 'QA-E032-05')
  const { ctx, page } = await open(browser, { width: 375, height: 812 }, 'light')
  const dry = pages.find((p) => p.name === 'dry-run')!
  await page.goto(`${DEMO}${dry.path}`)
  const axe = await new AxeBuilder({ page }).withRules(['scrollable-region-focusable']).analyze()
  expect(axe.violations).toEqual([])
  await ctx.close()
}) 
