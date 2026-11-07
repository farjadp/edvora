/**
 * Dev-only: screenshots of the BUILT E-034 logins (option B · Seal card) into docs/design/e034/built/.
 * Run from the repo root with the dev server up (mock SMS provider):  BASE=http://localhost:3340 node docs/design/e034/built/capture.mjs
 * Pages × desktop 1440 / mobile 375 × light / dark. Reduced motion is emulated so the seal shows its final state.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(`${process.cwd()}/apps/web/package.json`)
const { chromium } = require('@playwright/test')

const BASE = process.env.BASE ?? 'http://localhost:3340'
const OUT = 'docs/design/e034/built'
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 375, height: 812 } }
const themes = ['light', 'dark']

/** Each state: a path and an optional interaction that brings the page into that state. */
const states = [
  { id: 'student-phone', path: '/login' },
  {
    id: 'student-phone-error',
    path: '/login',
    act: async (p) => {
      await p.locator('input[name="phone"]').fill('0912')
      await p.locator('form button[type="submit"]').first().click()
      await p.getByRole('alert').first().waitFor()
    },
  },
  {
    id: 'student-code',
    path: '/login',
    act: async (p) => {
      // A fresh fake number per run so the 60 s resend guard never blocks the capture.
      const n = `0912${String(Date.now()).slice(-7)}`
      await p.locator('input[name="phone"]').fill(n)
      await p.locator('form button[type="submit"]').first().click()
      await p.locator('input[name="code"]').waitFor()
    },
  },
  { id: 'staff-login', path: '/staff/login' },
  {
    id: 'staff-wrong',
    path: '/staff/login',
    act: async (p) => {
      await p.locator('input[name="email"]').fill('nobody@example.com')
      await p.locator('input[name="password"]').fill('wrong-password-123')
      await p.locator('form button[type="submit"]').first().click()
      await p.getByRole('alert').first().waitFor()
    },
  },
  { id: 'admin-login', path: '/admin/login' },
  {
    id: 'admin-wrong',
    path: '/admin/login',
    act: async (p) => {
      await p.locator('#field-email').fill('nobody@example.com')
      await p.locator('#field-password').fill('wrong-password-123')
      await p.locator('button[type="submit"]').first().click()
      await p.locator('.toast-error, .Toastify__toast--error, [data-sonner-toast]').first().waitFor({ timeout: 15_000 })
    },
  },
]

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const report = []
const host = new URL(BASE).hostname

for (const s of states)
  for (const [vp, size] of Object.entries(viewports))
    for (const theme of themes) {
      const ctx = await browser.newContext({ viewport: size, colorScheme: theme, reducedMotion: 'reduce', locale: 'fa-IR' })
      await ctx.addCookies([{ name: 'payload-theme', value: theme, domain: host, path: '/' }])
      await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme)
      const page = await ctx.newPage()
      await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle', timeout: 240_000 })
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
      if (s.act) await s.act(page)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const name = `${s.id}-${vp}-${theme}.png`
      await page.screenshot({ path: `${OUT}/${name}`, fullPage: vp === 'mobile' })
      report.push({ name, overflow })
      await ctx.close()
    }

await browser.close()
console.table(report)
