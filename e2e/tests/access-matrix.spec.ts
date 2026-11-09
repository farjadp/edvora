import { randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { DEMO, login } from './helpers'
import { adminCreds, staffLogin, tenantId } from './staff-helpers'

/**
 * Access matrix (board E-041, docs/qa/access-matrix.md). Data-driven: one cast of users per access level in the `demo`
 * academy, created per run through the REST API as the seeded super admin (unique emails, passwords only in memory).
 * API-level checks first; a few UI checks at the end. Known bugs (docs/qa/bugs.md) are `test.fail` with the bug id,
 * so CI turns red when one is fixed and the marker must go.
 */

type Key =
  | 'academy-admin'
  | 'advisor'
  | 'instructor'
  | 'finance'
  | 'support'
  | 'content-editor'
  | 'instructor-scoped'
  | 'advisor-own'
  | 'multi-role'
  | 'expired'
  | 'suspended'
  | 'archived-role'
  | 'student'
  | 'student-other'

type Cast = { id: number; email: string; password: string; phone?: string }
type Doc = { id: number; [k: string]: unknown }

const STAFF: { key: Key; roles: string[]; scoped?: boolean; own?: boolean; expired?: boolean; suspended?: boolean; archived?: boolean }[] = [
  { key: 'academy-admin', roles: ['academy-admin'] },
  { key: 'advisor', roles: ['advisor'] },
  { key: 'instructor', roles: ['instructor'] },
  { key: 'finance', roles: ['finance'] },
  { key: 'support', roles: ['support'] },
  { key: 'content-editor', roles: ['content-editor'] },
  { key: 'instructor-scoped', roles: ['instructor'], scoped: true },
  { key: 'advisor-own', roles: ['advisor'], own: true },
  { key: 'multi-role', roles: ['advisor', 'content-editor'] },
  { key: 'expired', roles: ['academy-admin'], expired: true },
  { key: 'suspended', roles: ['academy-admin'], suspended: true },
  { key: 'archived-role', roles: [], archived: true },
]

const suffix = randomBytes(3).toString('hex')
const pw = () => `pw-${randomBytes(12).toString('hex')}`
const phone = () => `0912999${String(randomBytes(2).readUInt16BE(0) % 10_000).padStart(4, '0')}`

let admin: APIRequestContext
const cast = {} as Record<Key, Cast>
const api = {} as Record<Key, APIRequestContext>
const ref = {} as {
  demo: number
  demo2: number
  roles: Record<string, number>
  course: number
  cohort: number | null
  outCourse: number
  lessonIn: number
  lessonOut: number
  demo2Lead: number
  leadAdvisor: number
  leadOwn: number
  orders: Partial<Record<Key, number>>
  enrollments: Partial<Record<Key, number>>
}

async function ok<T = Doc>(res: Awaited<ReturnType<APIRequestContext['get']>>, what: string): Promise<T> {
  expect(res.ok(), `${what}: ${res.status()} ${res.ok() ? '' : await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}
const docs = async (a: APIRequestContext, path: string) => (await ok<{ docs: Doc[] }>(await a.get(path), path)).docs
async function findOrCreate(path: string, where: string, data: Record<string, unknown>): Promise<Doc> {
  const found = await docs(admin, `/api/${path}?${where}&limit=1&depth=0`)
  if (found[0]) return found[0]
  return (await ok<{ doc: Doc }>(await admin.post(`/api/${path}`, { data }), `create ${path}`)).doc
}
async function createUser(key: Key, data: Record<string, unknown>): Promise<Cast> {
  const u = { email: `e2e-access-${key}-${suffix}@example.test`, password: pw() }
  const created = await ok<{ doc: Doc }>(await admin.post('/api/users', { data: { ...u, name: `تست دسترسی ${key}`, tenants: [{ tenant: ref.demo }], ...data } }), `create ${key}`)
  return { id: created.doc.id, ...u, phone: data.phone as string | undefined }
}
async function signIn(playwright: { request: { newContext: (o: { baseURL: string }) => Promise<APIRequestContext> } }, c: Cast): Promise<{ ctx: APIRequestContext; status: number }> {
  const ctx = await playwright.request.newContext({ baseURL: DEMO })
  const res = await ctx.post('/api/users/login', { data: { email: c.email, password: c.password } })
  return { ctx, status: res.status() }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(240_000)
  const { email, password } = adminCreds()
  admin = await playwright.request.newContext({ baseURL: DEMO })
  await ok(await admin.post('/api/users/login', { data: { email, password } }), 'super admin login')
  ref.demo = await tenantId(admin, 'demo')
  ref.roles = Object.fromEntries((await docs(admin, `/api/roles?where[tenant][equals]=${ref.demo}&limit=100&depth=0`)).map((r) => [r.key as string, r.id]))
  ref.course = (await docs(admin, `/api/courses?where[and][0][tenant][equals]=${ref.demo}&where[and][1][slug][equals]=demo-program&limit=1&depth=0`))[0]!.id
  ref.cohort = (await docs(admin, `/api/cohorts?where[course][equals]=${ref.course}&limit=1&depth=0`))[0]?.id ?? null
  ref.lessonIn = (await docs(admin, `/api/lessons?where[course][equals]=${ref.course}&limit=1&depth=0`))[0]!.id
  // A draft course outside the scoped instructor's scope, and a second academy for cross-academy checks.
  const out = await findOrCreate('courses', `where[and][0][tenant][equals]=${ref.demo}&where[and][1][slug][equals]=access-scope-course`, { tenant: ref.demo, title: 'دورهٔ تست دسترسی (خارج از محدوده)', slug: 'access-scope-course', kind: 'program', status: 'draft', price: 10_000_000 })
  ref.outCourse = out.id
  ref.lessonOut = (await findOrCreate('lessons', `where[course][equals]=${out.id}`, { tenant: ref.demo, course: out.id, title: 'جلسهٔ تست دسترسی', order: 1 })).id
  ref.demo2 = (await findOrCreate('tenants', 'where[slug][equals]=demo2', { name: 'آکادمی تست دوم', slug: 'demo2', domains: [{ domain: 'demo2.localhost' }] })).id
  // The lead needs an owner inside demo2: an empty advisor defaults to the creator (the super admin, not in demo2).
  const demo2Owner = await findOrCreate('users', 'where[email][equals]=e2e-access-demo2-owner@example.test', { email: 'e2e-access-demo2-owner@example.test', password: pw(), name: 'مالک سرنخ آکادمی دوم', tenants: [{ tenant: ref.demo2 }] })
  ref.demo2Lead = (await findOrCreate('leads', `where[and][0][tenant][equals]=${ref.demo2}&where[and][1][phone][equals]=09129990299`, { tenant: ref.demo2, name: 'سرنخ آکادمی دوم (تست)', phone: '09129990299', status: 'new', advisor: demo2Owner.id })).id

  // Archived role: assigned while active, archived afterwards (memberships cannot pick an archived role).
  const archivedRole = (await ok<{ doc: Doc }>(await admin.post('/api/roles', { data: { tenant: ref.demo, key: `e2e-archived-${suffix}`, name: 'نقش بایگانی تست', permissions: ['leads.view.all', 'orders.view', 'users.view'] } }), 'archived role')).doc.id

  for (const s of STAFF) {
    const c = await createUser(s.key, {})
    cast[s.key] = c
    const roles = s.archived ? [archivedRole] : s.roles.map((k) => ref.roles[k]!)
    await ok(
      await admin.post('/api/memberships', {
        data: {
          tenant: ref.demo,
          user: c.id,
          roles,
          status: 'active',
          expiresAt: s.expired ? new Date(Date.now() - 86_400_000).toISOString() : null,
          scope: { courses: s.scoped ? [ref.course] : [], cohorts: s.scoped && ref.cohort ? [ref.cohort] : [], ownRecordsOnly: Boolean(s.own) },
        },
      }),
      `membership ${s.key}`,
    )
    if (s.suspended) await ok(await admin.patch(`/api/users/${c.id}`, { data: { status: 'suspended' } }), 'suspend')
  }
  await ok(await admin.patch(`/api/roles/${archivedRole}`, { data: { archived: true } }), 'archive role')

  ref.orders = {}
  ref.enrollments = {}
  for (const key of ['student', 'student-other'] as const) {
    const c = await createUser(key, { roles: ['student'], phone: phone(), nationalCode: '0000000000', internalNotes: 'یادداشت داخلی تست' })
    cast[key] = c
    // ACC-02: the server prices the order and it starts pending (only the payment flow marks it paid).
    ref.orders[key] = (await ok<{ doc: Doc }>(await admin.post('/api/orders', { data: { tenant: ref.demo, user: c.id, course: ref.course, cohort: ref.cohort } }), 'order')).doc.id
    ref.enrollments[key] = (await ok<{ doc: Doc }>(await admin.post('/api/enrollments', { data: { tenant: ref.demo, user: c.id, course: ref.course, cohort: ref.cohort, status: 'active' } }), 'enrollment')).doc.id
  }
  const lead = async (advisor: Key, name: string) => (await ok<{ doc: Doc }>(await admin.post('/api/leads', { data: { tenant: ref.demo, name, phone: phone(), course: ref.course, status: 'contacted', nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(), advisor: cast[advisor].id } }), 'lead')).doc.id
  ref.leadAdvisor = await lead('advisor', 'سرنخ مشاور (تست دسترسی)')
  ref.leadOwn = await lead('advisor-own', 'سرنخ مشاور فقط خودش (تست دسترسی)')

  for (const key of Object.keys(cast) as Key[]) {
    const { ctx, status } = await signIn(playwright, cast[key])
    api[key] = ctx
    if (key === 'suspended') expect(status, 'suspended login').toBe(403)
    else expect(status, `${key} login`).toBe(200)
  }
})

test.afterAll(async () => {
  for (const a of Object.values(api)) await a.dispose()
  await admin?.dispose()
})

// ------------------------------------------------------------------ 1. collection reads
/** all = sees other people's rows · own = only own rows · none = 403 or nothing. */
type Read = 'all' | 'own' | 'none'
const READ: Record<string, Partial<Record<Key, Read>>> = {
  leads: { 'academy-admin': 'all', advisor: 'own', 'advisor-own': 'own', 'multi-role': 'own', instructor: 'none', finance: 'none', support: 'none', 'content-editor': 'none', expired: 'none', suspended: 'none', 'archived-role': 'none', student: 'none' },
  orders: { 'academy-admin': 'all', finance: 'all', advisor: 'none', instructor: 'none', support: 'none', 'content-editor': 'none', expired: 'none', 'archived-role': 'none', student: 'own' },
  coupons: { 'academy-admin': 'all', finance: 'all', advisor: 'none', support: 'none', instructor: 'none', student: 'none', expired: 'none' },
  'audit-logs': { 'academy-admin': 'all', advisor: 'none', finance: 'none', support: 'none', 'content-editor': 'none', student: 'none', expired: 'none' },
  roles: { 'academy-admin': 'all', advisor: 'none', instructor: 'none', finance: 'none', support: 'none', 'content-editor': 'none', student: 'none', expired: 'none', 'archived-role': 'none' },
  users: { 'academy-admin': 'all', advisor: 'all', finance: 'all', support: 'all', instructor: 'own', 'content-editor': 'own', 'instructor-scoped': 'own', expired: 'own', 'archived-role': 'own', student: 'own' },
  enrollments: { 'academy-admin': 'all', advisor: 'all', instructor: 'all', 'instructor-scoped': 'all', finance: 'all', support: 'all', 'content-editor': 'none', expired: 'none', 'archived-role': 'none', student: 'own' },
  'import-connections': { 'academy-admin': 'all', advisor: 'none', finance: 'none', student: 'none' },
  'otp-codes': { 'academy-admin': 'none', advisor: 'none', student: 'none' },
}
const ownerOf = (collection: string, d: Doc) => (collection === 'users' ? d.id : (d.user as number | undefined) ?? (d.advisor as number | undefined))

for (const [collection, row] of Object.entries(READ)) {
  for (const [key, expected] of Object.entries(row) as [Key, Read][]) {
    test(`read ${collection} as ${key} → ${expected}`, async () => {
      const res = await api[key].get(`/api/${collection}?limit=200&depth=0`)
      const list = res.ok() ? ((await res.json()) as { docs: Doc[] }).docs : []
      const others = list.filter((d) => ownerOf(collection, d) !== cast[key].id)
      if (expected === 'none') expect(list.length, `${key} sees ${collection}`).toBe(0)
      if (expected === 'own') expect(others.length, `${key} sees other people's ${collection}`).toBe(0)
      if (expected === 'all') expect(others.length, `${key} should see ${collection}`).toBeGreaterThan(0)
    })
  }
}

