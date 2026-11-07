import { expect, test, type APIRequestContext } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { DEMO, fakePhone } from './helpers'
import { COURSE, dangerColoured, dashboardNumbers, enrolFresh, failQuiz, ledgerEvent, loginAny, openLesson, passQuiz, patchOk, repoRoot, reseed, startQuiz } from './gamification-helpers'
import { adminCreds, apiAs, tenantId } from './staff-helpers'

/**
 * E-028 QA: XP/ring, quiz → badge, calm failure, streak across a simulated week, gamification OFF layout, advisor goal.
 * Demo tenant only. Fresh students per flow so the seeded accounts keep their history.
 */
test.describe.configure({ mode: 'serial' })

let admin: APIRequestContext
test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
})
test.afterAll(async () => {
  await admin?.dispose()
})

test.describe('1. lesson completion → XP and ring', () => {
  const phone = fakePhone()

  test('manual mark alone: progress moves, XP does not; quiz pass + mark pays the lesson once', async ({ page }) => {
    test.setTimeout(240_000)
    await enrolFresh(page, phone)
    const start = await dashboardNumbers(page)
    expect(start.xp).toBe(0)

    // Route used: required-quiz outcome (demo lessons have no video). Lesson 5 has no quiz: mark only.
    await openLesson(page, 'منابع تکمیلی')
    await page.getByRole('button', { name: 'علامت‌گذاری به‌عنوان دیده‌شده' }).click()
    await expect(page.getByRole('button', { name: '✓ دیده شد' })).toBeDisabled()
    const afterMark = await dashboardNumbers(page)
    expect(afterMark.xp, 'manual mark must not pay XP').toBe(0)
    expect(afterMark.ring ?? 0).toBeGreaterThan(start.ring ?? 0)

    // Quiz first-try pass: 20 base + score bonus (full marks → 30).
    await startQuiz(page)
    await passQuiz(page)
    const result = page.getByTestId('quiz-result')
    await expect(result).toHaveAttribute('data-state', 'passed')
    await expect(result).toContainText('قبول شدید')
    await expect(page.getByTestId('quiz-xp')).toBeVisible()
    const afterQuiz = await dashboardNumbers(page)
    expect(afterQuiz.xp).toBe(30)

    // Mark the quiz lesson: confirmed by the passed quiz → +10 once.
    await openLesson(page, 'تحلیل بازار')
    await page.getByRole('button', { name: 'علامت‌گذاری به‌عنوان دیده‌شده' }).click()
    await expect(page.getByRole('button', { name: '✓ دیده شد' })).toBeDisabled()
    const afterLesson = await dashboardNumbers(page)
    expect(afterLesson.xp).toBe(40)
    expect(afterLesson.ring ?? 0).toBeGreaterThan(afterMark.ring ?? 0)

    // Reload / second visit: still 40, level and first-lesson/analyst badges present.
    const again = await dashboardNumbers(page)
    expect(again.xp).toBe(40)
    await page.getByText('همهٔ نشان‌ها').click()
    await expect(page.locator('[data-testid=badge-list] li[data-badge="first-step"]')).toHaveCount(1)
    await expect(page.locator('[data-testid=badge-list] li[data-badge="analyst"]')).toHaveCount(1)
  })
})

