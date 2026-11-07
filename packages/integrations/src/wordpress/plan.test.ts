import { describe, expect, it } from 'vitest'
import { fieldsChecksum } from './checksum'
import { createMockSource, MOCK_SITE_ID, MOCK_TENANT } from './mock'
import { planImport } from './plan'
import type { EdvoraCollection, ImportPlan, ImportRef, PlanContext } from './types'

const NOW = new Date('2026-11-06T00:00:00Z')
/** Tutor is switched off below, so its product and the event ticket are marked "not a course". */
const SKIP = { '101': 'skip', '103': 'skip' } as const

/** In-memory stand-in for import-refs + the Edvora docs a commit would have written. */
function fakeEdvora() {
  const refs = new Map<string, ImportRef>()
  const docs = new Map<string, Record<string, unknown>>()
  return {
    refs,
    docs,
    ctx(extra: Partial<PlanContext> = {}): PlanContext {
      return {
        tenantSlug: MOCK_TENANT,
        siteId: MOCK_SITE_ID,
        enabledMappers: ['woocommerce', 'lifterlms'],
        now: NOW,
        findRef: async (kind, wpId) => refs.get(`${MOCK_SITE_ID}:${kind}:${wpId}`) ?? null,
        findUserByPhone: async () => null,
        currentChecksum: async (_c: EdvoraCollection, id, fields) => {
          const doc = docs.get(String(id))
          return doc ? fieldsChecksum(doc, fields) : null
        },
        ...extra,
      }
    },
    /** What apps/web does on commit: write docs and refs for create/update. */
    commit(plan: ImportPlan) {
      let n = 0
      for (const list of Object.values(plan.drafts)) {
        for (const d of list) {
          if (d.action !== 'create' && d.action !== 'update') continue
          const id = String(d.targetId ?? `doc${++n}-${d.refKey}`)
          docs.set(id, structuredClone(d.fields))
          refs.set(d.refKey, { targetId: id, status: 'linked', sourceChecksum: d.sourceChecksum, writtenChecksum: fieldsChecksum(d.fields, d.checksumFields) })
        }
      }
    },
  }
}

const count = (plan: ImportPlan, c: EdvoraCollection) => Object.fromEntries(Object.entries(plan.counts[c]).filter(([, n]) => n))