// ------------------------------------------------------------------ 2. staff desks
const DESKS = ['overview', 'leads', 'finance', 'students', 'teaching', 'support', 'content'] as const
const DESK_OK: Partial<Record<Key, readonly string[]>> = {
  'academy-admin': DESKS,
  advisor: ['leads', 'students'],
  'advisor-own': ['leads', 'students'],
  instructor: ['teaching'],
  'instructor-scoped': ['teaching'],
  finance: ['finance', 'students'],
  support: ['students', 'support'],
  'content-editor': ['content'],
  'multi-role': ['leads', 'students', 'content'],
  expired: [],
  'archived-role': [],
  student: [],
}
for (const [key, allowed] of Object.entries(DESK_OK) as [Key, readonly string[]][]) {
  test(`staff desks as ${key}: ${allowed.join(', ') || 'none'}`, async () => {
    for (const d of DESKS) {
      const res = await api[key].get(`/staff/${d}`, { maxRedirects: 0 })
      expect(res.status(), `/staff/${d}`).toBe(allowed.includes(d) ? 200 : 403)
    }
  })
}

test('suspended staff: desks and API send them to login', async () => {
  expect([302, 303, 307]).toContain((await api.suspended.get('/staff/overview', { maxRedirects: 0 })).status())
  expect((await api.suspended.get('/api/leads?limit=1')).status()).toBe(403)
})

