import { gunzipSync, gzipSync } from 'node:zlib'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { writeBundle } from '../../packages/integrations/src/wordpress/bundle'
import type { SourceRecord } from '../../packages/integrations/src/wordpress/format'
import { DEMO, IBA } from './helpers'
import { adminCreds, apiAs, createStaff, staffLogin, tenantId, type StaffUser } from './staff-helpers'
import { createConnectionUi, qaSite, sql, toPersianDigits, type Conn, type QaSite } from './wp-import-helpers'

// E-032 QA — import semantics on the live stack with a synthetic site (random id per run, example.test mail):
// W3 bundle checks, W6 dry run writes nothing, W8 phones and held users, W8c existing user elsewhere, W11/W12 orders
// and money, W16 redirects and tenant isolation, W17 idempotency and conflicts, "nothing is ever deleted".

let admin: APIRequestContext
let adminIba: APIRequestContext
let ibaStaff: StaffUser
let importer: StaffUser
let demoId: number
let site: QaSite
let conn: Conn
const IBA_USER_NAME = 'علی اصلی (ایبا)'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  const { email, password } = adminCreds()
  test.skip(!email || !password, 'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not available')
  admin = await apiAs(playwright, DEMO, email, password)
  importer = await createStaff(admin, 'demo', 'academy-admin', 'qa-scn')
  demoId = await tenantId(admin, 'demo')
  // An academy admin of iba only (a super admin sees every academy, so isolation must be tested as a tenant user).
  ibaStaff = await createStaff(admin, 'iba', 'academy-admin', 'qa-iba')
  adminIba = await apiAs(playwright, IBA, ibaStaff.email, ibaStaff.password)
  site = qaSite()
  // "Ali" already has an account in the iba academy (name, login email) before the demo import runs.
  const ibaId = await tenantId(admin, 'iba')
  const made = await admin.post('/api/users', { data: { email: `ali-iba-${site.suffix}@example.test`, password: `pw-${site.suffix}-x9`, name: IBA_USER_NAME, phone: site.phones.ali, roles: ['student'], tenants: [{ tenant: ibaId }] } })
  expect(made.ok(), await made.text()).toBeTruthy()
})
test.afterAll(async () => {
  await admin?.dispose()
  await adminIba?.dispose()
})

// ---------------------------------------------------------------- helpers

async function loginImporter(page: Page) {
  await staffLogin(page, DEMO, importer, '/staff/import')
  await page.waitForURL(`${DEMO}/staff/import`)
}

async function upload(page: Page, base: string, file: { name: string; buffer: Buffer }) {
  await page.goto(`${base}/staff/import`)
  await page.locator('input[name="bundle"]').setInputFiles({ name: file.name, mimeType: 'application/gzip', buffer: file.buffer })
  await page.getByRole('button', { name: 'بارگذاری و بررسی' }).click()
  await page.waitForURL(new RegExp(`${base.replace(/[.:/]/g, '\\$&')}/staff/import/\\d+`), { timeout: 60_000 })
  return Number(page.url().split('/').pop())
}

const bundleFor = (c: Pick<Conn, 'connectionId' | 'secret'>, tenant: string, records: SourceRecord[] = site.records(), secret = c.secret) =>
  writeBundle(site.manifest(c, tenant), records, secret)

async function uploadSite(page: Page, records?: SourceRecord[]) {
  return upload(page, DEMO, { name: `qa-${site.suffix}.edvora-bundle`, buffer: bundleFor(conn, 'demo', records) })
}

async function decide(page: Page) {
  let changed = false
  for (const select of await page.locator('select[name^="product:"]').all()) {
    if ((await select.inputValue()) !== '') continue
    const suggested = select.locator('option', { hasText: '(پیشنهاد)' })
    await select.selectOption((await suggested.count()) ? ((await suggested.first().getAttribute('value')) ?? 'skip') : 'skip')
    changed = true
  }
  if (changed) {
    await page.evaluate(() => document.documentElement.setAttribute('data-stale', '1'))
    await page.getByRole('button', { name: 'ذخیره و بررسی دوباره' }).click()
    await page.waitForFunction(() => document.readyState === 'complete' && !document.documentElement.hasAttribute('data-stale'), undefined, { timeout: 60_000 })
  }
}

