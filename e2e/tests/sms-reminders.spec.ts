import { expect, test, type APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO } from './helpers'
import { adminCreds, apiAs, createStaff, tenantId } from './staff-helpers'

/**
 * E-016 SMS reminders worker (ADR 020): due instalment → exactly one mock send; quiet hours defer; a rerun never
 * duplicates; the send log is read by notifications.view only and never exposes the full mobile.
 * Needs on the server: SMS_REMINDERS_ENABLED=true, REMINDERS_CRON_SECRET (≥ 24 chars), REMINDERS_E2E_HOOKS=true
 * (CI sets them). Uses the seeded demo instalment order (#2 is due 25 days after the seed) and a fresh seed.
 */
function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  try {
    const line = readFileSync(join(__dirname, '../../apps/web/.env'), 'utf8').split('\n').find((l) => l.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}
const secret = () => envValue('REMINDERS_CRON_SECRET') ?? ''
const configured = () => secret().length >= 24 && envValue('REMINDERS_E2E_HOOKS') === 'true' && envValue('SMS_REMINDERS_ENABLED') === 'true'

type Doc = Record<string, unknown> & { id: number }
type Report = { ok: boolean; sent: number; deferred: number; duplicates: number; errors: string[] }

/** Tehran calendar date (YYYY-MM-DD) of an instant. */
const tehranDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

test.describe.configure({ mode: 'serial' })
test.skip(!configured(), 'needs SMS_REMINDERS_ENABLED=true, REMINDERS_CRON_SECRET and REMINDERS_E2E_HOOKS=true')

let admin: APIRequestContext
let key = ''
let day = ''

const run = async (api: APIRequestContext, at: string, auth = true) =>
  api.post(`${DEMO}/api/cron/reminders?tenant=demo&now=${encodeURIComponent(at)}`, { headers: auth ? { Authorization: `Bearer ${secret()}` } : {} })
const logFor = async (api: APIRequestContext) => {
  const res = await api.get(`/api/sms-log?where[key][equals]=${encodeURIComponent(key)}&depth=0`)
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as { totalDocs: number; docs: Doc[] }
}

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  admin = await apiAs(playwright, DEMO, email, password)
  const demo = await tenantId(admin, 'demo')
  const res = await admin.get(`/api/orders?where[and][0][tenant][equals]=${demo}&where[and][1][status][equals]=partially_paid&limit=50&depth=0`)
  const orders = ((await res.json()) as { docs: (Doc & { instalments?: { index: number; dueDate: string; status: string }[] })[] }).docs
  const order = orders.find((o) => o.instalments?.some((i) => i.index === 2 && i.status === 'pending'))
  expect(order, 'seeded demo instalment order').toBeTruthy()
  const inst = order!.instalments!.find((i) => i.index === 2)!
  day = tehranDay(inst.dueDate)
  key = `t${demo}:instalment:${order!.id}:2:${day}:due`
})

test.afterAll(async () => {
  await admin?.dispose()
})

test('the cron route is closed without the secret', async () => {
  expect((await run(admin, `${day}T10:00:00+03:30`, false)).status()).toBe(404)
})

test('quiet hours defer: nothing is sent or logged at 22:30 Tehran', async () => {
  test.skip((await logFor(admin)).totalDocs > 0, 'already sent in an earlier run — needs a fresh seed')
  const res = await run(admin, `${day}T22:30:00+03:30`)
  expect(res.status()).toBe(200)
  const report = (await res.json()) as Report
  expect(report.deferred).toBeGreaterThanOrEqual(1)
  expect((await logFor(admin)).totalDocs).toBe(0)
})

test('due instalment → exactly one mock send', async () => {
  const res = await run(admin, `${day}T10:00:00+03:30`)
  expect(res.status(), await res.text()).toBe(200)
  const log = await logFor(admin)
  expect(log.totalDocs).toBe(1)
  const row = log.docs[0]!
  expect(row).toMatchObject({ rule: 'instalment.due', stage: 'due', status: 'sent', provider: 'mock' })
  expect(String(row.providerMessageId)).toMatch(/^mock-/)
  expect(String(row.toMasked)).toMatch(/^09\d{2}\*\*\*\d{4}$/)
  expect(row.to, 'full mobile never leaves the server').toBeUndefined()
  expect(String(row.text)).toContain('/pay/')
  expect(String(row.text)).toContain('تومان')
})

test('rerun does not duplicate', async () => {
  for (const at of [`${day}T10:00:00+03:30`, `${day}T14:45:00+03:30`]) {
    const res = await run(admin, at)
    expect(res.status()).toBe(200)
    expect(((await res.json()) as Report).duplicates).toBeGreaterThanOrEqual(1)
  }
  expect((await logFor(admin)).totalDocs).toBe(1)
})

test('send log: notifications.view (admin, finance, support) reads it; advisor and student do not', async ({ playwright }) => {
  for (const [template, sees] of [['academy-admin', true], ['finance', true], ['support', true], ['advisor', false], [null, false]] as const) {
    const u = await createStaff(admin, 'demo', template, `sms-${template ?? 'student'}`)
    const api = await apiAs(playwright, DEMO, u.email, u.password)
    const res = await api.get(`/api/sms-log?where[key][equals]=${encodeURIComponent(key)}&depth=0`)
    const docs = res.ok() ? ((await res.json()) as { docs: Doc[] }).docs : []
    expect(docs.length, `${template ?? 'student'} sees the send log`).toBe(sees ? 1 : 0)
    if (sees) expect(docs[0]!.to).toBeUndefined()
    // Written only by the worker: nobody creates or edits rows over the API.
    expect((await api.post('/api/sms-log', { data: { key: `x-${u.id}`, rule: 'instalment.due', status: 'sent' } })).ok()).toBe(false)
    await api.dispose()
  }
})

test('settings hub: academy admin edits the reminder offsets; bad input is refused', async ({ page }) => {
  const demo = await tenantId(admin, 'demo')
  const u = await createStaff(admin, 'demo', 'academy-admin', 'sms-settings')
  expect((await page.request.post(`${DEMO}/api/users/login`, { data: { email: u.email, password: u.password } })).ok()).toBeTruthy()
  try {
    await page.goto(`${DEMO}/admin/settings/reminders`)
    await expect(page.getByTestId('settings-hub')).toBeVisible()
    await expect(page.locator('input[name="enabled"]')).toBeChecked()
    await page.locator('input[name="daysBefore"]').fill('۹۹۹')
    await page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click()
    await expect(page.getByTestId('settings-error')).toContainText('یادآورها')
    await page.locator('input[name="daysBefore"]').fill('۵، ۰')
    await page.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click()
    await expect(page.getByTestId('settings-saved')).toBeVisible()
    await page.reload()
    await expect(page.locator('input[name="daysBefore"]')).toHaveValue('۵، ۰')
  } finally {
    // Back to the seeded state (on, default offsets).
    await admin.patch(`/api/tenants/${demo}`, { data: { reminderSettings: { enabled: true } } })
  }
})