// ------------------------------------------------------------------ 3. scope, IDOR, other academy
test('leads: advisor sees only own lead; academy admin sees both; nobody in demo sees the demo2 lead', async () => {
  const seen = async (k: Key) => (await docs(api[k], '/api/leads?limit=200&depth=0')).map((l) => l.id)
  expect(await seen('advisor')).toContain(ref.leadAdvisor)
  expect(await seen('advisor')).not.toContain(ref.leadOwn)
  expect(await seen('advisor-own')).toEqual(expect.arrayContaining([ref.leadOwn]))
  expect(await seen('advisor-own')).not.toContain(ref.leadAdvisor)
  expect(await seen('academy-admin')).toEqual(expect.arrayContaining([ref.leadAdvisor, ref.leadOwn]))
  for (const k of ['academy-admin', 'advisor', 'finance'] as const) {
    expect([403, 404], `${k} reads demo2 lead`).toContain((await api[k].get(`/api/leads/${ref.demo2Lead}?depth=0`)).status())
    expect([403, 404], `${k} edits demo2 lead`).toContain((await api[k].patch(`/api/leads/${ref.demo2Lead}`, { data: { message: 'x' } })).status())
    expect([400, 403], `${k} creates in demo2`).toContain((await api[k].post('/api/leads', { data: { tenant: ref.demo2, name: 'x', phone: phone(), status: 'new' } })).status())
  }
  expect([403, 404], 'advisor edits another advisor lead').toContain((await api['advisor-own'].patch(`/api/leads/${ref.leadAdvisor}`, { data: { message: 'x' } })).status())
})