async function runImport(page: Page) {
  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'awaiting-confirm')
  for (let i = 0; i < 3 && (await page.locator('[data-severity="blocking"]').count()); i++) await decide(page)
  await expect(page.locator('[data-severity="blocking"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'اجرای انتقال', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'بله، اجرا شود' }).click()
  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'done', { timeout: 120_000 })
}

const cell = (page: Page, collection: string, action: string) => page.locator(`[data-testid="counts-table"] tr[data-collection="${collection}"] td[data-action="${action}"]`)

/** Row counts that an import could change, for the demo academy. Users are counted through their membership. */
async function snapshot() {
  const out: Record<string, number> = {}
  for (const t of ['courses', 'lessons', 'quizzes', 'questions', 'coupons', 'orders', 'enrollments', 'posts', 'media', 'redirects', 'certificates', 'import_refs']) {
    out[t] = Number((await sql<{ n: string }>(`select count(*) n from ${t} where tenant_id = $1`, [demoId]))[0]!.n)
  }
  out.users = Number((await sql<{ n: string }>('select count(*) n from users_tenants where tenant_id = $1', [demoId]))[0]!.n)
  out.users_all = Number((await sql<{ n: string }>('select count(*) n from users'))[0]!.n)
  return out
}

const userByPhone = async (phone: string) =>
  (await sql<{ id: number; name: string | null; email: string; contact_email: string | null; source: string | null }>('select id, name, email, contact_email, source from users where phone = $1', [phone]))[0]

const memberships = async (userId: number) =>
  (await sql<{ slug: string }>('select t.slug from users_tenants ut join tenants t on t.id = ut.tenant_id where ut._parent_id = $1 order by 1', [userId])).map((r) => r.slug)

async function otpLogin(page: Page, base: string, phone: string) {
  await page.goto(`${base}/login?next=${encodeURIComponent('/dashboard')}`)
  await page.getByLabel('شماره موبایل').fill(toPersianDigits(phone)) // Persian digits on purpose (W22)
  await page.getByRole('button', { name: 'دریافت کد ورود' }).click()
  const devCode = page.locator('p', { hasText: 'حالت توسعه' }).locator('span')
  await expect(devCode).toHaveText(/^\d{5}$/)
  await page.getByLabel('کد ورود').fill(((await devCode.textContent()) ?? '').trim())
  const name = page.getByLabel(/نام و نام خانوادگی/)
  if (await name.isVisible().catch(() => false)) await name.fill('دانشجوی تست')
  await page.getByRole('button', { name: 'ورود', exact: true }).click()
  await page.waitForURL(`${base}/dashboard`)
}

// ---------------------------------------------------------------- 1. dry run writes nothing; run; results

