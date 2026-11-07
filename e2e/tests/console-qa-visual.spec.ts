import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import { DEMO, IBA } from './helpers'
import { adminCreds, apiAs } from './staff-helpers'

// E-035 QA: operator console, both academies x light/dark x 1440/375: horizontal overflow, axe (wcag2a/aa), screenshots.
// Needs a fresh seed. Results go to QA_OUT/visual.json; screenshots only when QA_SHOTS is set.
const OUT = process.env.QA_OUT ?? ''
const SHOTS = process.env.QA_SHOTS ?? ''
const shotDir = resolve(__dirname, '../../docs/design/e035')

type Row = { page: string; tenant: string; theme: string; width: number; overflow: number; status: number; english?: string[]; axe?: { id: string; impact: string | null | undefined; n: number; sample: string }[] }
const rows: Row[] = []
let admin: APIRequestContext
const ids: Record<string, { course?: number; lesson?: number; post?: number }> = { demo: {}, iba: {} }

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password || !OUT, 'needs SEED_ADMIN_* and QA_OUT')
  admin = await apiAs(playwright, DEMO, email, password)
  for (const slug of ['demo', 'iba']) {
    const t = ((await (await admin.get(`/api/tenants?where[slug][equals]=${slug}&limit=1&depth=0`)).json()) as { docs: { id: number }[] }).docs[0]!.id
    const first = async (c: string) => ((await (await admin.get(`/api/${c}?where[tenant][equals]=${t}&limit=1&depth=0`)).json()) as { docs: { id: number }[] }).docs[0]?.id
    ids[slug] = { course: await first('courses'), lesson: await first('lessons'), post: await first('posts') }
  }
})
test.afterAll(async () => {
  if (OUT) {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(join(OUT, 'visual.json'), JSON.stringify(rows, null, 1))
  }
  await admin?.dispose()
})

async function themed(context: BrowserContext, base: string, theme: 'light' | 'dark') {
  await context.addCookies([{ name: 'payload-theme', value: theme, url: base }])
  await context.addInitScript((t) => localStorage.setItem('theme', t), theme)
}

async function visit(page: Page, name: string, base: string, tenant: string, path: string, theme: 'light' | 'dark', width: number, opts: { axe: boolean; shot?: boolean }) {
  const res = await page.goto(base + path, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(700)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const row: Row = { page: name, tenant, theme, width, overflow, status: res?.status() ?? 0 }
  if (opts.axe) {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    row.axe = r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} :: ${(n.any[0]?.message ?? n.html).slice(0, 120)}`).join(' || ') }))
  }
  if (SHOTS && opts.shot) await page.screenshot({ path: join(shotDir, `qa-${name}-${tenant}-${theme}-${width}.png`), fullPage: true })
  rows.push(row)
}

const STAFF = ['overview', 'finance', 'leads', 'students', 'teaching', 'content', 'support']

for (const tenant of ['demo', 'iba'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 375] as const) {
      test(`console ${tenant} ${theme} ${width}`, async ({ browser }) => {
        test.setTimeout(420_000)
        const base = tenant === 'iba' ? IBA : DEMO
        const { email, password } = adminCreds()
        const context = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 812 }, locale: 'fa-IR', reducedMotion: 'reduce' })
        await themed(context, base, theme)
        const page = await context.newPage()
        const axe = width === 1440
        // Anonymous admin login first (no session yet).
        await visit(page, 'admin-login', base, tenant, '/admin/login', theme, width, { axe, shot: tenant === 'demo' })
        const html = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, theme: document.documentElement.getAttribute('data-theme') }))
        rows[rows.length - 1]!.english = [`lang=${html.lang}`, `dir=${html.dir}`, `data-theme=${html.theme}`]
        const login = await context.request.post(`${base}/api/users/login`, { data: { email, password } })
        expect(login.ok()).toBeTruthy()
        const t = ids[tenant]!
        const adminPages: [string, string, boolean][] = [
          ['admin-dashboard', '/admin', true],
          ['admin-list-orders', '/admin/collections/orders', tenant === 'demo'],
          ['admin-list-courses', '/admin/collections/courses', false],
          ['admin-form-course', `/admin/collections/courses/${t.course}`, tenant === 'demo'],
          [t.lesson ? 'admin-form-lesson-lexical' : 'admin-form-post-lexical', t.lesson ? `/admin/collections/lessons/${t.lesson}` : `/admin/collections/posts/${t.post}`, tenant === 'demo'],
          ['admin-account', '/admin/account', false],
        ]
        for (const [name, path, shot] of adminPages) await visit(page, name, base, tenant, path, theme, width, { axe, shot })
        for (const d of STAFF) await visit(page, `staff-${d}`, base, tenant, `/staff/${d}`, theme, width, { axe, shot: tenant === 'demo' && ['overview', 'finance', 'teaching'].includes(d) })
        await context.close()
      })
    }
  }
}
