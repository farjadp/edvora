/**
 * Dev-only: captures the E-034 login previews into docs/design/e034/.
 * Run from the repo root with the dev server up:  BASE=http://localhost:3340 node docs/design/e034/capture.mjs
 * Steps (env ONLY=shots|contact|axe|all, default all). Reduced motion is emulated, timers are frozen (?live=0).
 * Outputs: <option>-<screen>[-<brand>]-<desktop|mobile>-<light|dark>.png, contact-<option>.png, side-by-side.png, report.json
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

const require = createRequire(`${process.cwd()}/apps/web/package.json`)
const { chromium } = require('@playwright/test')
const { AxeBuilder } = require('@axe-core/playwright')

const BASE = process.env.BASE ?? 'http://localhost:3340'
const OUT = 'docs/design/e034'
const ONLY = process.env.ONLY ?? 'all'
const options = ['a', 'b', 'c']
const KEY = ['s-phone', 's-code', 's-locked', 's-suspended', 't-empty', 't-wrong', 't-locked', 't-2fa', 'a-skin', 'tenant-unknown']
const ALL = [
  's-phone', 's-phone-error', 's-submitting', 's-code', 's-code-new', 's-code-wrong', 's-code-expired', 's-locked', 's-ratelimit', 's-suspended', 's-session',
  't-empty', 't-validation', 't-wrong', 't-phone-hint', 't-suspended', 't-locked', 't-submitting', 't-expired', 't-out', 't-2fa', 't-2fa-wrong', 't-2fa-locked', 't-enrol',
  'a-skin', 'a-error', 'a-suspended', 'a-moved', 'forgot', 'tenant-unknown', 'maintenance', 'error-server', 'error-network',
]
const viewports = { mobile: { width: 375, height: 812 }, desktop: { width: 1440, height: 900 } }
const themes = ['light', 'dark']

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const report = { shots: [], axe: [] }

function url(option, screen, brand) {
  return `${BASE}/design-preview/e034/${option}/${screen}?chrome=0&live=0${brand ? `&brand=${brand}` : ''}`
}

async function open(option, screen, { vp, theme, brand }) {
  const ctx = await browser.newContext({ viewport: viewports[vp], reducedMotion: 'reduce', locale: 'fa-IR' })
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme)
  const page = await ctx.newPage()
  await page.goto(url(option, screen, brand), { waitUntil: 'networkidle', timeout: 240_000 })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  return { ctx, page }
}

async function shot(option, screen, { vp, theme, brand }) {
  const { ctx, page } = await open(option, screen, { vp, theme, brand })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const name = `${option}-${screen}${brand ? `-${brand}` : ''}-${vp}-${theme}.png`
  // Viewport shot at 1440x900 / 375x812; taller pages are captured in full so nothing is cut.
  await page.screenshot({ path: `${OUT}/${name}`, fullPage: true })
  report.shots.push({ name, overflow })
  await ctx.close()
}

if (ONLY === 'all' || ONLY === 'shots') {
  for (const option of options)
    for (const screen of KEY)
      for (const vp of Object.keys(viewports))
        for (const theme of themes) await shot(option, screen, { vp, theme })
  for (const option of options) for (const brand of ['teal', 'wine']) for (const screen of ['s-phone', 't-empty']) await shot(option, screen, { vp: 'desktop', theme: 'light', brand })
}

// Contact sheets: every state of an option, small, in one image (built with an HTML grid of screenshots).
if (ONLY === 'all' || ONLY === 'contact') {
  for (const option of options) {
    const tiles = []
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', locale: 'fa-IR' })
    const page = await ctx.newPage()
    for (const screen of ALL) {
      await page.goto(url(option, screen), { waitUntil: 'networkidle', timeout: 240_000 })
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(150)
      const buf = await page.screenshot({ fullPage: false })
      tiles.push({ screen, src: `data:image/png;base64,${buf.toString('base64')}` })
    }
    await ctx.close()
    const html = `<html dir="ltr"><body style="margin:0;background:#d8d6cf;font:600 22px sans-serif">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px;padding:24px;width:3000px">
      ${tiles.map((t) => `<figure style="margin:0"><img src="${t.src}" style="width:100%;border:1px solid #999;display:block"/><figcaption style="padding:6px 2px;direction:ltr">${option.toUpperCase()} / ${t.screen}</figcaption></figure>`).join('')}
      </div></body></html>`
    const sheet = await browser.newPage({ viewport: { width: 3048, height: 1000 } })
    await sheet.setContent(html)
    await sheet.screenshot({ path: `${OUT}/contact-${option}.png`, fullPage: true })
    await sheet.close()
  }
}

// Side by side: S1 + T1 desktop light for A | B | C.
if (ONLY === 'all' || ONLY === 'side') {
  const imgs = {}
  for (const screen of ['s-phone', 't-empty'])
    for (const option of options) {
      const { ctx, page } = await open(option, screen, { vp: 'desktop', theme: 'light' })
      imgs[`${option}-${screen}`] = (await page.screenshot()).toString('base64')
      await ctx.close()
    }
  const row = (screen) => options.map((o) => `<figure style="margin:0"><img style="width:100%;display:block;border:1px solid #999" src="data:image/png;base64,${imgs[`${o}-${screen}`]}"/><figcaption style="padding:6px;font:600 20px sans-serif;direction:ltr">${o.toUpperCase()} / ${screen}</figcaption></figure>`).join('')
  const html = `<html><body style="margin:0;background:#d8d6cf"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:20px;width:2800px">${row('s-phone')}${row('t-empty')}</div></body></html>`
  const sheet = await browser.newPage({ viewport: { width: 2840, height: 1000 } })
  await sheet.setContent(html)
  await sheet.screenshot({ path: `${OUT}/side-by-side.png`, fullPage: true })
  await sheet.close()
}

// axe on S1 and T1, each option, light + dark, desktop and mobile.
if (ONLY === 'all' || ONLY === 'axe') {
  for (const option of options)
    for (const screen of ['s-phone', 't-empty'])
      for (const theme of themes)
        for (const vp of ['desktop', 'mobile']) {
          const { ctx, page } = await open(option, screen, { vp, theme })
          const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze()
          const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
          report.axe.push({ option, screen, theme, vp, violations: res.violations.map((v) => `${v.impact}:${v.id}(${v.nodes.length})`), serious: serious.length })
          for (const v of res.violations) console.log(option, screen, theme, vp, v.impact, v.id, v.nodes.slice(0, 2).map((n) => n.html.slice(0, 120)))
          await ctx.close()
        }
}

await browser.close()
if (report.shots.length) console.table(report.shots.filter((r) => r.overflow !== 0))
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1))
console.log(`${report.shots.length} screenshots, overflow issues: ${report.shots.filter((r) => r.overflow !== 0).length}`)
if (report.axe.length) console.table(report.axe)