describe('planImport on the mock site', () => {
  it('reports the LifterLMS + Tutor conflict and the unmapped product as blocking', async () => {
    const plan = await planImport({ source: createMockSource(), ctx: { ...fakeEdvora().ctx(), enabledMappers: undefined } })
    expect(plan.detected).toEqual(['wp-core', 'woocommerce', 'lifterlms', 'tutor'])
    expect(plan.blocking).toBe(true)
    expect(plan.warnings.filter((w) => w.severity === 'blocking').map((w) => w.code)).toEqual(['lms_conflict', 'unmapped_product'])
  })

  it('plans counts, held users and warnings (golden)', async () => {
    const plan = await planImport({ source: createMockSource(), ctx: fakeEdvora().ctx({ productCourseOverrides: SKIP }) })
    expect(plan.mappers).toEqual(['wp-core', 'woocommerce', 'lifterlms'])
    expect(plan.blocking).toBe(false)
    expect(count(plan, 'users')).toEqual({ create: 4, held: 4 })
    expect(count(plan, 'courses')).toEqual({ create: 3 })
    expect(count(plan, 'lessons')).toEqual({ create: 5 })
    expect(count(plan, 'questions')).toEqual({ create: 3 })
    expect(count(plan, 'quizzes')).toEqual({ create: 1 })
    expect(count(plan, 'coupons')).toEqual({ create: 2, skipped: 1 })
    // 300, 301 line 2, 304 (guest matched by phone); 307 waits for its held user; lines of skipped products are counted.
    expect(count(plan, 'orders')).toEqual({ create: 3, held: 1 })
    expect(count(plan, 'enrollments')).toEqual({ create: 2, held: 2 })
    expect(count(plan, 'certificates')).toEqual({ create: 1 })
    expect(count(plan, 'media')).toEqual({ create: 2, skipped: 1 })
    expect(plan.heldUsers.map((u) => [u.wpId, u.reason, u.phone, u.duplicateOf])).toEqual([
      ['4', 'duplicate_phone', '09127778888', ['5']],
      ['5', 'duplicate_phone', '09127778888', ['4']],
      ['6', 'no_phone', null, []],
      ['7', 'no_phone', null, []],
    ])
    expect(plan.heldUsers.find((u) => u.wpId === '6')?.contactEmail).toBe('nophone@example.ir')
    expect(plan.staffUsers.map((s) => [s.wpId, s.wpRoles])).toEqual([
      ['1', ['administrator']],
      ['8', ['tutor_instructor']],
    ])
    // Woo price (precedence 20) beats the LifterLMS placeholder plan price.
    expect(plan.drafts.courses.find((c) => c.wpId === '1100')?.fields.price).toBe(84_700_000)
    expect(plan.drafts.orders.find((o) => o.wpId === '307#10')).toMatchObject({ action: 'held', reason: 'depends_on_held' })
    expect(plan.redirects).toContainEqual({ from: '/product/دوره-برندسازی', to: '/courses/دوره-برندسازی', code: 301, targetRefKey: `${MOCK_SITE_ID}:lifterlms.course:1100` })
    expect(plan.redirects.some((r) => r.from === r.to)).toBe(false)
    expect(plan.mediaToPull.map((m) => [m.wpId, m.needsHostApproval])).toEqual([
      ['50', false],
      ['52', true],
    ])
    expect(plan.notImported).toMatchObject({ 'woo.order:wc-pending': 1, 'woo.order:wc-cancelled': 1, 'lifterlms.order': 1, 'woo.order_line:not_a_course': 3 })
    // LMS enrollment wins over the membership-derived one; completed lessons are kept.
    expect(plan.drafts.enrollments.find((e) => e.wpId === '2>lifterlms.course:1100')?.fields.completedLessons).toHaveLength(2)
  })

  it('prunes soft refs to skipped drafts and never plans a delete', async () => {
    const plan = await planImport({ source: createMockSource(), ctx: fakeEdvora().ctx({ productCourseOverrides: SKIP }) })
    const all = Object.values(plan.drafts).flat()
    expect(all.every((d) => ['create', 'update', 'unchanged', 'conflict', 'held', 'skipped'].includes(d.action))).toBe(true)
    const post = plan.drafts.posts.find((p) => p.wpId === '60')
    expect(post?.fields.cover).toEqual({ $ref: `${MOCK_SITE_ID}:wp.attachment:50` })
  })

  it('writes Persian warnings with half-spaces, Persian letters and Persian digits for counts', async () => {
    const plan = await planImport({ source: createMockSource(), ctx: fakeEdvora().ctx() })
    for (const w of plan.warnings) {
      expect(w.message, w.code).not.toMatch(/[يك]/)
      expect(w.message, w.code).not.toMatch(/(^|\s)(می|نمی) /)
    }
    expect(plan.warnings.find((w) => w.code === 'duplicate_phone')?.message).toContain('۱ کاربر')
  })

  it('is idempotent: identical re-run is unchanged, Edvora edits become conflicts, WP edits become updates', async () => {
    const edvora = fakeEdvora()
    const first = await planImport({ source: createMockSource(), ctx: edvora.ctx({ productCourseOverrides: SKIP }) })
    edvora.commit(first)
    const again = await planImport({ source: createMockSource(), ctx: edvora.ctx({ productCourseOverrides: SKIP }) })
    for (const list of Object.values(again.drafts)) for (const d of list) expect(['unchanged', 'held', 'skipped']).toContain(d.action)

    // Admin edits the course title in Edvora; WP changes a lesson title.
    const courseRef = edvora.refs.get(`${MOCK_SITE_ID}:lifterlms.course:1100`)
    const doc = edvora.docs.get(String(courseRef?.targetId))
    if (doc) doc.title = 'عنوان ویرایش‌شده'
    const { mockRecords } = await import('./mock')
    const records = mockRecords.map((r) => (r.kind === 'lifterlms.course' && r.wpId === '1100') || (r.kind === 'lifterlms.lesson' && r.wpId === '1201') ? { ...r, data: { ...r.data, post_title: `${String(r.data.post_title)} (ویرایش)` } } : r)
    const third = await planImport({ source: createMockSource({ records }), ctx: edvora.ctx({ productCourseOverrides: SKIP }) })
    expect(third.drafts.courses.find((c) => c.wpId === '1100')).toMatchObject({ action: 'conflict', reason: 'edited_in_edvora' })
    expect(third.drafts.lessons.find((l) => l.wpId === '1201')?.action).toBe('update')
  })

  it('attaches an existing Edvora user found by phone without overwriting the profile', async () => {
    const plan = await planImport({ source: createMockSource(), ctx: fakeEdvora().ctx({ findUserByPhone: async (p) => (p === '09121234567' ? { id: 42 } : null) }) })
    expect(plan.drafts.users.find((u) => u.wpId === '2')).toMatchObject({ action: 'update', targetId: 42, attachTenantOnly: true, checksumFields: [] })
    expect(plan.warnings.some((w) => w.code === 'existing_user' && w.wpId === '2')).toBe(true)
  })

  it('refuses a bundle for another tenant or site', async () => {
    const plan = await planImport({ source: createMockSource(), ctx: fakeEdvora().ctx({ tenantSlug: 'demo', siteId: 'other' }) })
    expect(plan.warnings.filter((w) => w.severity === 'blocking').map((w) => w.code)).toEqual(expect.arrayContaining(['tenant_mismatch', 'site_mismatch']))
  })

  it('flags a manifest count that does not match the records', async () => {
    const plan = await planImport({ source: createMockSource({ manifest: { counts: { 'wp.user': 99, 'mec.event': 4 } } }), ctx: fakeEdvora().ctx() })
    expect(plan.warnings.find((w) => w.code === 'count_mismatch')).toMatchObject({ severity: 'blocking', kind: 'wp.user' })
    expect(plan.notImported['mec.event']).toBe(4)
  })

  it('reports a coupon code that already exists in Edvora as a conflict', async () => {
    const plan = await planImport({ source: createMockSource(), ctx: fakeEdvora().ctx({ findCouponByCode: async (c) => (c === 'NOROOZ' ? { id: 5 } : null) }) })
    expect(plan.drafts.coupons.find((c) => c.wpId === '200')).toMatchObject({ action: 'conflict', reason: 'coupon_code_exists', targetId: 5 })
  })
})
