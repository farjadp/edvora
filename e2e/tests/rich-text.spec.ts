import { expect, test, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { DEMO, IBA, fakePhone, login, startCheckout } from './helpers'

/**
 * E-031 QA: the shared rich-text renderer on every public/learn surface, tenant-scoped, RTL, no horizontal overflow.
 * Content comes from `src/seed/e2e-richtext.ts` (Payload local API, demo tenant) so the test is deterministic.
 * Needs a fresh `pnpm seed`.
 */
test.describe.configure({ mode: 'serial' })

const repoRoot = path.resolve(__dirname, '..', '..')
const COURSE = `${DEMO}/learn/demo-program`
const QUIZ = 'آزمون جلسهٔ تحلیل بازار'
const ASSIGNMENT = 'تکلیف: تحلیل SWOT یک کسب‌وکار'

function runHelper(...args: string[]): void {
  execFileSync('pnpm', ['exec', 'tsx', '--env-file=.env', 'src/seed/e2e-richtext.ts', ...args], { cwd: path.join(repoRoot, 'apps', 'web'), encoding: 'utf8', timeout: 120_000 })
}

const question = (page: Page, text: string) => page.locator('fieldset', { hasText: text })

/** The known document from the helper, rendered inside `scope`. */
async function expectRich(scope: Locator, marker: string) {
  await expect(scope.getByRole('heading', { level: 2, name: new RegExp(marker) })).toBeVisible()
  await expect(scope.getByRole('heading', { level: 3, name: 'زیرسرفصل' })).toBeVisible()
  await expect(scope.locator('strong', { hasText: 'پررنگ' })).toBeVisible()
  await expect(scope.locator('em', { hasText: 'کج' })).toBeVisible()
  await expect(scope.locator('ul > li', { hasText: 'مورد نقطه‌ای' })).toBeVisible()
  // Numbered lists use Persian numerals (CSS counter style), not Latin digits.
  const ol = scope.locator('ol:has(> li:text-is("گام یکم"))')
  await expect(ol.locator('li')).toHaveCount(2)
  await expect(ol).toHaveCSS('list-style-type', 'persian')
  const checks = scope.getByRole('checkbox')
  await expect(checks).toHaveCount(2)
  await expect(checks.nth(0)).toHaveAttribute('aria-checked', 'true')
  await expect(checks.nth(1)).toHaveAttribute('aria-checked', 'false')
  const external = scope.getByRole('link', { name: 'لینک بیرونی' })
  await expect(external).toHaveAttribute('href', 'https://example.com/fa')
  await expect(external).toHaveAttribute('rel', /noopener/)
  // Internal links are tenant-relative.
  await expect(scope.getByRole('link', { name: 'لینک دوره' })).toHaveAttribute('href', '/courses/demo-program')
  const table = scope.locator('table')
  await expect(table.locator('th')).toHaveCount(2)
  await expect(table.locator('td')).toHaveCount(2)
  await expect(table).toContainText('۲۰۰')
  await expect(scope.getByRole('img', { name: 'نمونه تصویر demo' })).toBeVisible()
}

async function noHorizontalOverflow(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  expect(sw).toBe(cw)
}

test.beforeAll(() => {
  runHelper()
})

test('public pages render the rich text (manifesto, syllabus, FAQ), tenant-scoped', async ({ page }) => {
  await page.goto(DEMO)
  await expectRich(page.locator('main'), 'مانیفست')
  await page.goto(`${DEMO}/courses/demo-program`)
  await page.locator('details').evaluateAll((all) => all.forEach((d) => d.setAttribute('open', '')))
  await expectRich(page.locator('#syllabus'), 'سرفصل‌درس')
  await expectRich(page.locator('#faq'), 'پاسخ')
  // Another academy never shows the demo academy's content.
  await page.goto(IBA)
  await expect(page.getByText('مانیفست سرفصل')).toHaveCount(0)
  for (const url of [DEMO, `${DEMO}/courses/demo-program`]) {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(url)
    await noHorizontalOverflow(page)
  }
})

test('learn pages render lesson notes, quiz, explanation, assignment and feedback (as a student)', async ({ page }) => {
  test.setTimeout(240_000)
  const phone = fakePhone()
  await login(page, DEMO, phone)
  await startCheckout(page, DEMO, 'demo-program')
  await page.getByRole('link', { name: 'پرداخت موفق' }).click()
  await page.waitForURL(`${DEMO}/payments/result?**`)

  await page.goto(COURSE)
  await page.locator('li[data-lesson-state]').filter({ has: page.getByText('منابع تکمیلی', { exact: true }) }).getByRole('link').click()
  await expectRich(page.locator('main'), 'یادداشت')
  await noHorizontalOverflow(page)

  await page.goto(COURSE)
  await page.locator('a[href*="/quiz/"]', { hasText: QUIZ }).first().click()
  await expectRich(page.locator('main'), 'توضیح‌آزمون')
  await page.getByRole('button', { name: 'شروع آزمون' }).click()
  await question(page, 'جزو چهار بخش').getByLabel('قیمت‌گذاری').check()
  await question(page, 'بازار هدف').getByLabel(/گروهی از مشتریان/).check()
  await question(page, 'عوامل بیرونی').getByLabel('فرصت‌ها').check()
  await question(page, 'عوامل بیرونی').getByLabel('تهدیدها').check()
  await question(page, 'جمع‌آوری داده').getByLabel('مصاحبه').check()
  await question(page, 'جمع‌آوری داده').getByLabel('پرسش‌نامه').check()
  await question(page, 'تحلیل رقبا').getByLabel('درست', { exact: true }).check()
  await question(page, 'فقط برای شرکت‌های بزرگ').getByLabel('نادرست', { exact: true }).check()
  await question(page, 'چند بخش دارد').getByLabel('پاسخ شما').fill('۴')
  await question(page, 'حرف S').getByLabel('پاسخ شما').fill('strengths')
  await expect(page.getByText('ذخیره شد')).toBeVisible()
  await page.getByRole('button', { name: 'ارسال پاسخ‌ها' }).click()
  await page.waitForURL(/\/quiz\/\d+\/attempt\/1$/)
  await expectRich(question(page, 'جزو چهار بخش').or(page.locator('li, section, article').filter({ hasText: 'توضیح‌پاسخ' })).first(), 'توضیح‌پاسخ')
  await noHorizontalOverflow(page)

  await page.goto(COURSE)
  await page.locator('a[href*="/assignment/"]', { hasText: ASSIGNMENT }).first().click()
  await expectRich(page.locator('main'), 'توضیح‌تکلیف')
  await page.getByLabel('متن پاسخ').fill('پاسخ آزمایشی')
  await page.getByRole('button', { name: 'تحویل تکلیف' }).click()
  await page.waitForURL(/\/assignment\/\d+\?saved=1$/)
  runHelper(phone)
  await page.reload()
  await expectRich(page.getByTestId('submission-feedback'), 'بازخورد')
  await noHorizontalOverflow(page)
  await page.setViewportSize({ width: 375, height: 800 })
  await page.reload()
  await noHorizontalOverflow(page)
})
