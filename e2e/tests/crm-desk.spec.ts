import { randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { toPersianDigits } from '../../packages/core/src/digits'
import { formatJalali } from '../../packages/core/src/jalali'
import { DEMO } from './helpers'
import { adminCreds, staffLogin, tenantId, type StaffUser } from './staff-helpers'

/**
 * E-015 advisor CRM desk (/staff/leads). Demo academy, mock providers. Users, memberships and leads are created per
 * run through the REST API as the seeded super admin (unique names and phones; passwords only in memory).
 *   1. pool → claim → log a call with a Jalali follow-up → the follow-up shows on the lead and in the queue.
 *   2. ownRecordsOnly: no pool tab, pool view closed, pool lead page 404.
 *   3. sales manager: team tab, assign to an advisor; the advisor then sees it as theirs.
 *   4. mark lost needs a reason; the reason is stored.
 *   5. another academy's lead is a 404 from the demo desk.
 */

type Doc = { id: number; [k: string]: unknown }

const suffix = randomBytes(3).toString('hex')
const pw = () => `pw-${randomBytes(12).toString('hex')}`
const phone = () => `0912888${String(randomBytes(2).readUInt16BE(0) % 10_000).padStart(4, '0')}`

let admin: APIRequestContext
const ref = {} as { demo: number; iba: number; roles: Record<string, number>; course: number }
const cast = {} as Record<'advisor' | 'advisorOwn' | 'manager', StaffUser>

async function ok<T = Doc>(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<T> {
  expect(res.ok(), `${what}: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}
const docs = async (path: string) => (await ok<{ docs: Doc[] }>(await admin.get(path), path)).docs

async function staffUser(key: string, role: string, ownRecordsOnly = false): Promise<StaffUser> {
  const u = { email: `e2e-crm-${key}-${suffix}@example.test`, password: pw(), name: `تست میز مشاور ${key}` }
  const created = await ok<{ doc: Doc }>(await admin.post('/api/users', { data: { ...u, roles: ['student'], tenants: [{ tenant: ref.demo }] } }), `user ${key}`)
  await ok(await admin.post('/api/memberships', { data: { tenant: ref.demo, user: created.doc.id, roles: [ref.roles[role]], status: 'active', scope: { courses: [], cohorts: [], ownRecordsOnly } } }), `membership ${key}`)
  return { id: created.doc.id, ...u }
}

/** A lead with no advisor (an empty advisor defaults to the creator, so it is cleared afterwards). */
async function poolLead(name: string, tenant = ref.demo): Promise<number> {
  const created = await ok<{ doc: Doc }>(await admin.post('/api/leads', { data: { tenant, name, phone: phone(), status: 'new', ...(tenant === ref.demo ? { course: ref.course } : {}) } }), 'lead')
  await ok(await admin.patch(`/api/leads/${created.doc.id}`, { data: { advisor: null } }), 'clear advisor')
  return created.doc.id
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(180_000)
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set')
  admin = await playwright.request.newContext({ baseURL: DEMO })
  await ok(await admin.post('/api/users/login', { data: { email, password } }), 'super admin login')
  ref.demo = await tenantId(admin, 'demo')
  ref.iba = await tenantId(admin, 'iba')
  ref.roles = Object.fromEntries((await docs(`/api/roles?where[tenant][equals]=${ref.demo}&limit=100&depth=0`)).map((r) => [r.key as string, r.id]))
  ref.course = (await docs(`/api/courses?where[and][0][tenant][equals]=${ref.demo}&where[and][1][slug][equals]=demo-program&limit=1&depth=0`))[0]!.id
  cast.advisor = await staffUser('advisor', 'advisor')
  cast.advisorOwn = await staffUser('own', 'advisor', true)
  cast.manager = await staffUser('manager', 'sales-manager')
})

test.afterAll(async () => {
  await admin?.dispose()
})

test('pool → claim → log call with a Jalali follow-up → the follow-up appears', async ({ page }) => {
  const name = `سرنخ صف ${suffix}`
  const leadId = await poolLead(name)

  await staffLogin(page, DEMO, cast.advisor, '/staff/leads?v=pool')
  await page.waitForURL(/\/staff\/leads\?v=pool/)
  await expect(page.getByTestId('crm-tab-pool')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('kpi-conversion')).toBeVisible()
  const row = page.getByTestId('crm-list').locator('tr', { hasText: name })
  await expect(row).toBeVisible()

  // Claim: the lead becomes mine and opens at the call log.
  await row.getByTestId('claim-lead').click()
  await page.waitForURL(new RegExp(`/staff/leads/${leadId}`))
  const lead = page.getByTestId('lead-page')
  await expect(lead).toHaveAttribute('data-lead', String(leadId))
  await expect(page.getByTestId('call-link')).toHaveAttribute('href', /^tel:09128/)

  // Log a call: outcome, note, status new → contacted, next follow-up on the Jalali picker (default: tomorrow 10:00 Tehran).
  const form = page.getByTestId('call-log-form')
  await form.locator('label', { has: page.locator('input[data-outcome="reached"]') }).click()
  await form.getByLabel('یادداشت تماس').fill('برای دورهٔ پاییز تماس دوباره خواست.')
  await form.getByLabel('وضعیت سرنخ').selectOption('contacted')
  const picker = page.getByTestId('jalali-picker')
  await picker.locator('select[data-part="minute"]').selectOption('30')
  const day = await picker.locator('select[data-part="day"]').inputValue()
  const month = await picker.locator('select[data-part="month"] option:checked').innerText()
  await form.getByTestId('call-log-submit').click()
  await expect(page.getByTestId('call-log-message')).toHaveText('تماس ثبت شد.')
  await expect(lead).toHaveAttribute('data-status', 'contacted')

  // Stored as UTC, shown in Jalali: tomorrow 10:30 Tehran.
  const stored = (await ok<Doc>(await admin.get(`/api/leads/${leadId}?depth=0`), 'lead')) as Doc & { phone: string; nextFollowUpAt: string; advisor: number; followUps: { outcome: string; note: string }[] }
  expect(stored.advisor).toBe(cast.advisor.id)
  expect(formatJalali(stored.nextFollowUpAt, 'HH:mm')).toBe('۱۰:۳۰')
  expect(formatJalali(stored.nextFollowUpAt, 'd MMMM')).toBe(`${toPersianDigits(day)} ${month}`)
  expect(stored.followUps.at(-1)).toMatchObject({ outcome: 'reached', note: 'برای دورهٔ پاییز تماس دوباره خواست.' })
  await expect(page.getByTestId('lead-next')).toContainText(`${month}`)
  await expect(page.getByTestId('lead-next')).toContainText('۱۰:۳۰')

  // Timeline: claim, call and status change are there.
  const timeline = page.getByTestId('lead-timeline')
  await expect(timeline.locator('li[data-kind="call"]')).toContainText('صحبت شد')
  await expect(timeline.locator('li[data-kind="status"]')).toContainText('تماس گرفته شد')
  await expect(timeline.locator('li[data-kind="owner"]', { hasText: `${cast.advisor.name} این سرنخ را برداشت` })).toBeVisible()

  // The queue (all open leads) shows it handled today; the next follow-up is no longer due today.
  await page.goto(`${DEMO}/staff/leads?f=all`)
  const queued = page.locator(`[data-testid=lead-row][data-lead="${leadId}"]`)
  await expect(queued).toHaveAttribute('data-due', 'later')
  await expect(queued).toHaveAttribute('data-done', 'reached')
  // «سرنخ‌های من», found by a Persian-digit phone search, lists the new follow-up date and time.
  const digits = toPersianDigits(String(stored.phone ?? '').slice(-4))
  await page.goto(`${DEMO}/staff/leads?v=mine&q=${encodeURIComponent(digits)}`)
  const mine = page.getByTestId('crm-list').locator('tr', { hasText: name })
  await expect(mine).toContainText(`${toPersianDigits(day)} ${month} · ۱۰:۳۰`)

  // Audit: the claim and the call are on record as this advisor.
  const audit = await docs(`/api/audit-logs?where[and][0][targetCollection][equals]=leads&where[and][1][docId][equals]=${leadId}&where[and][2][actor][equals]=${cast.advisor.id}&limit=20&depth=0`)
  expect(audit.length).toBeGreaterThanOrEqual(2)
})

test('ownRecordsOnly advisor sees no pool and cannot open a pool lead', async ({ page }) => {
  const leadId = await poolLead(`سرنخ استخر ${suffix}`)
  await staffLogin(page, DEMO, cast.advisorOwn, '/staff/leads')
  await page.waitForURL(/\/staff\/leads/)
  await expect(page.getByTestId('crm-tab-mine')).toBeVisible()
  await expect(page.getByTestId('crm-tab-pool')).toHaveCount(0)
  await expect(page.getByTestId('crm-tab-team')).toHaveCount(0)
  await page.goto(`${DEMO}/staff/leads?v=pool`)
  await expect(page.getByTestId('crm-list')).toContainText('این نما برای شما باز نیست.')
  const res = await page.goto(`${DEMO}/staff/leads/${leadId}`)
  expect(res?.status()).toBe(404)
})

test('sales manager assigns a lead; the advisor then works it', async ({ page, browser }) => {
  const name = `سرنخ سپردنی ${suffix}`
  const leadId = await poolLead(name)
  await staffLogin(page, DEMO, cast.manager, '/staff/leads?v=team')
  await page.waitForURL(/\/staff\/leads\?v=team/)
  await expect(page.getByTestId('crm-tab-team')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('crm-list').locator('tr', { hasText: name })).toContainText('بی‌مشاور')
  await page.goto(`${DEMO}/staff/leads/${leadId}`)
  const assign = page.getByTestId('assign-form')
  await assign.getByLabel('سپردن به مشاور').selectOption(String(cast.advisor.id))
  await assign.getByRole('button', { name: 'سپردن' }).click()
  await expect(page.getByTestId('assign-message')).toContainText('سپرده شد')
  // The ownRecordsOnly advisor still qualifies (it would be their own lead); a finance user would not be listed.
  expect((await ok<Doc>(await admin.get(`/api/leads/${leadId}?depth=0`), 'lead')).advisor).toBe(cast.advisor.id)

  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await staffLogin(p2, DEMO, cast.advisor, `/staff/leads/${leadId}`)
  await p2.waitForURL(new RegExp(`/staff/leads/${leadId}`))
  await expect(p2.getByTestId('call-log-form')).toBeVisible()
  await expect(p2.getByTestId('assign-form')).toHaveCount(0)
  await ctx.close()
})

test('mark lost needs a reason and stores it', async ({ page }) => {
  const name = `سرنخ از دست رفته ${suffix}`
  const created = await ok<{ doc: Doc }>(await admin.post('/api/leads', { data: { tenant: ref.demo, name, phone: phone(), status: 'contacted', course: ref.course, advisor: cast.advisor.id } }), 'lead')
  const leadId = created.doc.id
  await staffLogin(page, DEMO, cast.advisor, `/staff/leads/${leadId}`)
  await page.waitForURL(new RegExp(`/staff/leads/${leadId}`))
  const lost = page.getByTestId('mark-lost-form')
  await expect(lost.getByRole('button', { name: 'ثبت «از دست رفت»' })).toBeDisabled()
  await lost.getByLabel('دلیل').selectOption('timing')
  await lost.getByRole('button', { name: 'ثبت «از دست رفت»' }).click()
  await expect(page.getByTestId('lead-page')).toHaveAttribute('data-status', 'lost')
  const stored = await ok<Doc>(await admin.get(`/api/leads/${leadId}?depth=0`), 'lead')
  expect(stored).toMatchObject({ status: 'lost', lostReason: 'timing' })
  await expect(page.getByTestId('lead-timeline').locator('li[data-kind="followUp"]')).toContainText('زمان دوره برایش مناسب نبود')
})

test("another academy's lead is a 404 from the demo desk", async ({ page }) => {
  const ibaLead = await poolLead(`سرنخ آکادمی دیگر ${suffix}`, ref.iba)
  await staffLogin(page, DEMO, cast.manager, '/staff/leads')
  await page.waitForURL(/\/staff\/leads/)
  const res = await page.goto(`${DEMO}/staff/leads/${ibaLead}`)
  expect(res?.status()).toBe(404)
  await page.goto(`${DEMO}/staff/leads?v=team&q=${encodeURIComponent('سرنخ آکادمی دیگر')}`)
  await expect(page.getByTestId('crm-list')).not.toContainText(suffix)
})
