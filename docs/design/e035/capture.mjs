/**
 * E-035 screenshot capture (local dev only). Usage, with the dev server on :3310 and a seeded DB:
 *   node docs/design/e035/capture.mjs <before|after> [only-substring]
 * Writes docs/design/e035/<phase>-<page>-<theme>-<width>.png. Reads SEED_ADMIN_* from apps/web/.env (never printed)
 * and creates throw-away advisor/finance users in the demo academy through the REST API, like e2e/tests/staff-helpers.
 */
import { chromium, request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(here, '../../../apps/web/.env'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const PORT = process.env.E2E_PORT ?? '3310'
const [phase = 'after', only = ''] = process.argv.slice(2)
const IBA = `http://localhost:${PORT}`
const DEMO = `http://demo.localhost:${PORT}`

async function login(base, email, password) {
  const api = await request.newContext({ baseURL: base })
  const r = await api.post('/api/users/login', { data: { email, password } })
  if (!r.ok()) throw new Error(`login failed ${email} @ ${base}`)
  return api
}
async function staffUser(admin, template) {
  const t = await (await admin.get('/api/tenants?where[slug][equals]=demo&limit=1&depth=0')).json()
  const tenant = t.docs[0].id
  const role = await (await admin.get(`/api/roles?where[and][0][tenant][equals]=${tenant}&where[and][1][key][equals]=${template}&limit=1&depth=0`)).json()
  const u = { email: `e035-${template}-${randomBytes(3).toString('hex')}@example.test`, password: `pw-${randomBytes(10).toString('hex')}`, name: template === 'advisor' ? 'سارا احمدی' : 'مینا کریمی' }
  const c = await admin.post('/api/users', { data: { ...u, roles: ['student'], tenants: [{ tenant }] } })
  const id = (await c.json()).doc.id
  await admin.post('/api/memberships', { data: { tenant, user: id, roles: [role.docs[0].id], status: 'active' } })
  return u
}

const admin = await login(DEMO, env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD)
const advisor = await staffUser(admin, 'advisor')
const finance = await staffUser(admin, 'finance')
const course = (await (await admin.get('/api/courses?limit=1&depth=0')).json()).docs[0]

const PAGES = [
  { name: 'admin-dashboard', path: '/admin', who: 'admin' },
  { name: 'admin-list', path: '/admin/collections/courses', who: 'admin' },
  { name: 'admin-form', path: `/admin/collections/courses/${course?.id ?? ''}`, who: 'admin' },
  { name: 'staff-overview', path: '/staff/overview', who: 'admin' },
  { name: 'staff-leads', path: '/staff/leads', who: 'advisor' },
  { name: 'staff-finance', path: '/staff/finance', who: 'finance' },
]
const creds = { admin: { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }, advisor, finance }

const browser = await chromium.launch()
async function shot({ name, path, who }, base, tag, theme, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 812 }, locale: 'fa-IR', reducedMotion: 'reduce' })
  const host = new URL(base).hostname
  await ctx.addCookies([{ name: 'payload-theme', value: theme, domain: host, path: '/' }])
  await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme)
  const res = await ctx.request.post(`${base}/api/users/login`, { data: { email: creds[who].email, password: creds[who].password } })
  if (!res.ok()) throw new Error(`login ${who}`)
  const page = await ctx.newPage()
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const file = join(here, `${phase}-${name}${tag}-${theme}-${width}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(file.split('/').pop(), overflow > 0 ? `OVERFLOW ${overflow}px` : 'ok')
  await ctx.close()
}
for (const p of PAGES) {
  if (only && !p.name.includes(only)) continue
  // Non-admin staff users exist in the demo academy only, so their desks are captured there.
  const base = p.who === 'admin' ? IBA : DEMO
  for (const theme of ['light', 'dark']) for (const width of [1440, 375]) await shot(p, base, '', theme, width)
}
for (const p of PAGES.filter((x) => ['admin-dashboard', 'staff-overview'].includes(x.name))) {
  if (only && !p.name.includes(only)) continue
  await shot(p, DEMO, '-demo', 'light', 1440)
}
await browser.close()
await admin.dispose()
