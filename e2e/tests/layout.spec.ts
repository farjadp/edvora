import { expect, test } from '@playwright/test'
import { DEMO, IBA } from './helpers'

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

const pages = [
  { tenant: 'demo', url: `${DEMO}/` },
  { tenant: 'demo', url: `${DEMO}/courses/demo-program` },
  { tenant: 'iba', url: `${IBA}/` },
  { tenant: 'iba', url: `${IBA}/courses/brand-mba` },
]

for (const p of pages) {
  test(`no horizontal overflow at 375px — ${p.tenant} ${new URL(p.url).pathname}`, async ({ page }) => {
    const res = await page.goto(p.url)
    expect(res?.status()).toBe(200)
    await page.waitForLoadState('networkidle')
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth, `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth)
  })
}