test.describe('1b. real player beacon (generated 62 s video, lesson 1 set to 1 minute)', () => {
  const phone = fakePhone()
  const video = path.join(repoRoot, 'test-results', 'gamification-lesson.webm')
  let lessonId = 0
  let original: { durationMinutes: number | null; videoUrl: string | null } | null = null

  test.beforeAll(() => {
    mkdirSync(path.dirname(video), { recursive: true })
    if (!existsSync(video)) {
      try {
        execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5', '-t', '62', '-c:v', 'libvpx', '-b:v', '40k', video], { stdio: 'ignore' })
      } catch {
        // no ffmpeg → skipped below
      }
    }
  })

  test.afterAll(async () => {
    if (lessonId && original) await patchOk(admin, `/api/lessons/${lessonId}`, original)
  })

  test('playing to the end completes the lesson and pays 10 XP once', async ({ page }) => {
    test.skip(!existsSync(video), 'ffmpeg not available to generate a test video')
    test.setTimeout(240_000)
    const tid = await tenantId(admin, 'demo')
    const found = await admin.get(`/api/lessons?where[and][0][tenant][equals]=${tid}&where[and][1][order][equals]=1&limit=1&depth=0`)
    const doc = ((await found.json()) as { docs: { id: number; durationMinutes: number | null; videoUrl: string | null }[] }).docs[0]!
    lessonId = doc.id
    original = { durationMinutes: doc.durationMinutes, videoUrl: doc.videoUrl ?? null }
    await patchOk(admin, `/api/lessons/${lessonId}`, { durationMinutes: 1, videoUrl: `${DEMO}/e2e-lesson.webm` })

    const bytes = readFileSync(video)
    await page.route('**/e2e-lesson.webm', async (route) => {
      const range = route.request().headers()['range']
      const m = range ? /bytes=(\d+)-(\d*)/.exec(range) : null
      if (m) {
        const from = Number(m[1])
        const to = m[2] ? Number(m[2]) : bytes.length - 1
        await route.fulfill({ status: 206, body: bytes.subarray(from, to + 1), headers: { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-range': `bytes ${from}-${to}/${bytes.length}` } })
      } else {
        await route.fulfill({ status: 200, body: bytes, headers: { 'content-type': 'video/webm', 'accept-ranges': 'bytes' } })
      }
    })

    await enrolFresh(page, phone)
    await openLesson(page, 'معرفی دوره')
    await expect(page.getByTestId('lesson-status')).toHaveAttribute('data-state', 'open')
    await page.getByTestId('lesson-video').evaluate(async (v: HTMLVideoElement) => {
      v.muted = true
      await v.play()
    })
    await expect(page.getByTestId('lesson-status')).toHaveAttribute('data-state', 'just-completed', { timeout: 100_000 })
    await expect(page.getByTestId('xp-chip')).toContainText('۱۰')
    expect((await dashboardNumbers(page)).xp).toBe(10)
    await openLesson(page, 'معرفی دوره')
    await expect(page.getByTestId('lesson-status')).toHaveAttribute('data-state', 'completed')
    await expect(page.getByTestId('xp-chip')).toHaveCount(0)
    expect((await dashboardNumbers(page)).xp).toBe(10)
  })
})

test.describe('2. failed attempt is calm; retake pass pays a flat 10', () => {
  const phone = fakePhone()
  test('not-yet state, no XP, no danger colour; then the pass', async ({ page }) => {
    test.setTimeout(240_000)
    await enrolFresh(page, phone)
    await startQuiz(page)
    await failQuiz(page)
    const result = page.getByTestId('quiz-result')
    await expect(result).toHaveAttribute('data-state', 'not-yet')
    await expect(result).toContainText('هنوز به حد نصاب نرسیده‌اید')
    await expect(page.getByTestId('quiz-xp')).toHaveCount(0)
    await expect(result).not.toContainText('مردود')
    expect(await dangerColoured(page, 'main')).toEqual([])
    expect((await dashboardNumbers(page)).xp).toBe(0)

    await startQuiz(page)
    await passQuiz(page)
    await expect(page.getByTestId('quiz-result')).toHaveAttribute('data-state', 'passed')
    expect((await dashboardNumbers(page)).xp).toBe(10)
  })
})

test.describe('3. streak across a simulated week', () => {
  const phone = fakePhone()
  test('met / missed / met weeks show on the weekly rhythm', async ({ page }) => {
    test.setTimeout(420_000)
    await enrolFresh(page, phone)

    // Weeks start Saturday 00:00 Tehran (UTC+3:30, no DST). Work out three whole weeks back from now.
    const TEHRAN = 3.5 * 3600_000
    const DAY = 86400_000
    const nowT = Date.now() + TEHRAN
    const dow = new Date(nowT).getUTCDay() // 0 Sun … 6 Sat
    const sinceSat = (dow + 1) % 7
    const thisWeekStart = Math.floor(nowT / DAY) * DAY - sinceSat * DAY // Tehran-local ms
    const toReal = (tehranMs: number) => tehranMs - TEHRAN
    const w3 = thisWeekStart - 21 * DAY
    // Backdate the enrolment to one hour into week -3 so those weeks count.
    const res = await admin.get(`/api/enrollments?where[user][exists]=true&where[course][exists]=true&sort=-createdAt&limit=1&depth=0`)
    const enrol = ((await res.json()) as { docs: { id: number; user: number }[] }).docs[0]!
    await patchOk(admin, `/api/enrollments/${enrol.id}`, { enrolledAt: new Date(toReal(w3 + 3600_000)).toISOString() })

    const daysAgoAt = (tehranMs: number) => (Date.now() - toReal(tehranMs)) / DAY
    // week -3: Sat + Sun noon (met); week -2: Sat only (missed, no freeze yet); week -1: Sat + Mon (met).
    const plan: [number, string][] = [
      [w3 + 12 * 3600_000, 'a1'], [w3 + DAY + 12 * 3600_000, 'a2'],
      [w3 + 7 * DAY + 12 * 3600_000, 'b1'],
      [w3 + 14 * DAY + 12 * 3600_000, 'c1'], [w3 + 16 * DAY + 12 * 3600_000, 'c2'],
    ]
    for (const [t, id] of plan) ledgerEvent(phone, daysAgoAt(t), `qa-${id}`)

    await page.goto(`${DEMO}/dashboard`)
    const states = await page.locator('[data-testid=week-rhythm] li[data-week-state]').evaluateAll((els) => els.map((e) => e.getAttribute('data-week-state')))
    expect(states.slice(-4)).toEqual(['met', 'missed', 'met', 'in_progress'])
    await expect(page.getByTestId('streak-weeks')).toContainText('۱ هفتهٔ پیاپی')
    // 5 lesson rows × 10 + 2 met weeks × 25 weekly bonus
    expect((await dashboardNumbers(page)).xp).toBe(100)
  })
})

test.describe('4. gamification OFF layout', () => {
  let tid = 0
  let originalGroup: Record<string, unknown> = {}
  test.afterAll(async () => {
    if (tid) await patchOk(admin, `/api/tenants/${tid}`, { gamification: originalGroup })
  })

  test('master switch off: plain layout, no XP/streak/badge UI; on again restores history', async ({ page }) => {
    test.setTimeout(120_000)
    tid = await tenantId(admin, 'demo')
    const t = (await (await admin.get(`/api/tenants/${tid}?depth=0`)).json()) as { gamification: Record<string, unknown> }
    originalGroup = t.gamification
    await loginAny(page, DEMO, '09129990002')
    await page.goto(`${DEMO}/dashboard`)
    const on = page.getByTestId('dashboard')
    await expect(on).toHaveAttribute('data-layout', 'seal')
    const xpBefore = Number(await page.getByTestId('xp-total').first().getAttribute('data-xp'))
    expect(xpBefore).toBeGreaterThan(0)

    await patchOk(admin, `/api/tenants/${tid}`, { gamification: { ...originalGroup, enabled: false } })
    await page.goto(`${DEMO}/dashboard`)
    const off = page.getByTestId('dashboard')
    await expect(off).toHaveAttribute('data-layout', 'plain')
    await expect(off).toHaveAttribute('data-gamification', 'off')
    for (const id of ['xp-total', 'level', 'badge-list', 'badges-empty', 'week-rhythm', 'week-section', 'streak-weeks', 'celebration']) {
      await expect(page.getByTestId(id), id).toHaveCount(0)
    }
    await expect(page.getByTestId('course-ring').first()).toBeVisible() // progress and path remain
    await expect(page.getByTestId('certificate-path-section').first()).toBeVisible()
    const text = await page.getByTestId('dashboard').innerText()
    expect(text).not.toMatch(/امتیاز|هفتهٔ پیاپی|نشان/)
    // Lesson page also drops the XP chip area
    await page.goto(COURSE)
    await expect(page.getByText('امتیاز', { exact: false })).toHaveCount(0)

    await patchOk(admin, `/api/tenants/${tid}`, { gamification: originalGroup })
    await page.goto(`${DEMO}/dashboard`)
    await expect(page.getByTestId('dashboard')).toHaveAttribute('data-layout', 'seal')
    expect(Number(await page.getByTestId('xp-total').first().getAttribute('data-xp'))).toBe(xpBefore)
  })
})

test.describe('5. advisor daily goal moves only on a recorded outcome', () => {
  test.beforeAll(() => reseed())

  test('moving the date does not count; an outcome chip does', async ({ page, playwright }) => {
    test.setTimeout(180_000)
    const password = process.env.SEED_DEMO_STAFF_PASSWORD ?? readEnv('SEED_DEMO_STAFF_PASSWORD')
    test.skip(!password, 'SEED_DEMO_STAFF_PASSWORD not set')
    const advisor = { email: 'advisor@demo.edvora.local', password: password! }
    await page.goto(`${DEMO}/staff/login?next=${encodeURIComponent('/staff/leads')}`)
    await page.getByLabel('ایمیل').fill(advisor.email)
    await page.getByLabel('رمز عبور').fill(advisor.password)
    await page.getByRole('button', { name: 'ورود', exact: true }).click()
    await page.waitForURL(`${DEMO}/staff/leads`)

    const count = async () => (await page.getByTestId('goal-count').innerText()).replace(/\s+/g, ' ')
    await expect(page.getByTestId('leads-desk')).toBeVisible()
    const before = await count()
    expect(before).toMatch(/^۲ از ۳/)
    const target = page.locator('[data-testid=lead-row][data-due]:not([data-done]) [data-testid=outcome-chips]').first()
    const leadId = await target.getAttribute('data-lead')
    expect(leadId).toBeTruthy()

    // Date-only edit through the API as the advisor (the same call /admin makes): still due, still not done.
    const api = await apiAs(playwright, DEMO, advisor.email, advisor.password)
    const upd = await api.patch(`/api/leads/${leadId}`, { data: { nextFollowUpAt: new Date(Date.now() - 10 * 60_000).toISOString() } })
    expect(upd.ok(), await upd.text()).toBeTruthy()
    await api.dispose()
    await page.reload()
    expect(await count()).toBe(before)
    await expect(page.locator(`[data-testid=lead-row][data-lead="${leadId}"]`)).not.toHaveAttribute('data-done', /.+/)

    await page.locator(`[data-testid=outcome-chips][data-lead="${leadId}"] button[data-outcome="reached"]`).click()
    await expect(page.locator(`[data-testid=lead-row][data-lead="${leadId}"]`)).toHaveAttribute('data-done', 'reached')
    expect(await count()).toMatch(/^۳ از ۳/)
    await expect(page.getByTestId('goal-complete')).toBeVisible()
  })
})

function readEnv(key: string): string | undefined {
  try {
    const line = readFileSync(path.join(repoRoot, 'apps/web/.env'), 'utf8').split('\n').find((l) => l.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}