test('students: own order/enrollment yes, the other student’s no (IDOR)', async () => {
  const s = api.student
  expect((await s.get(`/api/orders/${ref.orders.student}?depth=0`)).status()).toBe(200)
  expect((await s.get(`/api/enrollments/${ref.enrollments.student}?depth=0`)).status()).toBe(200)
  expect((await s.get(`/api/orders/${ref.orders['student-other']}?depth=0`)).status()).toBe(404)
  expect((await s.get(`/api/enrollments/${ref.enrollments['student-other']}?depth=0`)).status()).toBe(404)
  expect((await s.get(`/api/users/${cast['student-other'].id}?depth=0`)).status()).toBe(404)
  expect((await s.patch(`/api/orders/${ref.orders.student}`, { data: { status: 'refunded' } })).status()).toBe(403)
  expect((await s.post('/api/enrollments', { data: { tenant: ref.demo, user: cast.student.id, course: ref.outCourse, status: 'active' } })).status()).toBe(403)
})

test('scoped instructor: edits lessons of the scoped course only', async () => {
  expect((await api['instructor-scoped'].patch(`/api/lessons/${ref.lessonIn}`, { data: { durationMinutes: 20 } })).status()).toBe(200)
  expect([403, 404]).toContain((await api['instructor-scoped'].patch(`/api/lessons/${ref.lessonOut}`, { data: { durationMinutes: 20 } })).status())
})