test('W6/W7/W8/W11/W12: dry run writes nothing; the run creates users by phone, the course, the enrolment and the order in rials', async ({ page }) => {
  await loginImporter(page)
  conn = await createConnectionUi(page, DEMO)
  const before = await snapshot()

  const jobId = await uploadSite(page)
  await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'awaiting-confirm')
  // Dry run: held users listed (duplicate phone ×2, no phone ×2: the WP admin and "nophone"), staff listed, and zero rows written anywhere.
  await expect(page.getByTestId('held-users').locator('li')).toHaveCount(4)
  await expect(page.getByTestId('held-users')).toContainText('شمارهٔ تکراری')
  expect(await snapshot()).toEqual({ ...before, import_refs: before.import_refs }) // import_refs untouched too
  expect(await userByPhone(site.phones.sara)).toBeUndefined()
  expect(await sql('select 1 from users where phone in ($1, $2)', [site.phones.dupA, site.phones.released])).toHaveLength(0)

  await runImport(page)
  await expect(page.getByRole('heading', { name: 'نتیجهٔ انتقال' })).toBeVisible()
  // Numbers on screen equal the database (W7s).
  const after = await snapshot()
  expect(after.courses - before.courses).toBe(1)
  expect(after.orders - before.orders).toBe(1)
  expect(after.enrollments - before.enrollments).toBe(1)
  expect(after.users - before.users).toBe(2) // sara created, ali attached
  expect(after.users_all - before.users_all).toBe(1) // ...and only sara is a new person

  // W8: +98… (sara) and 0098… (ali) were normalised to 09…; WP email is contact only, never the login email.
  const sara = await userByPhone(site.phones.sara)
  expect(sara).toBeDefined()
  expect(sara!.email).toMatch(/@phone\.demo\.edvora\.local$/)
  expect(sara!.contact_email).toBe(`sara-${site.suffix}@example.test`)
  expect(sara!.source).toBe('import')
  // Held users (duplicate phone, no phone) were not created and not merged.
  expect(await userByPhone(site.phones.dupA)).toBeUndefined()
  expect(await sql('select 1 from users where email like $1', [`%nophone-${site.suffix}%`])).toHaveLength(0)

  // W8c: existing person of another academy only gains a membership; profile untouched.
  const ali = await userByPhone(site.phones.ali)
  expect(ali!.name).toBe(IBA_USER_NAME)
  expect(ali!.email).toBe(`ali-iba-${site.suffix}@example.test`)
  expect(ali!.contact_email).toBeNull()
  expect(await memberships(ali!.id)).toEqual(['demo', 'iba'])

  // W12: 8,470,000 toman → 84,700,000 rials, integer, paid, source import.
  const orders = await sql<{ total: string; subtotal: string; status: string; source: string }>(
    'select o.total, o.subtotal, o.status, o.source from orders o join users u on u.id = o.user_id where u.phone = $1 and o.tenant_id = $2',
    [site.phones.sara, demoId],
  )
  expect(orders).toHaveLength(1)
  expect(Number(orders[0]!.total)).toBe(84_700_000)
  expect(Number.isInteger(Number(orders[0]!.total))).toBe(true)
  expect(orders[0]).toMatchObject({ status: 'paid', source: 'import' })
  expect(page.url()).toContain(`/staff/import/${jobId}`)
})

test('W22: the migrated student logs in with Persian digits, sees the course and the same amount in toman', async ({ page, browser }) => {
  await otpLogin(page, DEMO, site.phones.sara)
  await expect(page.locator('body')).toContainText(`دوره کیفیت ${site.suffix}`)
  // 84,700,000 rial = 8,470,000 toman, shown with Persian digits and Persian thousands separators.
  await expect(page.locator('body')).toContainText('۸٬۴۷۰٬۰۰۰ تومان')
  // Another student never sees it: ali's dashboard on demo has no such order.
  const other = await browser.newContext({ locale: 'fa-IR' })
  const ali = await other.newPage()
  await otpLogin(ali, DEMO, site.phones.ali)
  await expect(ali.locator('body')).not.toContainText('۸٬۴۷۰٬۰۰۰ تومان')
  await other.close()
})

test('W16/tenant isolation: imported course and Persian old URLs exist on demo only; nothing leaks to iba', async ({ request }) => {
  const rows = await sql<{ tenant_id: number }>('select tenant_id from courses where title like $1', [`%${site.suffix}%`])
  expect(rows.length).toBeGreaterThan(0)
  expect(new Set(rows.map((r) => r.tenant_id))).toEqual(new Set([demoId]))

  // IBA's own API and admin lists do not see the demo academy's imported data.
  for (const path of [`/api/courses?where[title][like]=${site.suffix}`, `/api/orders?limit=200`, `/api/enrollments?limit=200`]) {
    const res = await adminIba.get(`${IBA}${path}`)
    const text = await res.text()
    expect(text).not.toContain(site.suffix)
    expect(text).not.toContain(site.phones.sara)
  }
  const ibaImportJobs = await adminIba.get('/api/import-jobs?limit=100&depth=0')
  expect(await ibaImportJobs.text()).not.toContain(site.suffix)

  const oldProduct = `/product/${encodeURIComponent(site.slugs.product)}`
  const res = await request.get(`${DEMO}${oldProduct}`, { maxRedirects: 0 })
  expect(res.status()).toBe(308)
  expect(decodeURIComponent(res.headers().location ?? '')).toContain(`/courses/`)
  // Same URL, different case in the percent-encoding and a trailing slash: still one hop.
  const upper = await request.get(`${DEMO}${oldProduct.replace(/%[0-9a-f]{2}/g, (m) => m.toUpperCase())}/`, { maxRedirects: 0 })
  expect(upper.status()).toBe(308)
  expect((await request.get(`${IBA}${oldProduct}`, { maxRedirects: 0 })).status()).toBe(404)
  expect((await request.get(`${IBA}/course/${encodeURIComponent(site.slugs.course)}`, { maxRedirects: 0 })).status()).toBe(404)
  // Redirect targets are same-site paths: no open redirect through odd inputs.
  for (const bad of ['//evil.example', '/%5Cevil.example', '/product//evil.example']) {
    const r = await request.get(`${DEMO}${bad}`, { maxRedirects: 0 })
    expect(r.headers().location ?? '', bad).not.toMatch(/^(https?:)?\/\/|^\\|%5c/i) // never off-site or protocol-relative
  }
})

