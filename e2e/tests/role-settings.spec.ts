import { randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { DEMO } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, tenantId, type StaffUser } from './staff-helpers'

/**
 * E-039 (ADR 016): role settings are enforced, not only stored. One check of each kind: a 2FA-required role
 * grants nothing until 2FA, a role's landing page wins over the desk priority, a hidden menu section disappears
 * while its API stays governed by permissions, and the new read-only template can read but never write.
 * Test users and roles live in the demo academy only.
 */

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

type RoleBody = { permissions: string[]; security?: Record<string, unknown>; experience?: Record<string, unknown> }

/** A custom role in demo plus a user holding only that role. */
async function userWithRole(label: string, body: RoleBody): Promise<StaffUser> {
  const key = `e2e-${label}-${randomBytes(3).toString('hex')}`
  const role = await admin.post('/api/roles', { data: { tenant: demo, name: `E2E ${label}`, key, ...body } })
  expect(role.ok(), `create role ${await role.text()}`).toBeTruthy()
  const roleId = ((await role.json()) as { doc: { id: number } }).doc.id
  const user = await createStaff(admin, 'demo', null, label)
  const m = await admin.post('/api/memberships', { data: { tenant: demo, user: user.id, roles: [roleId], status: 'active' } })
  expect(m.ok(), `create membership ${await m.text()}`).toBeTruthy()
  return user
}

test('2FA-required role: no access until the person enrols in 2FA', async ({ page, playwright }) => {
  const u = await userWithRole('tfa', { permissions: ['leads.view.own', 'leads.create', 'courses.view'], security: { require2fa: true } })

  // Control: the same permissions without the rule can read leads.
  const control = await userWithRole('tfa-off', { permissions: ['leads.view.own', 'leads.create', 'courses.view'] })
  const ok = await apiAs(playwright, DEMO, control.email, control.password)
  expect((await ok.get('/api/leads?limit=1')).status()).toBe(200)
  await ok.dispose()

  // API: the role grants nothing in a session without TOTP.
  const api = await apiAs(playwright, DEMO, u.email, u.password)
  expect((await api.get('/api/leads?limit=1')).status()).toBe(403)
  await api.dispose()

  // /staff: the gate sends the person to 2FA enrolment instead of a desk.
  await staffLogin(page, DEMO, u, '/staff/leads')
  await expect(page).toHaveURL(/\/staff\/2fa\/enrol/)
})

test('landing page: the role choice wins over the desk priority', async ({ page }) => {
  // Leads would land first by priority (ADR 008); the role says finance.
  const u = await userWithRole('landing', { permissions: ['leads.view.own', 'orders.view', 'users.view'], experience: { landing: 'finance' } })
  await staffLogin(page, DEMO, u)
  await expect(page).toHaveURL(`${DEMO}/staff/finance`)
})

test('hidden menu section: link gone, access unchanged', async ({ page }) => {
  // Control: without the setting the same permissions show «دوره‌ها» (learning section).
  const control = await userWithRole('menu-off', { permissions: ['leads.view.own', 'leads.create', 'courses.view'] })
  await staffLogin(page, DEMO, control)
  await expect(page).toHaveURL(`${DEMO}/staff/leads`)
  await expect(page.getByRole('link', { name: 'دوره‌ها', exact: true }).first()).toBeAttached()
  await page.context().clearCookies()

  const u = await userWithRole('menu', { permissions: ['leads.view.own', 'leads.create', 'courses.view'], experience: { menuSections: ['crm'] } })
  await staffLogin(page, DEMO, u)
  await expect(page).toHaveURL(`${DEMO}/staff/leads`)
  const nav = page.getByRole('navigation').first()
  await expect(nav.getByRole('link', { name: 'مشتریان بالقوه' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'دوره‌ها', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'امنیت حساب' }).first()).toBeAttached()
  // Menus are UX only: the permission still decides the API.
  expect((await page.request.get(`${DEMO}/api/courses?limit=1`)).status()).toBe(200)
})

test('reporting template: reads lists, changes nothing, no leads', async ({ playwright }) => {
  const u = await createStaff(admin, 'demo', 'reporting')
  const api = await apiAs(playwright, DEMO, u.email, u.password)
  try {
    expect((await api.get('/api/orders?limit=1')).status()).toBe(200)
    const courses = await api.get(`/api/courses?where[tenant][equals]=${demo}&limit=1&depth=0`)
    expect(courses.status()).toBe(200)
    const course = ((await courses.json()) as { docs: { id: number }[] }).docs[0]
    expect(course, 'demo has a course').toBeTruthy()
    const patch = await api.patch(`/api/courses/${course!.id}`, { data: { title: 'نباید تغییر کند' } })
    expect(patch.status()).toBe(403)
    expect((await api.get('/api/leads?limit=1')).status()).toBe(403)
    const role = await api.post('/api/roles', { data: { tenant: demo, name: 'x', key: `e2e-x-${randomBytes(3).toString('hex')}`, permissions: [] } })
    expect(role.status()).toBe(403)
  } finally {
    await api.dispose()
  }
})

test('roles compare view lists the new templates', async ({ page }) => {
  const { email, password } = adminCreds()
  await page.request.post(`${DEMO}/api/users/login`, { data: { email, password } })
  await page.goto(`${DEMO}/admin/roles-compare?academy=${demo}`)
  const table = page.getByTestId('roles-compare')
  await expect(table).toBeVisible()
  for (const name of ['دستیار آموزشی', 'گزارش‌گیر (فقط خواندن)', 'سرپرست فروش']) await expect(table.getByRole('link', { name, exact: true })).toBeVisible()
})
