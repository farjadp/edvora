import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { DEMO, IBA } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, tenantId, type StaffUser } from './staff-helpers'

// E-035 QA: role matrix for the operator console (/staff + /admin). Read-only against the data; creates throw-away
// staff users in demo and iba through the REST API as the seeded super admin. Dumps what each role saw to QA_OUT.
const OUT = process.env.QA_OUT ?? ''

let admin: APIRequestContext
const roles = ['advisor', 'finance', 'instructor', 'content-editor', 'support', 'academy-admin'] as const
const users = new Map<string, StaffUser>()
const dump: Record<string, unknown> = {}

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
  for (const r of roles) users.set(`demo:${r}`, await createStaff(admin, 'demo', r, `qa-${r}`))
  for (const r of ['advisor', 'finance', 'academy-admin'] as const) users.set(`iba:${r}`, await createStaff(admin, 'iba', r, `qa-iba-${r}`))
})
test.afterAll(async () => {
  await admin?.dispose()
})
test.afterEach(async ({}, info) => {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `${info.title.replace(/\W+/g, '_')}.json`), JSON.stringify(dump, null, 1))
})

async function navLinks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>()
    document.querySelectorAll('nav[aria-label="ناوبری میز کار"] a[href], nav.c-nav a[href]').forEach((a) => out.add(`${(a.textContent ?? '').trim()}|${a.getAttribute('href')}`))
    return [...out]
  })
}
/** Module labels a role must (not) see in the sidebar, in /staff and /admin alike. */
const NAV: Record<string, { has: string[]; not: string[] }> = {
  advisor: { has: ['مشتریان بالقوه'], not: ['سفارش‌ها و اقساط', 'کدهای تخفیف', 'مجله', 'آکادمی‌ها', 'گزارش ممیزی', 'تحویل تکالیف و نمره‌دهی'] },
  finance: { has: ['سفارش‌ها و اقساط'], not: ['مشتریان بالقوه', 'مجله', 'آکادمی‌ها', 'گزارش ممیزی', 'تحویل تکالیف و نمره‌دهی'] },
  instructor: { has: ['تحویل تکالیف و نمره‌دهی', 'آزمون‌ها'], not: ['سفارش‌ها و اقساط', 'مشتریان بالقوه', 'مجله', 'آکادمی‌ها', 'گزارش ممیزی'] },
  'content-editor': { has: ['مجله', 'رسانه'], not: ['سفارش‌ها و اقساط', 'مشتریان بالقوه', 'دانشجویان و کاربران', 'آکادمی‌ها', 'گزارش ممیزی'] },
  support: { has: ['دانشجویان و کاربران'], not: ['سفارش‌ها و اقساط', 'مشتریان بالقوه', 'مجله', 'آکادمی‌ها', 'گزارش ممیزی'] },
  'academy-admin': { has: ['سفارش‌ها و اقساط', 'مشتریان بالقوه', 'مجله', 'نقش‌ها', 'گزارش ممیزی'], not: [] },
}
const bad = /غیرمجاز|class="unauthorized|Internal Server Error|Application error|stack|TypeError|Cannot read|Unhandled|ECONN/i

async function crawl(page: Page, base: string, key: string, links: string[]) {
  const results: Record<string, number | string> = {}
  for (const l of links) {
    const href = l.split('|')[1]!
    if (href.startsWith('/api/') || href.includes('logout')) continue
    const res = await page.request.get(`${base}${href}`)
    const html = await res.text()
    results[href] = res.status()
    if (bad.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) results[href] = `${res.status()} TEXT:${html.match(bad)![0]}`
  }
  dump[`${key}:crawl`] = results
}

for (const who of ['demo:advisor', 'demo:finance', 'demo:instructor', 'demo:content-editor', 'demo:support', 'demo:academy-admin', 'iba:advisor', 'iba:finance', 'iba:academy-admin']) {
  test(`staff matrix ${who}`, async ({ page }) => {
    test.setTimeout(240_000)
    const [slug] = who.split(':')
    const base = slug === 'iba' ? IBA : DEMO
    const u = users.get(who)!
    await staffLogin(page, base, u)
    await page.waitForURL((url) => !url.pathname.includes('login'))
    await page.goto(`${base}/staff`)
    const staffNav = await navLinks(page)
    dump[`${who}:staff:nav`] = staffNav
    dump[`${who}:staff:overview`] = (await page.locator('#console-main').innerText()).replace(/\n+/g, ' | ')
    await crawl(page, base, `${who}:staff`, staffNav)
    // /admin as the same person
    const r = await page.request.post(`${base}/api/users/login`, { data: { email: u.email, password: u.password } })
    expect(r.ok()).toBeTruthy()
    const res = await page.goto(`${base}/admin`)
    dump[`${who}:admin:status`] = res?.status() ?? 0
    dump[`${who}:admin:url`] = page.url()
    if (page.url().includes('/admin') && !page.url().includes('login')) {
      const adminNav = await navLinks(page)
      dump[`${who}:admin:nav`] = adminNav
      dump[`${who}:admin:home`] = (await page.locator('.c-dash').first().innerText({ timeout: 10_000 }).catch(() => 'NO-DASH')).replace(/\n+/g, ' | ')
      await crawl(page, base, `${who}:admin`, adminNav)
    }
    const role = who.split(':')[1]!
    const labels = (links: unknown) => ((links as string[] | undefined) ?? []).map((l) => l.split('|')[0]!)
    for (const surface of ['staff', 'admin']) {
      const got = labels(dump[`${who}:${surface}:nav`])
      expect(got.length, `${who} ${surface} nav is not empty`).toBeGreaterThan(0)
      for (const l of NAV[role]!.has) expect(got, `${who} ${surface} shows ${l}`).toContain(l)
      for (const l of NAV[role]!.not) expect(got, `${who} ${surface} hides ${l}`).not.toContain(l)
    }
    // Cross-academy: an iba person never sees the demo academy's numbers (demo has 51 enrolments, 560 800 000 toman sold).
    if (who.startsWith('iba:')) {
      const seen = `${dump[`${who}:staff:overview`]} ${dump[`${who}:admin:home`] ?? ''}`
      expect(seen).not.toContain('۵۶۰٬۸۰۰٬۰۰۰')
      expect(seen).not.toContain('دوره نمونه مدیریت')
    }
    for (const surface of ['staff', 'admin']) {
      const crawled = (dump[`${who}:${surface}:crawl`] as Record<string, number | string>) ?? {}
      expect(Object.keys(crawled).length, `${who} ${surface} crawled links`).toBeGreaterThan(0)
      expect(Object.entries(crawled).filter(([, v]) => typeof v === 'string' || v >= 400), `${who} ${surface} links with 4xx/5xx/unauthorized`).toEqual([])
    }
  })
}