// ---------------------------------------------------------------- 2. held users

test('W8a/W8b: a held user is released by adding a phone (Persian digits accepted); the other duplicate is then no longer a duplicate', async ({ page }) => {
  await loginImporter(page)
  const jobId = await uploadSite(page)
  await expect(page.getByTestId('held-users').locator('li')).toHaveCount(4)
  // Second duplicate gets its own number, typed with Persian digits and spaces. Releasing it also frees the first
  // duplicate (the phone is no longer shared), so held goes 4 → 2 (WP admin and "nophone" remain without a phone).
  const li = page.getByTestId('held-users').locator('li', { hasText: 'دوم' })
  await li.locator('input[name="phone"]').fill(toPersianDigits(`${site.phones.released.slice(0, 4)} ${site.phones.released.slice(4)}`))
  await li.getByRole('button', { name: 'افزودن شماره' }).click()
  // QA-E032-02: the action answers redirectTo "<job>#held", a hash-only navigation that does not reload the page, so
  // the list stays stale (no feedback at all). Wait for the saved choice, then reload to see the new plan.
  await expect.poll(async () => JSON.stringify((await sql<{ choices: unknown }>('select choices from import_jobs where id = $1', [jobId]))[0]!.choices), { timeout: 60_000 }).toContain(site.phones.released)
  await page.reload()
  await expect(page.getByTestId('held-users').locator('li')).toHaveCount(2, { timeout: 60_000 })
  // A bad number is refused with a calm Persian message and changes nothing.
  const first = page.getByTestId('held-users').locator('li').first()
  await first.locator('input[name="phone"]').fill('12345')
  await first.getByRole('button', { name: 'افزودن شماره' }).click()
  await expect(first.getByRole('alert')).toContainText('شمارهٔ موبایل معتبر نیست')

  await runImport(page)
  const released = await userByPhone(site.phones.released)
  expect(released, 'released user exists').toBeDefined()
  expect(released!.contact_email).toBe(`dupb-${site.suffix}@example.test`)
  expect(await userByPhone(site.phones.dupA), 'the first duplicate is created once the clash is gone').toBeDefined()
  expect(await sql('select 1 from users where email like $1', [`%nophone-${site.suffix}%`]), 'a user without any phone is still never created').toHaveLength(0)
})

// ---------------------------------------------------------------- 3. idempotency and "never delete"

test('W17: re-running the same data creates and updates nothing; dropping records from WordPress deletes nothing in Edvora', async ({ page }) => {
  await loginImporter(page)
  const before = await snapshot()
  await uploadSite(page)
  for (const c of ['users', 'courses', 'lessons', 'orders', 'enrollments', 'redirects']) {
    if (!(await page.locator(`[data-testid="counts-table"] tr[data-collection="${c}"]`).count())) continue
    await expect(cell(page, c, 'create'), `${c} create`).toHaveText('—')
    await expect(cell(page, c, 'update'), `${c} update`).toHaveText('—')
  }
  await runImport(page)
  expect(await snapshot()).toEqual(before)

  // WordPress "lost" the order, a lesson and a user: Edvora keeps everything (report only, never delete).
  const trimmed = site.records().filter((r) => !(r.kind === 'woo.order' || r.kind === 'lifterlms.lesson' || (r.kind === 'wp.user' && r.wpId === '2')))
  await uploadSite(page, trimmed)
  await runImport(page)
  expect(await snapshot()).toEqual(before)
  expect(await userByPhone(site.phones.sara)).toBeDefined()
})

// ---------------------------------------------------------------- 4. conflicts

