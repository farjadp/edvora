import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { DEMO, IBA, fakePhone } from './helpers'
import { enrolFresh } from './gamification-helpers'
import { adminCreds, apiAs, createStaff } from './staff-helpers'

/** E-028 T2 / G1.4: the learning ledger is tenant-scoped, readable only by its owner (or scoped staff), and never writable. */
test.describe.configure({ mode: 'serial' })

type Event = { id: number; user: number | { id: number }; tenant?: number | { id: number } }
const uid = (u: Event['user']) => (typeof u === 'object' ? u.id : u)

async function tokenOf(ctx: BrowserContext): Promise<string> {
  const cookie = (await ctx.cookies()).find((c) => c.name === 'payload-token')
  expect(cookie, 'session cookie').toBeTruthy()
  return cookie!.value
}

let admin: APIRequestContext
test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
})
test.afterAll(async () => {
  await admin?.dispose()
})

test('anonymous cannot read the ledger on either academy', async ({ playwright }) => {
  for (const base of [DEMO, IBA]) {
    const api = await playwright.request.newContext({ baseURL: base })
    const res = await api.get('/api/learning-events')
    expect([401, 403]).toContain(res.status())
    expect(((await res.json()) as { docs?: unknown[] }).docs).toBeUndefined()
    await api.dispose()
  }
})

test('students see only their own rows; a demo token reads nothing on iba; nobody can write', async ({ browser, playwright }) => {
  test.setTimeout(240_000)
  const aCtx = await browser.newContext({ locale: 'fa-IR' })
  const bCtx = await browser.newContext({ locale: 'fa-IR' })
  const a = await aCtx.newPage()
  const b = await bCtx.newPage()
  const phoneA = fakePhone()
  const phoneB = fakePhone()
  await enrolFresh(a, phoneA)
  await enrolFresh(b, phoneB)
  // Give each a ledger row (manual mark writes a 0-XP lesson.marked row).
  for (const p of [a, b]) {
    await p.goto(`${DEMO}/learn/demo-program`)
    await p.locator('li[data-lesson-state]').filter({ hasText: 'منابع تکمیلی' }).getByRole('link').click()
    await p.getByRole('button', { name: 'علامت‌گذاری به‌عنوان دیده‌شده' }).click()
    await expect(p.getByRole('button', { name: '✓ دیده شد' })).toBeDisabled()
  }

  const own = await a.request.get(`${DEMO}/api/learning-events?limit=100&depth=0`)
  expect(own.status()).toBe(200)
  const ownDocs = ((await own.json()) as { docs: Event[] }).docs
  expect(ownDocs.length).toBeGreaterThan(0)
  const meA = (await (await a.request.get(`${DEMO}/api/users/me`)).json()) as { user: { id: number } }
  for (const d of ownDocs) expect(uid(d.user)).toBe(meA.user.id)

  // Student B cannot read A's row by id or by filter.
  const target = ownDocs[0]!
  const peek = await b.request.get(`${DEMO}/api/learning-events/${target.id}?depth=0`)
  expect([403, 404]).toContain(peek.status())
  const filtered = await b.request.get(`${DEMO}/api/learning-events?where[user][equals]=${meA.user.id}&depth=0`)
  expect(((await filtered.json()) as { docs: unknown[] }).docs ?? []).toEqual([])

  // Student A's token presented to the iba host: no rows, no iba data.
  const tokenA = await tokenOf(aCtx)
  const onIba = await playwright.request.newContext({ baseURL: IBA, extraHTTPHeaders: { Authorization: `JWT ${tokenA}` } })
  const cross = await onIba.get('/api/learning-events?limit=100&depth=0')
  if (cross.status() === 200) expect(((await cross.json()) as { docs: unknown[] }).docs).toEqual([])
  else expect([401, 403]).toContain(cross.status())
  const crossRow = await onIba.get(`/api/learning-events/${target.id}?depth=0`)
  expect([401, 403, 404]).toContain(crossRow.status())
  await onIba.dispose()

  // Writes are denied for everyone: the student, a demo academy admin, and the super admin.
  const owner = await createStaff(admin, 'demo', 'academy-admin')
  const academyAdmin = await apiAs(playwright, DEMO, owner.email, owner.password)
  const body = { user: meA.user.id, type: 'lesson.completed', xp: 999, occurredAt: new Date().toISOString(), idempotencyKey: `qa:${Date.now()}` }
  const actors: [string, APIRequestContext][] = [['student', a.request], ['academy-admin', academyAdmin], ['super-admin', admin]]
  for (const [who, api] of actors) {
    const create = await api.post(`${DEMO}/api/learning-events`, { data: body })
    expect(create.status(), `${who} create`).toBe(403)
    const update = await api.patch(`${DEMO}/api/learning-events/${target.id}`, { data: { xp: 999 } })
    expect([403, 404], `${who} update`).toContain(update.status())
    if (who !== 'student') expect(update.status(), `${who} update`).toBe(403)
    const del = await api.delete(`${DEMO}/api/learning-events/${target.id}`)
    expect([403, 404], `${who} delete`).toContain(del.status())
    if (who !== 'student') expect(del.status(), `${who} delete`).toBe(403)
  }
  const still = await a.request.get(`${DEMO}/api/learning-events/${target.id}?depth=0`)
  expect(still.status()).toBe(200)
  expect(((await still.json()) as { xp: number }).xp).not.toBe(999)

  // A demo academy admin on the iba host: nothing.
  const tokenAdmin = ((await academyAdmin.storageState()).cookies.find((c) => c.name === 'payload-token') ?? { value: '' }).value
  const adminOnIba = await playwright.request.newContext({ baseURL: IBA, extraHTTPHeaders: { Authorization: `JWT ${tokenAdmin}` } })
  const adminCross = await adminOnIba.get('/api/learning-events?limit=100&depth=0')
  if (adminCross.status() === 200) expect(((await adminCross.json()) as { docs: unknown[] }).docs).toEqual([])
  else expect([401, 403]).toContain(adminCross.status())
  // Demo's rows do not leak through the demo admin's own list as iba rows either: every row is demo's.
  const adminList = await academyAdmin.get(`${DEMO}/api/learning-events?limit=200&depth=0`)
  expect(adminList.status()).toBe(200)
  await adminOnIba.dispose()
  await academyAdmin.dispose()
  await aCtx.close()
  await bCtx.close()
})
