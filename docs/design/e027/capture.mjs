/**
 * Dev-only: captures the E-027 preview (3 options x 5 screens x mobile/desktop x light/dark) into docs/design/e027/.
 * Run from the repo root with the dev server up:  BASE=http://localhost:3270 node docs/design/e027/capture.mjs
 * Reduced motion is emulated so every screenshot shows the final state of each animation.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(`${process.cwd()}/apps/web/package.json`)
const { chromium } = require('@playwright/test')

const BASE = process.env.BASE ?? 'http://localhost:3270'
const OUT = 'docs/design/e027'
const options = ['seal', 'girih', 'block']
const screens = ['dashboard', 'dashboard-off', 'lesson', 'quiz', 'advisor']
const viewports = { mobile: { width: 375, height: 812 }, desktop: { width: 1440, height: 900 } }
const themes = ['light', 'dark']
const only = process.env.ONLY // e.g. "seal/dashboard"

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const report = []

async function shot({ option, screen, vp, theme, brand }) {
  const ctx = await browser.newContext({ viewport: viewports[vp], reducedMotion: 'reduce', locale: 'fa-IR' })
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme)
  const page = await ctx.newPage()
  const q = `chrome=0${brand ? `&brand=${brand}` : ''}`
  await page.goto(`${BASE}/design-preview/e027/${option}/${screen}?${q}`, { waitUntil: 'networkidle', timeout: 240_000 })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const name = `${option}-${screen}${brand ? `-${brand}` : ''}-${vp}-${theme}.png`
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: true })
  report.push({ name, overflow })
  await ctx.close()
}

for (const option of options)
  for (const screen of screens)
    for (const vp of Object.keys(viewports))
      for (const theme of themes) {
        if (only && only !== `${option}/${screen}`) continue
        await shot({ option, screen, vp, theme })
      }
// Other tenant colour: dashboard + quiz in teal and wine, desktop light.
if (!only) for (const option of options) for (const brand of ['teal', 'wine']) await shot({ option, screen: 'dashboard', vp: 'desktop', theme: 'light', brand })

await browser.close()
console.table(report.filter((r) => r.overflow !== 0))
console.log(`${report.length} screenshots, overflow issues: ${report.filter((r) => r.overflow !== 0).length}`)