test('W17: a course edited in Edvora and changed in WordPress is a conflict; it is not overwritten, and the admin decides', async ({ page }) => {
  const [ref] = await sql<{ target_id: string }>("select target_id from import_refs where tenant_id = $1 and site = $2 and kind = 'lifterlms.course'", [demoId, site.siteId])
  expect(ref).toBeDefined()
  const courseId = Number(ref!.target_id)
  const EDITED = `ویرایش در ادوورا ${site.suffix}`
  const patched = await admin.patch(`/api/courses/${courseId}`, { data: { title: EDITED } })
  expect(patched.ok(), await patched.text()).toBeTruthy()
  const title = async () => (await sql<{ title: string }>('select title from courses where id = $1', [courseId]))[0]!.title

  await loginImporter(page)
  // WordPress did not change the course: Edvora's edit simply stays (nothing to overwrite).
  await uploadSite(page)
  await expect(cell(page, 'courses', 'update')).toHaveText('—')
  await runImport(page)
  expect(await title()).toBe(EDITED)

  // WordPress changed the title too: conflict, Edvora's text is kept.
  const wpTitle = `عنوان تازه در وردپرس ${site.suffix}`
  await uploadSite(page, site.records({ courseTitle: wpTitle }))
  await expect(cell(page, 'courses', 'conflict')).not.toHaveText('—')
  await runImport(page)
  expect(await title()).toBe(EDITED)
  await expect(page.getByTestId('conflicts')).toContainText(wpTitle.slice(0, 12))
  const refRow = await sql<{ status: string }>("select status from import_refs where tenant_id = $1 and site = $2 and kind = 'lifterlms.course'", [demoId, site.siteId])
  expect(refRow[0]!.status).toBe('conflict')

  // "Use the WordPress version" overwrites on purpose, once, with an audit entry.
  await page.getByTestId('conflicts').getByRole('button', { name: /وردپرس/ }).first().click()
  await expect.poll(title, { timeout: 30_000 }).toBe(wpTitle)
  await page.reload() // same hash-only redirect as QA-E032-02
  await expect(page.getByTestId('conflicts')).toContainText('نسخهٔ وردپرس جایگزین شد')
  expect((await sql('select 1 from audit_logs where action = $1 and tenant_id = $2', ['import.conflict.wp', demoId])).length).toBeGreaterThan(0)
})

// ---------------------------------------------------------------- 5. audit and purge

test('W20/W21: every step is in the audit log without personal data; "delete now" wipes raw files but keeps the report', async ({ page }) => {
  const actions = await sql<{ action: string; changes: unknown; note: string | null }>('select action, changes, note from audit_logs where tenant_id = $1 and action like $2', [demoId, 'import.%'])
  const names = new Set(actions.map((a) => a.action))
  for (const a of ['import.connection.create', 'import.dry_run', 'import.confirm', 'import.commit']) expect(names, a).toContain(a)
  const dump = JSON.stringify(actions)
  for (const pii of [site.phones.sara, site.phones.ali, `sara-${site.suffix}@example.test`]) expect(dump).not.toContain(pii)

  await loginImporter(page)
  const [job] = await sql<{ id: number; bundle_file: string | null; held: string }>(
    "select j.id, j.bundle_file, (select count(*) from import_refs r where r.job_id = j.id and r.held_data is not null) held from import_jobs j where j.tenant_id = $1 and j.mode = 'bundle' and j.status = 'done' and j.label like $2 order by j.id desc limit 1",
    [demoId, `%${site.suffix}%`],
  )
  expect(job, 'a finished job of this site').toBeDefined()
  expect(job!.bundle_file).not.toBeNull()
  await page.goto(`${DEMO}/staff/import/${job!.id}`)
  await page.getByRole('button', { name: /حذف همین/ }).click()
  await page.getByRole('button', { name: 'بله، حذف شود' }).click()
  await expect
    .poll(async () => (await sql<{ purged_at: Date | null }>('select purged_at from import_jobs where id = $1', [job!.id]))[0]!.purged_at, { timeout: 30_000 })
    .not.toBeNull()
  const [after] = await sql<{ bundle_file: string | null; plan_file: string | null; report: unknown }>('select bundle_file, plan_file, report from import_jobs where id = $1', [job!.id])
  expect(after).toMatchObject({ bundle_file: null, plan_file: null })
  expect(after!.report).not.toBeNull()
  expect(await sql('select 1 from audit_logs where action = $1 and doc_id = $2', ['import.purge', String(job!.id)])).toHaveLength(1)
  expect(await sql('select 1 from import_refs where job_id = $1 and held_data is not null', [job!.id])).toHaveLength(0)
})

