import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { DEMO } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, tenantId, type StaffUser } from './staff-helpers'

/**
 * E-046 (ADR 018): the staff AI assistant with the MOCK provider (the seed switches it on for demo; no key, no
 * network). Chat streams, a PDF upload is cited, a proposed action runs only after confirm and is audited, and
 * people without permission are refused. Demo academy only. Screenshots go to test-results/ai-assistant/.
 */
const shots = join(__dirname, '../../test-results/ai-assistant')
const shot = (page: Page, name: string) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: false })

let admin: APIRequestContext
let demo: number

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
  demo = await tenantId(admin, 'demo')
})

test.afterAll(async () => {
  await admin?.dispose()
})

/** A custom role in demo plus a user holding only that role. */
async function userWithRole(label: string, permissions: string[]): Promise<StaffUser> {
  const role = await admin.post('/api/roles', { data: { tenant: demo, name: `E2E ${label}`, key: `e2e-${label}-${randomBytes(3).toString('hex')}`, permissions } })
  expect(role.ok(), `create role ${await role.text()}`).toBeTruthy()
  const roleId = ((await role.json()) as { doc: { id: number } }).doc.id
  const user = await createStaff(admin, 'demo', null, label)
  const m = await admin.post('/api/memberships', { data: { tenant: demo, user: user.id, roles: [roleId], status: 'active' } })
  expect(m.ok(), `create membership ${await m.text()}`).toBeTruthy()
  return user
}

const launcher = (page: Page) => page.getByTestId('ai-launcher')

async function openDrawer(page: Page) {
  await launcher(page).click()
  const drawer = page.getByRole('dialog', { name: 'دستیار هوشمند' })
  await expect(drawer).toBeVisible()
  return drawer
}

async function ask(page: Page, scope: ReturnType<Page['getByRole']>, text: string) {
  await scope.getByLabel('پیام به دستیار').fill(text)
  await scope.getByRole('button', { name: 'بفرست' }).click()
  // Streaming done: the send button is back.
  await expect(scope.getByRole('button', { name: 'بفرست' })).toBeVisible({ timeout: 60_000 })
}

