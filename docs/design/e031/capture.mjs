/**
 * Dev-only: captures Payload /admin (login, dashboard, Courses list, a Course form) for E-031.
 * Run from the repo root with the dev server up:
 *   PREFIX=before BASE=http://localhost:3310 node --env-file=apps/web/.env docs/design/e031/capture.mjs
 * Needs SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (local dev seed). TENANT=<id> selects the academy (payload-tenant cookie).
 * Reduced motion is emulated. 375px width is checked for horizontal overflow.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(`${process.cwd()}/apps/web/package.json`)
const { chromium } = require('@playwright/test')

const BASE = process.env.BASE ?? 'http://localhost:3310'
const PREFIX = process.env.PREFIX ?? 'after'
const TENANT = process.env.TENANT
const SUFFIX = process.env.SUFFIX ?? ''
const OUT = 'docs/design/e031'
const viewports = { mobile: { width: 375, height: 812 }, desktop: { width: 1440, height: 900 } }
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const report = []

async function newCtx(vp, theme) {
  const ctx = await browser.newContext({ viewport: viewports[vp], reducedMotion: 'reduce', locale: 'fa-IR' })
  await ctx.addCookies([{ name: 'payload-theme', value: theme, url: BASE }])
  return ctx
}

async function settle(page, name, vp) {
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  report.push({ name, overflow })
}

for (const vp of Object.keys(viewports)) {
  for (const theme of ['light', 'dark']) {
    const tag = `${PREFIX}-%s-${vp}-${theme}${SUFFIX}`
    // Login (logged out)
    let ctx = await newCtx(vp, theme)
    let page = await ctx.newPage()
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle', timeout: 240_000 })
    await settle(page, tag.replace('%s', 'login'), vp)
    await page.fill('input[name=email], #field-email', process.env.SEED_ADMIN_EMAIL)
    await page.fill('input[name=password], #field-password', process.env.SEED_ADMIN_PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 120_000 })
    // Set after login: the login page clears the academy cookie.
    if (TENANT) await ctx.addCookies([{ name: 'payload-tenant', value: TENANT, url: BASE }])
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 240_000 })
    await settle(page, tag.replace('%s', 'dashboard'), vp)
    await page.goto(`${BASE}/admin/collections/courses`, { waitUntil: 'networkidle', timeout: 240_000 })
    await settle(page, tag.replace('%s', 'list'), vp)
    const href = await page.locator('table tbody tr a').first().getAttribute('href')
    await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle', timeout: 240_000 })
    await settle(page, tag.replace('%s', 'edit'), vp)
    await ctx.close()
  }
}
await browser.close()
console.table(report)
if (report.some((r) => r.name.includes('mobile') && r.overflow > 0)) console.log('WARNING: horizontal overflow at 375px')
