import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { DEMO, startCheckout } from './helpers'

export const repoRoot = path.resolve(__dirname, '..', '..')
export const COURSE = `${DEMO}/learn/demo-program`
export const QUIZ = 'آزمون جلسهٔ تحلیل بازار'

/** Phone OTP login for a user who may already exist (no name field then). */
export async function loginAny(page: Page, base: string, phone: string, next = '/dashboard'): Promise<void> {
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel('شماره موبایل').fill(phone)
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
  const devCode = page.locator('p', { hasText: 'حالت توسعه' }).locator('span')
  await expect(devCode).toHaveText(/^\d{5}$/)
  const code = (await devCode.textContent())?.trim() ?? ''
  await page.getByLabel('کد ورود').fill(code)
  const name = page.getByLabel(/نام و نام خانوادگی/)
  if (await name.count()) await name.fill('دانشجوی تست')
  await page.getByRole('button', { name: 'ورود', exact: true }).click()
  await page.waitForURL(`${base}${next}`)
}

/** Fresh student: log in, buy demo-program through the mock gateway (one payment). */
export async function enrolFresh(page: Page, phone: string): Promise<void> {
  await loginAny(page, DEMO, phone)
  await startCheckout(page, DEMO, 'demo-program')
  await page.getByRole('link', { name: 'پرداخت موفق' }).click()
  await page.waitForURL(`${DEMO}/payments/result?**`)
}

export const lessonRow = (page: Page, title: string) => page.locator('li[data-lesson-state]').filter({ has: page.getByText(title, { exact: true }) })

export async function openLesson(page: Page, title: string): Promise<void> {
  await page.goto(COURSE)
  await lessonRow(page, title).getByRole('link').click()
  await page.waitForURL(/\/learn\/demo-program\/\d+$/)
}

export async function dashboardNumbers(page: Page): Promise<{ xp: number; ring: number | null }> {
  await page.goto(`${DEMO}/dashboard`)
  await expect(page.getByTestId('dashboard')).toBeVisible()
  const xpEl = page.getByTestId('xp-total').first()
  const xp = (await xpEl.count()) ? Number(await xpEl.getAttribute('data-xp')) : 0
  const ringEl = page.getByTestId('course-ring').first()
  const ring = (await ringEl.count()) ? Number(await ringEl.getAttribute('data-ring-value')) : null
  return { xp, ring }
}

export function question(page: Page, text: string) {
  return page.locator('fieldset', { hasText: text })
}

export async function startQuiz(page: Page): Promise<void> {
  await page.goto(COURSE)
  await page.locator('a[href*="/quiz/"]', { hasText: QUIZ }).first().click()
  await page.waitForURL(/\/learn\/demo-program\/quiz\/\d+$/)
  await page.getByRole('button', { name: /^(شروع آزمون|شروع تلاش)/ }).click()
  await expect(page.getByRole('button', { name: 'ارسال پاسخ‌ها' })).toBeVisible()
}

/** Answers every question correctly (8 of 8) and submits. */
export async function passQuiz(page: Page): Promise<void> {
  await question(page, 'جزو چهار بخش').getByLabel('قیمت‌گذاری').check()
  await question(page, 'بازار هدف').getByLabel(/گروهی از مشتریان/).check()
  await question(page, 'عوامل بیرونی').getByLabel('فرصت‌ها').check()
  await question(page, 'عوامل بیرونی').getByLabel('تهدیدها').check()
  await question(page, 'جمع‌آوری داده').getByLabel('مصاحبه').check()
  await question(page, 'جمع‌آوری داده').getByLabel('پرسش‌نامه').check()
  await question(page, 'تحلیل رقبا').getByLabel('درست', { exact: true }).check()
  await question(page, 'فقط برای شرکت‌های بزرگ').getByLabel('نادرست', { exact: true }).check()
  await question(page, 'چند بخش دارد').getByLabel('پاسخ شما').fill('۴')
  await question(page, 'حرف S').getByLabel('پاسخ شما').fill('  strengths ')
  await expect(page.getByText('ذخیره شد')).toBeVisible()
  await page.getByRole('button', { name: 'ارسال پاسخ‌ها' }).click()
  await page.waitForURL(/\/quiz\/\d+\/attempt\/\d+$/)
}

/** Submits the quiz with every answer wrong or blank, except one wrong true/false. */
export async function failQuiz(page: Page): Promise<void> {
  await question(page, 'تحلیل رقبا').getByLabel('نادرست', { exact: true }).check()
  await expect(page.getByText('ذخیره شد')).toBeVisible()
  await page.getByRole('button', { name: 'ارسال پاسخ‌ها' }).click()
  await page.waitForURL(/\/quiz\/\d+\/attempt\/\d+$/)
}

/** Computed colours of every visible text-bearing element under `root` that equals the danger token. */
export async function dangerColoured(page: Page, rootSelector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--danger)'
    document.body.appendChild(probe)
    const danger = getComputedStyle(probe).color
    probe.remove()
    const root = document.querySelector(sel)
    if (!root) return ['root-missing']
    const hits: string[] = []
    for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())
      if (own && getComputedStyle(el).color === danger) hits.push(`${el.tagName.toLowerCase()}: ${(el.textContent ?? '').trim().slice(0, 40)}`)
    }
    return hits
  }, rootSelector)
}

/** Seed re-run (idempotent) — also resets the advisor's demo leads. */
export function reseed(): void {
  execFileSync('pnpm', ['seed'], { cwd: repoRoot, encoding: 'utf8', timeout: 240_000 })
}

/** One past-dated ledger row for a demo student (apps/web/src/seed/e2e-ledger.ts). */
export function ledgerEvent(phone: string, daysAgo: number, sourceId: string): void {
  execFileSync('pnpm', ['exec', 'tsx', '--env-file=.env', 'src/seed/e2e-ledger.ts', phone, String(daysAgo), 'lesson.completed', sourceId], {
    cwd: path.join(repoRoot, 'apps', 'web'),
    encoding: 'utf8',
    timeout: 180_000,
  })
}

export async function patchOk(api: APIRequestContext, url: string, data: unknown): Promise<void> {
  const res = await api.patch(url, { data })
  expect(res.ok(), `${url} ${await res.text()}`).toBeTruthy()
}

/**
 * A fresh student with real activity (quiz passed first try, two lessons marked): 40 XP, badges, a week in progress.
 * Fresh because the OTP endpoint is rate-limited per phone, so the seeded accounts cannot be logged into on every run.
 */
export async function activeStudent(page: Page, phone: string): Promise<void> {
  await enrolFresh(page, phone)
  await startQuiz(page)
  await passQuiz(page)
  for (const title of ['تحلیل بازار', 'منابع تکمیلی']) {
    await openLesson(page, title)
    await page.getByRole('button', { name: 'علامت‌گذاری به‌عنوان دیده‌شده' }).click()
    await expect(page.getByRole('button', { name: '✓ دیده شد' })).toBeDisabled()
  }
}
