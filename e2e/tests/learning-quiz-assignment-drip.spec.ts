import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { DEMO, IBA, fakePhone, login, startCheckout } from './helpers'

/**
 * E-026 on the demo tenant: drip locks, a required quiz that unlocks the next lesson, an assignment with a private
 * file, grading by the seeded demo instructor (Payload local API, access control on), and the certificate gate.
 * Needs a fresh `pnpm seed` (demo-program lessons, quiz, assignment, demo instructor).
 */
test.describe.configure({ mode: 'serial' })

const COURSE = `${DEMO}/learn/demo-program`
const QUIZ = 'آزمون جلسهٔ تحلیل بازار'
const ASSIGNMENT = 'تکلیف: تحلیل SWOT یک کسب‌وکار'
const repoRoot = path.resolve(__dirname, '..', '..')

const lessonRow = (page: Page, title: string) => page.locator('li[data-lesson-state]').filter({ has: page.getByText(title, { exact: true }) })
const question = (page: Page, text: string) => page.locator('fieldset', { hasText: text })

/** Smallest well-formed PDF (header, one empty page, xref, trailer, %%EOF) — Payload checks the structure. */
function minimalPdf(): Buffer {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>']
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

function gradeAsInstructor(phone: string, score: string, feedback: string): { score: number; status: string } {
  const out = execFileSync('pnpm', ['exec', 'tsx', '--env-file=.env', 'src/seed/e2e-grade.ts', phone, score, feedback], {
    cwd: path.join(repoRoot, 'apps', 'web'),
    encoding: 'utf8',
    timeout: 120_000,
  })
  const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop()
  if (!line) throw new Error(`grading script printed no result:\n${out}`)
  return JSON.parse(line) as { score: number; status: string }
}

test.describe('demo tenant: drip, quiz, assignment, grading, certificate gate', () => {
  const phone = fakePhone()

  test('student journey', async ({ page, playwright }) => {
    test.setTimeout(240_000)

    await test.step('log in and enrol (mock gateway, one payment)', async () => {
      await login(page, DEMO, phone)
      await startCheckout(page, DEMO, 'demo-program')
      await page.getByRole('link', { name: 'پرداخت موفق' }).click()
      await page.waitForURL(`${DEMO}/payments/result?**`)
    })

    await test.step('outline: locked lessons show when they open, certificate is blocked', async () => {
      await page.goto(COURSE)
      await expect(page.getByRole('heading', { name: 'دوره نمونه مدیریت' })).toBeVisible()
      const dated = lessonRow(page, 'جمع‌بندی و پروژهٔ نهایی')
      await expect(dated).toHaveAttribute('data-lesson-state', 'locked')
      await expect(dated).toContainText(/باز می‌شود [۰-۹]{1,2} [آ-ی]+ [۰-۹]{4}/)
      const afterPrevious = lessonRow(page, 'طراحی پروژه')
      await expect(afterPrevious).toHaveAttribute('data-lesson-state', 'locked')
      await expect(afterPrevious).toContainText(`پس از تکمیل جلسهٔ «تحلیل بازار» و قبولی در «${QUIZ}»`)
      await expect(lessonRow(page, 'منابع تکمیلی')).toHaveAttribute('data-lesson-state', 'open')
      const cert = page.getByTestId('certificate-status')
      await expect(cert).toContainText('گواهی هنوز آماده نیست')
      await expect(cert).toContainText('آزمون الزامی قبول نشده')
      await expect(cert).toContainText('تکلیف الزامی هنوز قبول نشده')
    })

    await test.step('a locked lesson URL shows the unlock date and no content', async () => {
      const href = await lessonRow(page, 'جمع‌بندی و پروژهٔ نهایی').getByRole('link').getAttribute('href')
      await page.goto(`${DEMO}${href}`)
      await expect(page.getByTestId('lesson-locked')).toContainText('باز می‌شود')
      await expect(page.getByText('یادداشت نمونه جلسه.')).toHaveCount(0)
      await expect(page.locator('video')).toHaveCount(0)
    })

    await test.step('lesson content is not readable through the public API', async () => {
      const api = await playwright.request.newContext({ baseURL: DEMO })
      const res = await api.get('/api/lessons?limit=50&depth=0')
      expect(res.ok()).toBe(true)
      const body = (await res.json()) as { docs: Record<string, unknown>[] }
      expect(body.docs.length).toBeGreaterThan(0)
      for (const doc of body.docs) {
        expect(doc).not.toHaveProperty('notes')
        expect(doc).not.toHaveProperty('videoUrl')
        // Payload returns a denied array field as [] — no rows, no titles, no files.
        expect(doc.resources ?? []).toEqual([])
      }
      await api.dispose()
    })

    await test.step('take the required quiz and pass (Persian digits in a short answer)', async () => {
      await page.goto(COURSE)
      await page.locator('a[href*="/quiz/"]', { hasText: QUIZ }).first().click()
      await page.waitForURL(/\/learn\/demo-program\/quiz\/\d+$/)
      await expect(page.getByTestId('attempts-left')).toHaveText('۳')
      await page.getByRole('button', { name: 'شروع آزمون' }).click()
      await expect(page.getByRole('button', { name: 'ارسال پاسخ‌ها' })).toBeVisible()
      await expect(page.getByRole('timer')).toBeVisible()
      // The page never carries correct answers before submit (Q7).
      expect(await page.content()).not.toMatch(/isCorrect|acceptedAnswers|correctOptionIds|Strengths/)

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
      await page.waitForURL(/\/quiz\/\d+\/attempt\/1$/)
      const result = page.getByTestId('quiz-result')
      await expect(result).toContainText('قبول شدید')
      await expect(result).toContainText('نمره: ۸ از ۸')
      // Review "full after pass": correct answers are shown now.
      await expect(page.getByText('پاسخ درست').first()).toBeVisible()
    })

    await test.step('retake is not offered after passing', async () => {
      await page.getByRole('link', { name: QUIZ }).click()
      await expect(page.getByTestId('quiz-counted')).toContainText('این آزمون را قبول شده‌اید')
      await expect(page.getByRole('button', { name: /شروع/ })).toHaveCount(0)
    })

    await test.step('complete the quiz lesson → the "after previous" lesson unlocks', async () => {
      await page.goto(COURSE)
      await lessonRow(page, 'تحلیل بازار').getByRole('link').click()
      await page.getByRole('button', { name: 'علامت‌گذاری به‌عنوان دیده‌شده' }).click()
      await expect(page.getByRole('button', { name: '✓ دیده شد' })).toBeDisabled()
      await page.goto(COURSE)
      await expect(lessonRow(page, 'طراحی پروژه')).toHaveAttribute('data-lesson-state', 'open')
      await expect(lessonRow(page, 'جمع‌بندی و پروژهٔ نهایی')).toHaveAttribute('data-lesson-state', 'locked')
      await expect(page.locator('[data-requirement="quiz"]')).toHaveAttribute('data-state', 'done')
    })

    let fileHref = ''
    await test.step('submit the assignment: a disguised file is refused, text is kept; then a PDF is accepted', async () => {
      await page.locator('a[href*="/assignment/"]', { hasText: ASSIGNMENT }).first().click()
      await page.waitForURL(/\/assignment\/\d+$/)
      await expect(page.getByTestId('submission-status')).toContainText('هنوز تحویل نداده‌اید')
      const answer = 'قوت: تیم باتجربه. ضعف: بودجهٔ کم. فرصت: بازار در حال رشد. تهدید: رقبای بزرگ.'
      await page.getByLabel('متن پاسخ').fill(answer)
      await page.locator('input[type="file"]').setInputFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ this is not a pdf') })
      await page.getByRole('button', { name: 'تحویل تکلیف' }).click()
      await expect(page.locator('form [role="alert"]')).toContainText('نوع فایل')
      await expect(page.getByLabel('متن پاسخ')).toHaveValue(answer)

      await page.locator('input[type="file"]').setInputFiles({ name: 'swot.pdf', mimeType: 'application/pdf', buffer: minimalPdf() })
      await page.getByRole('button', { name: 'تحویل تکلیف' }).click()
      await page.waitForURL(/\/assignment\/\d+\?saved=1$/)
      await expect(page.getByTestId('submission-status')).toContainText('در انتظار نمره')
      fileHref = (await page.getByRole('link', { name: 'فایل ۱' }).getAttribute('href')) ?? ''
      expect(fileHref).toMatch(/^\/files\/submissions\/\d+$/)
    })

    await test.step('the private file: owner downloads it, nobody else does', async () => {
      const own = await page.request.get(`${DEMO}${fileHref}`)
      expect(own.status()).toBe(200)
      expect(own.headers()['cache-control']).toContain('no-store')
      expect(own.headers()['content-disposition']).toMatch(/^attachment; filename="submission-\d+\.pdf"$/)
      expect((await own.body()).subarray(0, 5).toString()).toBe('%PDF-')

      const anon = await playwright.request.newContext({ baseURL: DEMO })
      expect((await anon.get(fileHref)).status()).toBe(401)
      // Payload's own upload URL never serves these files.
      const payloadUrl = await anon.get('/api/submission-files/file/anything.pdf')
      expect([401, 403, 404]).toContain(payloadUrl.status())
      await anon.dispose()

      // Another academy's host: the student's session is not valid there.
      const other = await playwright.request.newContext({ baseURL: IBA })
      expect([401, 404]).toContain((await other.get(fileHref)).status())
      await other.dispose()
    })

    await test.step('the demo instructor grades it (۱۸٫۵) with feedback', async () => {
      const graded = gradeAsInstructor(phone, '۱۸٫۵', 'تحلیل خوبی بود؛ تهدیدها را دقیق‌تر بنویسید.')
      expect(graded).toMatchObject({ score: 18.5, status: 'graded' })
    })

    await test.step('student sees grade and feedback; certificate no longer waits on quiz/assignment', async () => {
      await page.reload()
      const status = page.getByTestId('submission-status')
      await expect(status).toContainText('نمره: ۱۸٫۵ از ۲۰')
      await expect(status).toContainText('قبول')
      await expect(page.getByTestId('submission-feedback')).toHaveText('تحلیل خوبی بود؛ تهدیدها را دقیق‌تر بنویسید.')
      await expect(page.getByRole('button', { name: /تحویل/ })).toHaveCount(0)

      await page.goto(COURSE)
      const cert = page.getByTestId('certificate-status')
      await expect(cert).toContainText('گواهی هنوز آماده نیست')
      await expect(cert).toContainText('همهٔ جلسات تکمیل نشده‌اند')
      await expect(cert).not.toContainText('آزمون الزامی')
      await expect(cert).not.toContainText('تکلیف الزامی')
      await expect(page.locator('[data-requirement="assignment"]')).toHaveAttribute('data-state', 'done')
    })
  })
})

test('anonymous visitors cannot open the course outline or a quiz', async ({ page }) => {
  await page.goto(COURSE)
  await page.waitForURL(`${DEMO}/login?**`)
  await page.goto(`${COURSE}/quiz/1`)
  await page.waitForURL(`${DEMO}/login?**`)
})