test('sensitive fields: only users.view_sensitive and the person see the national code; internal notes staff-only', async () => {
  const fields = async (k: Key) => {
    const r = await api[k].get(`/api/users/${cast.student.id}?depth=0`)
    return r.ok() ? Object.keys((await r.json()) as Doc) : null
  }
  expect(await fields('academy-admin')).toEqual(expect.arrayContaining(['nationalCode', 'internalNotes']))
  for (const k of ['advisor', 'finance', 'support'] as const) {
    const f = await fields(k)
    expect(f, k).not.toBeNull()
    expect(f, k).not.toContain('nationalCode')
    expect(f, k).not.toContain('internalNotes')
    expect(f, k).not.toContain('twoFactor')
  }
  const self = await fields('student')
  expect(self).toContain('nationalCode')
  expect(self).not.toContain('internalNotes')
})

test('content editor: edits course text, cannot publish or change price', async () => {
  const c = api['content-editor']
  expect((await c.patch(`/api/courses/${ref.outCourse}`, { data: { summary: 'خلاصهٔ تست' } })).status()).toBe(200)
  expect((await c.patch(`/api/courses/${ref.outCourse}`, { data: { status: 'published' } })).status()).toBe(403)
  expect((await c.patch(`/api/courses/${ref.outCourse}`, { data: { price: 12_000_000 } })).status()).toBe(403)
})

// ------------------------------------------------------------------ 4. escalation
test('escalation: nobody promotes themselves or grants more than they hold', async ({ playwright }) => {
  for (const k of ['advisor', 'academy-admin', 'student'] as const) {
    await api[k].patch(`/api/users/${cast[k].id}`, { data: { roles: ['super-admin'], tenants: [{ tenant: ref.demo }, { tenant: ref.demo2 }] } })
    const u = await ok<Doc>(await admin.get(`/api/users/${cast[k].id}?depth=0`), 'reload')
    expect(u.roles, `${k} roles`).not.toContain('super-admin')
    expect((u.tenants as { tenant: number }[]).map((t) => t.tenant), `${k} academies`).not.toContain(ref.demo2)
    expect([400, 403], `${k} own membership`).toContain((await api[k].post('/api/memberships', { data: { tenant: ref.demo, user: cast[k].id, roles: [ref.roles['academy-admin']], status: 'active' } })).status())
    // 403 (own status) or 409 (last role manager of the academy, checked first) — both refuse.
    expect([403, 409], `${k} own status`).toContain((await api[k].patch(`/api/users/${cast[k].id}`, { data: { status: 'archived' } })).status())
  }
  expect((await api.advisor.post('/api/roles', { data: { tenant: ref.demo, key: `e2e-x-${suffix}`, name: 'x', permissions: ['leads.view.all'] } })).status()).toBe(403)
  expect((await api['academy-admin'].post('/api/roles', { data: { tenant: ref.demo, key: `e2e-p-${suffix}`, name: 'x', permissions: ['tenants.manage'] } })).status()).toBe(400)
  const superId = (await docs(admin, '/api/users?where[roles][contains]=super-admin&limit=1&depth=0'))[0]!.id
  // ACC-05: the platform admin is not even visible inside the academy, so the edit finds nothing.
  expect([403, 404]).toContain((await api['academy-admin'].patch(`/api/users/${superId}`, { data: { name: 'x' } })).status())

  // A role assigner with a narrow set can grant only what they hold.
  const assignerRole = (await ok<{ doc: Doc }>(await admin.post('/api/roles', { data: { tenant: ref.demo, key: `e2e-assigner-${suffix}`, name: 'واگذارکننده', permissions: ['roles.assign', 'roles.view', 'users.create', 'users.view', 'leads.view.own'] } }), 'assigner role')).doc.id
  const narrow = (await ok<{ doc: Doc }>(await admin.post('/api/roles', { data: { tenant: ref.demo, key: `e2e-narrow-${suffix}`, name: 'محدود', permissions: ['leads.view.own'] } }), 'narrow role')).doc.id
  const assigner = { email: `e2e-access-assigner-${suffix}@example.test`, password: pw() }
  const au = (await ok<{ doc: Doc }>(await admin.post('/api/users', { data: { ...assigner, name: 'واگذارکننده', tenants: [{ tenant: ref.demo }] } }), 'assigner')).doc.id
  await ok(await admin.post('/api/memberships', { data: { tenant: ref.demo, user: au, roles: [assignerRole], status: 'active' } }), 'assigner membership')
  const target = (await ok<{ doc: Doc }>(await admin.post('/api/users', { data: { email: `e2e-access-target-${suffix}@example.test`, password: pw(), name: 'هدف', tenants: [{ tenant: ref.demo }] } }), 'target')).doc.id
  const ctx = await playwright.request.newContext({ baseURL: DEMO })
  await ok(await ctx.post('/api/users/login', { data: assigner }), 'assigner login')
  expect((await ctx.post('/api/memberships', { data: { tenant: ref.demo, user: target, roles: [ref.roles['academy-admin']], status: 'active' } })).status()).toBe(403)
  expect((await ctx.post('/api/memberships', { data: { tenant: ref.demo, user: target, roles: [ref.roles.advisor], status: 'active' } })).status()).toBe(403)
  expect((await ctx.post('/api/memberships', { data: { tenant: ref.demo, user: target, roles: [narrow], status: 'active' } })).status()).toBe(201)
  await ctx.dispose()
})

