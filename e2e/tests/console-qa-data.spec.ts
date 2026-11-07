import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { DEMO, IBA } from './helpers'
import { adminCreds, tenantId, apiAs } from './staff-helpers'

// E-035 QA: dump what the console shows to a platform admin so the numbers can be compared with SQL.
const OUT = process.env.QA_OUT ?? ''
const DESKS = ['overview', 'finance', 'leads', 'students', 'teaching', 'content', 'support']

test('platform admin: dump /staff desks and /admin dashboards', async ({ page, context, playwright }) => {
  test.setTimeout(240_000)
  const { email, password } = adminCreds()
  test.skip(!email || !password || !OUT, 'needs SEED_ADMIN_* and QA_OUT')
  mkdirSync(OUT, { recursive: true })
  const out: Record<string, string> = {}
  const api = await apiAs(playwright, DEMO, email, password)
  const demoId = await tenantId(api, 'demo')
  const ibaId = await tenantId(api, 'iba')
  await api.dispose()
  for (const [name, base, tid] of [['demo', DEMO, demoId], ['iba', IBA, ibaId]] as const) {
    const r = await page.request.post(`${base}/api/users/login`, { data: { email, password } })
    expect(r.ok()).toBeTruthy()
    for (const d of DESKS) {
      const res = await page.goto(`${base}/staff/${d}`)
      out[`${name}:/staff/${d}`] = `${res?.status()} ${page.url()}\n` + (await page.locator('#console-main').innerText({ timeout: 8000 }).catch(() => 'NO-MAIN'))
    }
    // /admin without a selected academy, then with each academy selected.
    for (const sel of [null, demoId, ibaId]) {
      await context.addCookies([{ name: 'payload-tenant', value: sel === null ? '' : String(sel), url: base }])
      if (sel === null) await context.clearCookies({ name: 'payload-tenant' })
      await page.goto(`${base}/admin`)
      out[`${name}:/admin:sel=${sel}`] = await page.locator('.c-dash').first().innerText({ timeout: 8000 }).catch(() => 'NO-DASH')
    }
  }
  writeFileSync(join(OUT, 'data.json'), JSON.stringify(out, null, 1))
  void tid0
})
const tid0 = 0
