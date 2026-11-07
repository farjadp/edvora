/**
 * Dev-only: captures the E-028 screens into docs/design/e028/ (before-* or after-*).
 * From the repo root with the dev server on :3028:  PREFIX=before node docs/design/e028/capture.mjs
 * Needs SEED_DEMO_STAFF_PASSWORD in the environment. Reduced motion is emulated so animations show their final state.
 * ONLY=dashboard,certificate narrows the screens; EXTRA_SLUG overrides nothing. Throwaway; not part of the app.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(`${process.cwd()}/apps/web/package.json`)
const { chromium } = require('@playwright/test')

const PORT = process.env.PORT ?? '3028'
const BASE = `http://demo.localhost:${PORT}`
const OUT = 'docs/design/e028'
const PREFIX = process.env.PREFIX ?? 'after'
const STUDENT = process.env.STUDENT_PHONE ?? '09129990002'
const STAFF_PW = process.env.SEED_DEMO_STAFF_PASSWORD
const STAFF = process.env.STAFF_EMAIL ?? 'advisor@demo.edvora.local'
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 375, height: 812 } }
const themes = ['light', 'dark']
const screens = [
  { name: 'dashboard', who: 'student', path: '/dashboard' },
  { name: 'lesson', who: 'student', path: '/learn/demo-program/9' },
  { name: 'quiz', who: 'student', path: '/learn/demo-program/quiz/1/attempt/1' },
  { name: 'staff', who: 'staff', path: '/staff/leads' },
  ...(process.env.EXTRA ? JSON.parse(process.env.EXTRA) : []),
].filter((s) => !only.length || only.includes(s.name))

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const report = []

async function studentState() {
  const ctx = await browser.newContext({ viewport: viewports.desktop, locale: 'fa-IR' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 240_000 })
  await page.fill('input[name=phone]', STUDENT)
  await page.click('button:has-text("دریافت کد ورود")')
  await page.waitForSelector('input[name=code]')
  const txt = await page.locator('p:has-text("حالت توسعه")').innerText()
  const code = (txt.match(/\d{5,8}/) ?? [])[0]
  await page.fill('input[name=code]', code)
  await page.click('button:has-text("ورود"):not(:has-text("دریافت"))')
  await page.waitForURL('**/dashboard', { timeout: 120_000 })
  const state = await ctx.storageState()
  await ctx.close()
  return state
}
async function staffState() {
  const ctx = await browser.newContext({ viewport: viewports.desktop, locale: 'fa-IR' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/staff/login`, { waitUntil: 'networkidle', timeout: 240_000 })
  await page.fill('input[name=email]', STAFF)
  await page.fill('input[name=password]', STAFF_PW)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 120_000 })
  const state = await ctx.storageState()
  await ctx.close()
  return state
}

const states = {}
if (screens.some((s) => s.who === 'student')) states.student = await studentState()
if (screens.some((s) => s.who === 'staff')) states.staff = await staffState()

for (const s of screens)
  for (const vp of Object.keys(viewports))
    for (const theme of themes) {
      const ctx = await browser.newContext({ viewport: viewports[vp], reducedMotion: 'reduce', locale: 'fa-IR', storageState: states[s.who] })
      await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme)
      const page = await ctx.newPage()
      await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle', timeout: 240_000 })
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const name = `${PREFIX}-${s.name}-${vp}-${theme}.png`
      await page.screenshot({ path: `${OUT}/${name}`, fullPage: true })
      report.push({ name, overflow, url: page.url().replace(BASE, '') })
      await ctx.close()
    }
await browser.close()
console.table(report)
