import { randomBytes } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { tenantId } from './staff-helpers'

/** Helpers for the E-034 login specs. Everything is created per run with unique phones/emails (idempotent on a re-used DB). */

/** A unique fake mobile (09120xxxxxx). */
export function uniquePhone(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000
  return `09120${String(n).padStart(6, '0')}`
}

/** A student in `slug` created through the REST API as the seeded super admin (status other than active = suspended/archived). */
export async function createStudent(admin: APIRequestContext, slug: string, opts: { phone?: string; status?: 'active' | 'suspended' | 'archived' } = {}) {
  const tenant = await tenantId(admin, slug)
  const phone = opts.phone ?? uniquePhone()
  const suffix = randomBytes(4).toString('hex')
  const res = await admin.post('/api/users', {
    data: {
      email: `e2e-student-${suffix}@example.test`,
      password: `pw-${randomBytes(12).toString('hex')}`,
      name: 'دانشجوی تست',
      phone,
      roles: ['student'],
      tenants: [{ tenant }],
      status: opts.status ?? 'active',
    },
  })
  expect(res.ok(), `create student ${await res.text()}`).toBeTruthy()
  return { phone }
}

/** Sets a user's status through the API (e.g. to suspend a staff account after it was created). */
export async function setStatus(admin: APIRequestContext, id: number, status: 'active' | 'suspended' | 'archived'): Promise<void> {
  const res = await admin.patch(`/api/users/${id}`, { data: { status } })
  expect(res.ok(), `set status ${await res.text()}`).toBeTruthy()
}

function envValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  try {
    const line = readFileSync(join(__dirname, '../../apps/web/.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Makes the newest unconsumed SMS code of `phone` expire (S13). There is no HTTP way to age a code (otp-codes is not
 * exposed), so this updates the test database directly, only for the phone the test created.
 */
export async function expireOtp(phone: string): Promise<void> {
  const url = envValue('DATABASE_URL')
  if (!url) throw new Error('DATABASE_URL not available')
  // `pg` is a dependency of the Postgres adapter (pnpm keeps it next to the adapter's real path, not at the root).
  const adapter = realpathSync(join(__dirname, '../../apps/web/node_modules/@payloadcms/db-postgres'))
  const { Client } = createRequire(join(adapter, 'package.json'))('pg') as { Client: new (c: { connectionString: string }) => { connect(): Promise<void>; query(q: string, v: unknown[]): Promise<{ rowCount: number | null }>; end(): Promise<void> } }
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const r = await client.query(`UPDATE otp_codes SET expires_at = now() - interval '1 minute' WHERE phone = $1 AND consumed = false`, [phone])
    expect(r.rowCount, 'an unconsumed code exists for the phone').toBeGreaterThan(0)
  } finally {
    await client.end()
  }
}

/** Phone step → code step with the mock SMS provider; returns the dev code printed on the screen. */
export async function requestCode(page: Page, base: string, phone: string, next?: string): Promise<string> {
  await page.goto(`${base}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`)
  await page.getByLabel('شماره موبایل').fill(phone)
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
  const dev = page.locator('p', { hasText: 'حالت توسعه' }).locator('span')
  await expect(dev).toHaveText(/^\d{5}$/)
  return ((await dev.textContent()) ?? '').trim()
}

export async function noHorizontalOverflow(page: Page): Promise<void> {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  expect(sw, `scrollWidth ${sw} vs clientWidth ${cw}`).toBe(cw)
}

/** axe wcag2a + wcag2aa; fails on serious/critical only (moderate/minor are reported by the caller if wanted). */
export async function expectNoSeriousAxe(page: Page, label: string): Promise<void> {
  // The card fades in for 200 ms (seal-rise); axe would measure blended colours mid-animation.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    `axe on ${label}`,
  ).toEqual([])
}

/** Dark theme before the page script runs (the layout reads localStorage.theme). */
export async function preferDark(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
}