// ------------------------------------------------------------------ 5. lifecycle (same token, next request)
test('lifecycle: suspend, expiry, membership suspend, role archive and role change take effect on the next request', async ({ playwright }) => {
  const probe = async (c: APIRequestContext) => [(await c.get('/api/audit-logs?limit=1&depth=0')).status(), (await c.get('/staff/overview', { maxRedirects: 0 })).status()]
  const fresh = async (label: Key, roleId: number) => {
    const u = { email: `e2e-access-life-${label}-${randomBytes(3).toString('hex')}@example.test`, password: pw() }
    const id = (await ok<{ doc: Doc }>(await admin.post('/api/users', { data: { ...u, name: 'چرخهٔ عمر', tenants: [{ tenant: ref.demo }] } }), 'life user')).doc.id
    const m = (await ok<{ doc: Doc }>(await admin.post('/api/memberships', { data: { tenant: ref.demo, user: id, roles: [roleId], status: 'active' } }), 'life membership')).doc.id
    const { ctx } = await signIn(playwright, { id, ...u })
    expect(await probe(ctx)).toEqual([200, 200])
    return { id, m, ctx }
  }
  const adminRole = ref.roles['academy-admin']!
  let x = await fresh('suspended', adminRole)
  await admin.patch(`/api/users/${x.id}`, { data: { status: 'suspended' } })
  expect((await probe(x.ctx))[0], 'after suspend').toBe(403)
  await x.ctx.dispose()

  x = await fresh('expired', adminRole)
  await admin.patch(`/api/memberships/${x.m}`, { data: { expiresAt: new Date(Date.now() - 60_000).toISOString() } })
  expect(await probe(x.ctx), 'after expiry').toEqual([403, 403])
  await x.ctx.dispose()

  x = await fresh('expired', adminRole)
  await admin.patch(`/api/memberships/${x.m}`, { data: { status: 'suspended' } })
  expect(await probe(x.ctx), 'after membership suspend').toEqual([403, 403])
  await x.ctx.dispose()

  const role = (await ok<{ doc: Doc }>(await admin.post('/api/roles', { data: { tenant: ref.demo, key: `e2e-life-${randomBytes(3).toString('hex')}`, name: 'چرخه', permissions: ['audit.view', 'roles.manage'] } }), 'life role')).doc.id
  x = await fresh('archived-role', role)
  await admin.patch(`/api/roles/${role}`, { data: { archived: true } })
  expect(await probe(x.ctx), 'after archive').toEqual([403, 403])
  await x.ctx.dispose()

  x = await fresh('advisor', adminRole)
  await admin.patch(`/api/memberships/${x.m}`, { data: { roles: [ref.roles.advisor] } })
  expect(await probe(x.ctx), 'after role change').toEqual([403, 403])
  await x.ctx.dispose()
})

