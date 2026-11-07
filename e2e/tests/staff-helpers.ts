import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { expect, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test'
import { hotp, totpStep } from '../../packages/core/src/totp'

/**
 * Staff test data (E-022): users + memberships are created per test run through the REST API as the seeded
 * super admin, in the `demo` academy only. Credentials come from the environment or apps/web/.env (never printed).
 */
function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  try {
    const file = readFileSync(join(__dirname, '../../apps/web/.env'), 'utf8')
    const line = file.split('\n').find((l) => l.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}

export const adminCreds = () => ({ email: envValue('SEED_ADMIN_EMAIL') ?? '', password: envValue('SEED_ADMIN_PASSWORD') ?? '' })

type Playwright = PlaywrightWorkerArgs['playwright']

export async function apiAs(playwright: Playwright, base: string, email: string, password: string): Promise<APIRequestContext> {
  const api = await playwright.request.newContext({ baseURL: base })
  const res = await api.post('/api/users/login', { data: { email, password } })
  expect(res.ok(), `login ${email}`).toBeTruthy()
  return api
}

export type StaffUser = { id: number; email: string; password: string; name: string }

async function first<T>(api: APIRequestContext, path: string): Promise<T> {
  const res = await api.get(path)
  expect(res.ok(), path).toBeTruthy()
  const body = (await res.json()) as { docs: T[] }
  expect(body.docs.length, path).toBeGreaterThan(0)
  return body.docs[0]!
}

export async function tenantId(admin: APIRequestContext, slug: string): Promise<number> {
  return (await first<{ id: number }>(admin, `/api/tenants?where[slug][equals]=${slug}&limit=1&depth=0`)).id
}

/** A user in `slug` with one active membership holding the template role `template` (null = no membership). */
export async function createStaff(admin: APIRequestContext, slug: string, template: string | null, label = template ?? 'none'): Promise<StaffUser> {
  const tenant = await tenantId(admin, slug)
  const suffix = randomBytes(4).toString('hex')
  const user = { email: `e2e-${label}-${suffix}@example.test`, password: `pw-${randomBytes(12).toString('hex')}`, name: `تست ${label}` }
  const created = await admin.post('/api/users', { data: { ...user, roles: ['student'], tenants: [{ tenant }] } })
  expect(created.ok(), `create user ${await created.text()}`).toBeTruthy()
  const id = ((await created.json()) as { doc: { id: number } }).doc.id
  if (template) {
    const role = await first<{ id: number }>(admin, `/api/roles?where[and][0][tenant][equals]=${tenant}&where[and][1][key][equals]=${template}&limit=1&depth=0`)
    const m = await admin.post('/api/memberships', { data: { tenant, user: id, roles: [role.id], status: 'active' } })
    expect(m.ok(), `create membership ${await m.text()}`).toBeTruthy()
  }
  return { id, ...user }
}

/** Signs in through /staff/login like a person would. */
export async function staffLogin(page: Page, base: string, u: { email: string; password: string }, next?: string): Promise<void> {
  await page.goto(`${base}/staff/login${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  await page.getByLabel('ایمیل').fill(u.email)
  await page.getByLabel('رمز عبور').fill(u.password)
  await page.getByRole('button', { name: 'ورود', exact: true }).click()
}

/** A TOTP code for a step after `lastStep` that the server will accept now (waits out the replay guard). */
export async function nextCode(secret: string, lastStep: number | null): Promise<{ code: string; step: number }> {
  for (;;) {
    const now = totpStep(Date.now())
    const step = lastStep === null ? now : Math.max(now, lastStep + 1)
    if (step <= now + 1) return { code: hotp(secret, step), step }
    await new Promise((r) => setTimeout(r, 1000))
  }
}
