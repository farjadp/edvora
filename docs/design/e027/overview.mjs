/** Dev-only: builds one contact sheet per option from the captured PNGs. Run after capture.mjs. */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(`${process.cwd()}/apps/web/package.json`)
const { chromium } = require('@playwright/test')
const OUT = resolve('docs/design/e027')
const screens = ['dashboard', 'dashboard-off', 'lesson', 'quiz', 'advisor']
const rows = [
  { label: 'desktop · light', vp: 'desktop', theme: 'light', h: 560, w: 560 },
  { label: 'desktop · dark', vp: 'desktop', theme: 'dark', h: 560, w: 560 },
  { label: 'mobile 375 · light', vp: 'mobile', theme: 'light', h: 560, w: 260 },
  { label: 'mobile 375 · dark', vp: 'mobile', theme: 'dark', h: 560, w: 260 },
]
const browser = await chromium.launch()
for (const option of ['seal', 'girih', 'block']) {
  const body = rows
    .map(
      (r) =>
        `<h2>${r.label}</h2><div class="row">${screens
          .map((s) => `<figure><img style="width:${r.w}px;height:${r.h}px" src="file://${OUT}/${option}-${s}-${r.vp}-${r.theme}.png"><figcaption>${s}</figcaption></figure>`)
          .join('')}</div>`,
    )
    .join('')
  const html = `<html><body style="margin:24px;font:14px sans-serif;background:#ddd"><h1>${option}</h1>${body}<style>.row{display:flex;gap:16px}img{object-fit:cover;object-position:top;display:block;background:#fff}figure{margin:0}</style></body></html>`
  writeFileSync(`${OUT}/.sheet.html`, html)
  const page = await browser.newPage({ viewport: { width: 2900, height: 800 } })
  await page.goto(`file://${OUT}/.sheet.html`)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/overview-${option}.png`, fullPage: true })
  await page.close()
}
await browser.close()
