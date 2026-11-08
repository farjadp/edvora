import { createHash, randomInt } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * Helpers for the E-029 sandbox demo specs. A sandbox lives on the PLATFORM host (localhost:PORT, the same host the
 * `iba` academy uses); the signed `edvora_sbx` cookie switches the tenant. `demo.localhost` and `iba` are the
 * real academies that must stay untouched.
 *
 * Needs `SANDBOX_ENABLED=true`, `SANDBOX_E2E_HOOKS=true` and `SANDBOX_CRON_SECRET` (≥ 24 chars) on the server, and
 * raised `SANDBOX_IP_DAILY_MAX` / `SANDBOX_IP_ACTIVE_MAX` (the default limits are one live demo per network).
 * Every "visitor" sends its own `X-Forwarded-For` (the last entry is the trusted hop), so tests never share a bucket.
 */
const port = Number(process.env.E2E_PORT ?? 3000)
export const PLATFORM = `http://localhost:${port}`
export const DEMO_HOST = `http://demo.localhost:${port}`

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

export const cronSecret = () => envValue('SANDBOX_CRON_SECRET') ?? ''
export const cronAuth = () => ({ Authorization: `Bearer ${cronSecret()}` })
export const hooksConfigured = () => cronSecret().length >= 24 && envValue('SANDBOX_E2E_HOOKS') === 'true'

/** A fresh private-range IP: its own rate-limit and per-IP bucket. */
export const visitorIp = () => `10.${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`

export type Creds = { email: string; password: string }
export type Sandbox = { loginUrl: string; slug: string; expiresAt: string; admin: Creds; student: Creds; certificateCode: string }

export type Visitor = { context: BrowserContext; page: Page; ip: string }

/** A browser context that looks like one visitor from one network. */
export async function newVisitor(browser: Browser, opts: { viewport?: { width: number; height: number }; colorScheme?: 'light' | 'dark' } = {}): Promise<Visitor> {
  const ip = visitorIp()
  const context = await browser.newContext({
    baseURL: PLATFORM,
    locale: 'fa-IR',
    extraHTTPHeaders: { 'X-Forwarded-For': ip },
    viewport: opts.viewport,
    colorScheme: opts.colorScheme,
  })
  return { context, page: await context.newPage(), ip }
}

function solvePow(nonce: string, bits: number): number {
  for (let counter = 0; ; counter++) {
    const digest = createHash('sha256').update(`${nonce}:${counter}`).digest()
    let zeros = 0
    for (const b of digest) {
      if (b === 0) {
        zeros += 8
        continue
      }
      zeros += Math.clz32(b) - 24
      break
    }
    if (zeros >= bits) return counter
  }
}

type Challenge = { token: string; nonce: string; bits: number }

export async function getChallenge(api: APIRequestContext): Promise<Challenge> {
  const res = await api.get(`${PLATFORM}/demo/api/challenge`)
  expect(res.ok(), 'challenge').toBeTruthy()
  return ((await res.json()) as { challenge: Challenge }).challenge
}

/** Same steps as the page: signed challenge → proof of work → wait out the minimum fill time → POST. */
export async function createSandboxApi(api: APIRequestContext, body: Record<string, unknown> = {}, opts: { skipWait?: boolean } = {}) {
  const ch = await getChallenge(api)
  const counter = solvePow(ch.nonce, ch.bits)
  if (!opts.skipWait) await new Promise((r) => setTimeout(r, 3_300))
  const res = await api.post(`${PLATFORM}/demo/api/create`, { data: { token: ch.token, counter, ...body } })
  return { res, ch, counter, status: res.status(), json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

export async function createSandbox(visitor: Visitor): Promise<Sandbox> {
  const r = await createSandboxApi(visitor.context.request)
  expect(r.status, JSON.stringify(r.json)).toBe(200)
  expect(r.json.state).toBe('ready')
  return { ...(r.json as unknown as Sandbox), slug: String(r.json.loginUrl).split('/').pop() ?? '' }
}

/** One-click «ورود» through the creator cookie (a form POST answered with 303). */
export async function enterAs(visitor: Visitor, role: 'admin' | 'student'): Promise<void> {
  const res = await visitor.context.request.post(`${PLATFORM}/demo/enter`, { form: { role }, maxRedirects: 0 })
  expect(res.status()).toBe(303)
  expect(res.headers().location).toContain(role === 'admin' ? '/staff' : '/dashboard')
}

/** Ends the sandbox selected by this visitor's browser, exactly like the clock would (hook needs the cron secret). */
export async function expireNow(visitor: Visitor, purge = false) {
  const res = await visitor.context.request.post(`${PLATFORM}/demo/api/test/expire${purge ? '?purge=1' : ''}`, { headers: cronAuth() })
  expect(res.status(), 'expire hook (SANDBOX_E2E_HOOKS + SANDBOX_CRON_SECRET)').toBe(200)
}

export async function runCleanup(api: APIRequestContext) {
  const res = await api.post(`${PLATFORM}/demo/api/cleanup`, { headers: cronAuth() })
  const body = (await res.json()) as { ok: boolean; revoked: number; purged: number[]; failed: unknown[]; staleReservations: number }
  expect(res.status(), JSON.stringify(body)).toBe(200)
  return body
}

/** Test teardown: hard-delete this visitor's sandbox (expire with purge, then the cleanup job) and close the context. */
export async function disposeSandbox(visitor: Visitor): Promise<void> {
  try {
    await expireNow(visitor, true)
    await runCleanup(visitor.context.request)
  } catch {
    // Teardown must not hide the real failure; an orphan expires by itself and the next cleanup run removes it.
  } finally {
    await visitor.context.close()
  }
}

/** The platform host's tenant, as seen through a given visitor's cookies. */
export async function tenantOf(api: APIRequestContext): Promise<{ id: number; slug: string; isSandbox: boolean; expiresAt: string | null }> {
  const res = await api.get(`${PLATFORM}/api/tenants?limit=5&depth=0`)
  expect(res.ok()).toBeTruthy()
  const docs = ((await res.json()) as { docs: { id: number; slug: string; isSandbox?: boolean; expiresAt?: string | null }[] }).docs
  expect(docs.length, 'a sandbox admin sees exactly their own tenant').toBe(1)
  const t = docs[0]!
  return { id: t.id, slug: t.slug, isSandbox: t.isSandbox === true, expiresAt: t.expiresAt ?? null }
}

/** A real, valid PNG of incompressible noise (so its size is predictable): ~w*h*3 bytes. */
export function noisePng(w: number, h: number): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { deflateSync, crc32 } = require('node:zlib') as typeof import('node:zlib') & { crc32: (b: Buffer) => number }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto')
  const stride = w * 3 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) randomBytes(w * 3).copy(raw, y * stride + 1)
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))])
}

/** PR screenshots: only written when E2E_SCREENSHOTS=1 (`pnpm e2e sandbox-demo` stays free of side effects). */
export const SHOTS_DIR = join(__dirname, '../../docs/agents/handoffs/E-029')
export const wantShots = () => process.env.E2E_SCREENSHOTS === '1'
export async function shot(page: Page, name: string): Promise<void> {
  if (!wantShots()) return
  mkdirSync(SHOTS_DIR, { recursive: true })
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`), fullPage: true, animations: 'disabled' })
}