test.describe.serial('AI assistant (mock provider)', () => {
  let manager: StaffUser

  test.beforeAll(async () => {
    manager = await createStaff(admin, 'demo', 'academy-admin', 'ai-admin')
  })

  test('chat streams an answer in the drawer and the conversation is saved', async ({ page }) => {
    await staffLogin(page, DEMO, manager, '/staff')
    await expect(page).toHaveURL(/\/staff/)
    const drawer = await openDrawer(page)
    await ask(page, drawer, 'سلام، امروز چه کارهایی می‌توانی برایم انجام بدهی؟')
    await expect(drawer.locator('[data-role="assistant"]').last()).toContainText('ارائه‌دهندهٔ آزمایشی')
    await expect(drawer).toContainText('بازیابی، نه آموزش مدل')
    // Identity: the default name on the launcher, in the header and in every answer's mark.
    await expect(drawer.getByRole('heading', { level: 2 })).toContainText('دانا')
    await expect(drawer.locator('[data-role="assistant"] .ai-mark')).toHaveCount(1)
    await shot(page, '01-drawer-chat')

    await page.goto(`${DEMO}/staff/assistant`)
    await expect(page.getByRole('heading', { name: 'دستیار هوشمند', level: 1 })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'گفت‌وگوهای ذخیره‌شده' })).toContainText('سلام، امروز چه کارهایی')
    await page.getByLabel('جست‌وجو در گفت‌وگوها').fill('امروز')
    await page.getByLabel('جست‌وجو در گفت‌وگوها').press('Enter')
    await expect(page.getByRole('complementary', { name: 'گفت‌وگوهای ذخیره‌شده' })).toContainText('سلام، امروز چه کارهایی')
    // The section has its own chat, so no floating button there.
    await expect(launcher(page)).toHaveCount(0)

    // Same drawer in /admin.
    // (Ctrl+J: in dev mode Next's issues badge covers the bottom corner where the button sits.)
    await page.goto(`${DEMO}/admin`)
    await expect(launcher(page)).toBeAttached()
    await expect(launcher(page)).toContainText('دانا')
    await page.keyboard.press('Control+j')
    const adminDrawer = page.getByRole('dialog', { name: 'دستیار هوشمند' })
    await expect(adminDrawer).toBeVisible()
    await ask(page, adminDrawer, 'What can you do here?')
    await expect(adminDrawer.locator('[data-role="assistant"]').last()).toContainText('ارائه‌دهندهٔ آزمایشی')
    await shot(page, '07-admin-drawer')
  })

  test('upload a PDF, then the answer cites it', async ({ page }) => {
    const title = `E2E refund rules ${randomBytes(3).toString('hex')}`
    await staffLogin(page, DEMO, manager, '/staff/assistant/documents')
    await expect(page).toHaveURL(/\/staff\/assistant\/documents/)
    await page.getByLabel(/^فایل/).setInputFiles(join(__dirname, '../fixtures/ai-refund-policy.pdf'))
    await page.getByLabel('عنوان (اختیاری)').fill(title)
    await page.getByRole('button', { name: 'بارگذاری و نمایه‌سازی' }).click()
    await expect(page.getByText(/در .* بخش نمایه شد/)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('cell', { name: new RegExp(title) })).toBeVisible({ timeout: 15_000 })
    await shot(page, '02-documents')

    await page.goto(`${DEMO}/staff/assistant`)
    const panel = page.getByRole('region', { name: 'دستیار هوشمند' })
    await ask(page, panel, `${title}: what is the refund policy for tuition?`)
    const answer = panel.locator('[data-role="assistant"]').last()
    await expect(answer).toContainText('refundable within 14 days')
    await expect(answer).toContainText('[1]')
    await expect(answer.locator('.ai-sources')).toContainText(title)
    await shot(page, '03-cited-answer')
  })

  test('a proposed coupon is created only after confirm, as the user, and audited', async ({ page }) => {
    const code = `E2EAI${randomBytes(3).toString('hex').toUpperCase()}`
    await staffLogin(page, DEMO, manager, '/staff')
    const drawer = await openDrawer(page)
    await ask(page, drawer, `یک کد تخفیف ${code} با ۱۵ درصد بساز`)
    const card = drawer.getByRole('group', { name: /پیشنهاد: ساختن کد تخفیف/ })
    await expect(card).toContainText(code)
    await expect(card).toContainText('۱۵٪')

    // Nothing exists before confirm.
    const before = await admin.get(`/api/coupons?where[and][0][tenant][equals]=${demo}&where[and][1][code][equals]=${code}&depth=0`)
    expect(((await before.json()) as { docs: unknown[] }).docs).toHaveLength(0)
    await shot(page, '04-proposal')

    await card.getByRole('button', { name: 'تأیید و انجام' }).click()
    await expect(drawer.getByRole('group', { name: /انجام شد: ساختن کد تخفیف/ })).toBeVisible()
    await shot(page, '05-confirmed')

    const after = await admin.get(`/api/coupons?where[and][0][tenant][equals]=${demo}&where[and][1][code][equals]=${code}&depth=0`)
    const docs = ((await after.json()) as { docs: { id: number; value: number; kind: string }[] }).docs
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ value: 15, kind: 'percent' })

    const audit = await admin.get(`/api/audit-logs?where[and][0][tenant][equals]=${demo}&where[and][1][docId][equals]=${docs[0]!.id}&where[and][2][targetCollection][equals]=coupons&depth=0&limit=10`)
    const actions = ((await audit.json()) as { docs: { action: string; actor: number }[] }).docs.map((d) => d.action)
    expect(actions).toEqual(expect.arrayContaining(['coupons.create', 'ai.action.confirmed']))
  })

  test('without permission: no assistant, no tools, no confirming someone else’s proposal', async ({ page, playwright }) => {
    // Advisor template: no ai.use → API refused, no drawer, section answers 403.
    const advisor = await createStaff(admin, 'demo', 'advisor', 'ai-none')
    const api = await apiAs(playwright, DEMO, advisor.email, advisor.password)
    expect((await api.post('/api/ai/chat', { data: { message: 'سلام' } })).status()).toBe(403)
    await api.dispose()
    await staffLogin(page, DEMO, advisor, '/staff/leads')
    await expect(page).toHaveURL(/\/staff\/leads/)
    await expect(launcher(page)).toHaveCount(0)
    const res = await page.goto(`${DEMO}/staff/assistant`)
    expect(res?.status()).toBe(403)

    // ai.use without coupons.manage: the coupon tool is not offered, so no proposal appears.
    const reader = await userWithRole('ai-reader', ['ai.use', 'courses.view'])
    const r = await apiAs(playwright, DEMO, reader.email, reader.password)
    const body = await (await r.post('/api/ai/chat', { data: { message: 'یک کد تخفیف NOPE10 با ۱۰ درصد بساز' } })).text()
    expect(body).not.toContain('"t":"proposal"')

    // Someone else's pending proposal cannot be confirmed by the reader.
    const m = await apiAs(playwright, DEMO, manager.email, manager.password)
    const stream = await (await m.post('/api/ai/chat', { data: { message: `یک کد تخفیف E2EX${randomBytes(2).toString('hex').toUpperCase()} با ۵ درصد بساز` } })).text()
    const proposal = stream
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { t: string; proposal?: { id: number } })
      .find((e) => e.t === 'proposal')?.proposal
    expect(proposal).toBeTruthy()
    const refused = await r.post(`/api/ai/actions/${proposal!.id}`, { data: { decision: 'confirm' } })
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { message: string }).message).toContain('فقط کسی که این کار را خواسته')
    // …and it is still pending for its owner, who rejects it.
    const rejected = await m.post(`/api/ai/actions/${proposal!.id}`, { data: { decision: 'reject' } })
    expect(((await rejected.json()) as { status: string }).status).toBe('rejected')
    await r.dispose()
    await m.dispose()
  })

  test('settings: the key is write-only, the test connection works, and the academy can rename the assistant', async ({ page, playwright }) => {
    await staffLogin(page, DEMO, manager, '/staff/assistant/settings')
    await expect(page).toHaveURL(/\/staff\/assistant\/settings/)
    await expect(page.getByLabel(/کلید API/)).toHaveValue('')

    // Rename: the new name follows the assistant everywhere, then back to the default.
    const rename = async (name: string) => {
      await page.getByLabel('نام دستیار').fill(name)
      await page.getByRole('button', { name: 'ذخیرهٔ تنظیمات' }).click()
      await expect(page.getByText('تنظیمات دستیار ذخیره شد.')).toBeVisible()
      await page.waitForLoadState('load')
      await expect(page.getByRole('heading', { level: 1 })).toContainText(name || 'دانا', { timeout: 15_000 })
    }
    await rename('هم‌یار')
    await page.goto(`${DEMO}/staff`)
    await expect(launcher(page)).toContainText('هم‌یار')
    await page.goto(`${DEMO}/staff/assistant/settings`)
    await rename('')

    await page.getByRole('button', { name: 'آزمایش اتصال' }).click()
    await expect(page.getByText(/اتصال آزمایشی برقرار است/)).toBeVisible({ timeout: 30_000 })
    await shot(page, '06-settings')
    // No API returns the settings' sealed key, even to a manager.
    const m = await apiAs(playwright, DEMO, manager.email, manager.password)
    const raw = await (await m.get(`/api/ai-settings?where[tenant][equals]=${demo}&depth=0`)).text()
    expect(raw).not.toContain('apiKeySealed')
    await m.dispose()
  })
})