// ------------------------------------------------------------------ 6. fixed bugs (docs/qa/bugs.md ACC-01…05)
test('ACC-01: users cannot write their own staff-only fields (internalNotes, tags)', async () => {
  for (const k of ['student', 'advisor', 'academy-admin'] as const) {
    await api[k].patch(`/api/users/${cast[k].id}`, { data: { internalNotes: 'self-edit', tags: ['vip'], source: 'manual', statusReason: 'self', publicProfile: { showOnSite: true } } })
    const u = await ok<Doc>(await admin.get(`/api/users/${cast[k].id}?depth=0`), 'reload')
    expect(u.internalNotes ?? null, k).not.toBe('self-edit')
    expect(u.tags ?? [], k).not.toContain('vip')
    expect(u.statusReason ?? null, k).not.toBe('self')
    expect((u.publicProfile as { showOnSite?: boolean } | undefined)?.showOnSite ?? false, k).toBe(false)
  }
  const s = await ok<Doc>(await admin.get(`/api/users/${cast.student.id}?depth=0`), 'reload student')
  expect(s.internalNotes).toBe('یادداشت داخلی تست')
  // Staff with users.edit can still write them for someone else.
  await ok(await api['academy-admin'].patch(`/api/users/${cast['student-other'].id}`, { data: { tags: ['staff-tag'] } }), 'staff tags')
  expect((await ok<Doc>(await admin.get(`/api/users/${cast['student-other'].id}?depth=0`), 'reload other')).tags).toContain('staff-tag')
})

test('ACC-02: an advisor cannot create an order that is already paid', async () => {
  const res = await api.advisor.post('/api/orders', { data: { tenant: ref.demo, user: cast['student-other'].id, course: ref.outCourse, subtotal: 10_000_000, discount: 10_000_000, total: 0, status: 'paid' } })
  const doc = res.ok() ? ((await res.json()) as { doc: Doc }).doc : null
  if (doc) await admin.patch(`/api/orders/${doc.id}`, { data: { status: 'cancelled' } })
  expect(doc?.status ?? 'refused').not.toBe('paid')
  // Amounts sent by the caller are ignored: the server prices from the course, and a discount needs a coupon.
  const priced = await ok<{ doc: Doc }>(await api.advisor.post('/api/orders', { data: { tenant: ref.demo, user: cast['student-other'].id, course: ref.outCourse, subtotal: 1, total: 1 } }), 'advisor pending order')
  expect(priced.doc).toMatchObject({ status: 'pending', subtotal: 10_000_000, discount: 0, total: 10_000_000 })
  expect(((await api.advisor.post('/api/orders', { data: { tenant: ref.demo, user: cast['student-other'].id, course: ref.outCourse, discount: 5_000_000 } })).status())).toBe(400)
  expect((await api.advisor.post('/api/orders', { data: { tenant: ref.demo, user: cast['student-other'].id, course: ref.outCourse, couponCode: 'NO-SUCH-CODE' } })).status()).toBe(400)
  expect((await api.finance.post('/api/orders', { data: { tenant: ref.demo, user: cast['student-other'].id, course: ref.outCourse, couponCode: 'ANY' } })).status()).toBe(403)
  await ok(await admin.patch(`/api/orders/${priced.doc.id}`, { data: { status: 'cancelled' } }), 'cancel priced order')
})

test('ACC-03: order status/total change only through the payment flow (four-eyes)', async () => {
  const o = (await ok<{ doc: Doc }>(await admin.post('/api/orders', { data: { tenant: ref.demo, user: cast['student-other'].id, course: ref.outCourse, subtotal: 10_000_000, total: 10_000_000, status: 'pending' } }), 'pending order')).doc.id
  const res = await api.finance.patch(`/api/orders/${o}`, { data: { status: 'paid', total: 1 } })
  expect(res.status()).toBe(403)
  expect((await api.finance.patch(`/api/orders/${o}`, { data: { total: 1 } })).status()).toBe(403)
  expect((await api['academy-admin'].patch(`/api/orders/${o}`, { data: { status: 'paid' } })).status()).toBe(403)
  expect((await admin.patch(`/api/orders/${o}`, { data: { instalments: [] } })).status(), 'platform admin too').toBe(403)
  const after = await ok<Doc>(await admin.get(`/api/orders/${o}?depth=0`), 'reload order')
  expect(after).toMatchObject({ status: 'pending', total: 10_000_000 })
  // Cancelling an unpaid order is still a normal edit.
  await ok(await api.finance.patch(`/api/orders/${o}`, { data: { status: 'cancelled' } }), 'finance cancels')
  expect((await api.finance.patch(`/api/orders/${o}`, { data: { status: 'pending' } })).status()).toBe(403)
})