// ---------------------------------------------------------------- 6. bundle upload checks (W3)

test.describe('W3 bundle upload refusals', () => {
  const rejected = async (page: Page, base: string, buffer: Buffer, text: RegExp) => {
    const id = await upload(page, base, { name: 'qa.edvora-bundle', buffer })
    await expect(page.getByTestId('job-status')).toHaveAttribute('data-status', 'rejected')
    await expect(page.locator('p[role="alert"]')).toContainText(text)
    // Calm Persian message, no stack trace; the uploaded bytes are not kept.
    expect(await page.locator('body').innerText()).not.toMatch(/\bat .*\(.*:\d+:\d+\)|ZodError|BundleError/)
    const [row] = await sql<{ bundle_file: string | null; status: string }>('select bundle_file, status from import_jobs where id = $1', [id])
    expect(row).toMatchObject({ status: 'rejected', bundle_file: null })
  }

  test('tampered content, wrong secret, wrong tenant, other academy’s file', async ({ page }) => {
    await loginImporter(page)
    const c = await createConnectionUi(page, DEMO)
    // One character changed inside a correctly signed bundle.
    const good = bundleFor(c, 'demo')
    const tampered = gzipSync(Buffer.from(gunzipSync(good).toString('utf8').replace('سارا', 'سارب'), 'utf8'))
    await rejected(page, DEMO, tampered, /امضا/)
    // Signed with a secret that is not the connection's.
    await rejected(page, DEMO, bundleFor(c, 'demo', site.records(), 'some-other-secret'), /امضا/)
    // Correct signature, but the manifest names the other academy.
    await rejected(page, DEMO, bundleFor(c, 'iba'), /آکادمی دیگری/)
    // A real connection and secret of the iba academy: valid there, refused here.
    await staffLogin(page, IBA, ibaStaff, '/staff/import')
    await page.waitForURL(`${IBA}/staff/import`)
    const ibaConn = await createConnectionUi(page, IBA) // the demo session stays valid: cookies are per host
    await rejected(page, DEMO, bundleFor(ibaConn, 'iba'), /برای این آکادمی ساخته نشده|آکادمی دیگری/)
  })

  test('not a bundle at all, and an empty file', async ({ page }) => {
    await loginImporter(page)
    await rejected(page, DEMO, Buffer.from('<?php echo 1; ?> plain text, not gzip'), /خروجی افزونهٔ ادوورا نیست/)
    await page.goto(`${DEMO}/staff/import`)
    await page.locator('input[name="bundle"]').setInputFiles({ name: 'empty.edvora-bundle', mimeType: 'application/gzip', buffer: Buffer.alloc(0) })
    await page.getByRole('button', { name: 'بارگذاری و بررسی' }).click()
    await expect(page.locator('body')).toContainText(/انتخاب کنید|فایل/)
    expect(page.url()).toBe(`${DEMO}/staff/import`)
  })

  test('a revoked connection’s bundle is refused', async ({ page }) => {
    await loginImporter(page)
    const c = await createConnectionUi(page, DEMO)
    await page.goto(`${DEMO}/staff/import/${c.jobId}`)
    await page.getByRole('button', { name: 'لغو اتصال' }).first().click()
    await expect.poll(async () => (await sql('select 1 from import_connections where connection_id = $1 and revoked_at is not null', [c.connectionId])).length).toBe(1)
    await rejected(page, DEMO, bundleFor(c, 'demo'), /لغو شده/)
  })

  test('an expired connection’s bundle is refused (W1: expires in 72 h)', async ({ page }) => {
    await loginImporter(page)
    const c = await createConnectionUi(page, DEMO)
    await sql("update import_connections set expires_at = now() - interval '1 hour' where connection_id = $1", [c.connectionId])
    // QA-E032-01: ingestBundle never checks expiry although REJECT_MESSAGES has connection_expired.
    test.fail(true, 'QA-E032-01: expired connections still accept bundle uploads')
    await rejected(page, DEMO, bundleFor(c, 'demo'), /منقضی/)
  })
})