test('ACC-04: anonymous REST cannot read draft courses or other academies’ drafts', async ({ request }) => {
  expect([403, 404]).toContain((await request.get(`${DEMO}/api/courses/${ref.outCourse}?depth=0`)).status())
  const courses = ((await (await request.get(`${DEMO}/api/courses?limit=200&depth=0`)).json()) as { docs: Doc[] }).docs
  expect(courses.length, 'published courses stay public').toBeGreaterThan(0)
  expect(courses.filter((c) => c.status !== 'published')).toEqual([])
  expect([403, 404]).toContain((await request.get(`${DEMO}/api/lessons/${ref.lessonOut}?depth=0`)).status())
  const outline = ((await (await request.get(`${DEMO}/api/lessons?where[course][equals]=${ref.outCourse}&depth=0`)).json()) as { docs: Doc[] }).docs
  expect(outline).toEqual([])
  expect((await request.get(`${DEMO}/api/lessons/${ref.lessonIn}?depth=0`)).status(), 'lesson of a published course').toBe(200)
  // Staff with courses.view still see the draft and its lessons.
  expect((await api.finance.get(`/api/courses/${ref.outCourse}?depth=0`)).status()).toBe(200)
  expect((await api['content-editor'].get(`/api/lessons/${ref.lessonOut}?depth=0`)).status()).toBe(200)
  // The public course page still renders.
  expect((await request.get(`${DEMO}/courses/demo-program`)).status()).toBe(200)
})

test('ACC-05: academy staff do not see the Edvora platform admin', async () => {
  for (const k of ['advisor', 'finance', 'support', 'academy-admin'] as const) {
    expect(await docs(api[k], '/api/users?where[roles][contains]=super-admin&limit=10&depth=0'), k).toEqual([])
  }
  expect((await docs(admin, '/api/users?where[roles][contains]=super-admin&limit=1&depth=0')).length, 'platform admin sees platform admins').toBeGreaterThan(0)
})

// ------------------------------------------------------------------ 7. UI
test('UI: advisor lands on the leads desk; expired staff gets the 403 page', async ({ page }) => {
  await staffLogin(page, DEMO, cast.advisor, '/staff')
  await page.waitForURL(/\/staff\/leads/)
  await page.context().clearCookies()
  await staffLogin(page, DEMO, cast.expired)
  await page.waitForURL((u) => !u.pathname.includes('/staff/login'))
  const res = await page.request.get(`${DEMO}/staff/overview`, { maxRedirects: 0 })
  expect(res.status()).toBe(403)
})

test('UI E-015: lead pool — advisor has the «بی‌مشاور» tab, advisor with ownRecordsOnly does not', async ({ page }) => {
  await staffLogin(page, DEMO, cast.advisor, '/staff/leads')
  await page.waitForURL(/\/staff\/leads/)
  await expect(page.getByTestId('crm-tab-pool')).toBeVisible()
  await expect(page.getByTestId('crm-tab-team')).toHaveCount(0)
  await page.context().clearCookies()
  await staffLogin(page, DEMO, cast['advisor-own'], '/staff/leads?v=pool')
  await page.waitForURL(/\/staff\/leads/)
  await expect(page.getByTestId('crm-tab-pool')).toHaveCount(0)
  await expect(page.getByTestId('crm-list')).toContainText('این نما برای شما باز نیست.')
  await page.context().clearCookies()
  await staffLogin(page, DEMO, cast['academy-admin'], '/staff/leads?v=team')
  await page.waitForURL(/\/staff\/leads/)
  await expect(page.getByTestId('crm-tab-team')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('crm-tab-pool')).toBeVisible()
})

test('UI: a new student signs in by SMS, sees the dashboard, and is sent away from a course they did not buy', async ({ page }) => {
  const p = phone()
  await login(page, DEMO, p)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto(`${DEMO}/learn/demo-program`)
  await expect(page).toHaveURL(/\/courses\/demo-program/)
  expect((await page.request.get(`${DEMO}/staff/overview`, { maxRedirects: 0 })).status()).not.toBe(200)
})
