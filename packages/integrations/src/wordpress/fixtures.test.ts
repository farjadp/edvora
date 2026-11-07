/**
 * Contract test against bundles exported by the real PHP plugin from docker WordPress
 * (integrations/wordpress-dev/export-fixture.sh): WP 5.7/PHP 7.4 legacy orders and latest/HPOS.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BundleError } from './bundle'
import { planImport } from './plan'
import { BundleSource } from './sources'
import type { PlanContext } from './types'

const SECRET = 'edvora-fixture-secret'
const load = (name: string) => readFileSync(new URL(`./fixtures/${name}.edvora-bundle`, import.meta.url))
const actions = (counts: Record<string, Record<string, number>>) =>
  Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, n]) => n))]))

// The two exports differ only in ids (HPOS store) and one extra page.
const CASES = [
  { name: 'sample-wp57', ids: { brandProduct: '40', brandCourse: '16', order: 45, refunded: 47, fractional: 52, workshop: '51' }, pages: 10, redirects: 27 },
  { name: 'sample-latest', ids: { brandProduct: '50', brandCourse: '26', order: 55, refunded: 57, fractional: 62, workshop: '61' }, pages: 11, redirects: 28 },
] as const

describe.each(CASES)('plugin fixture $name', ({ name, ids, pages, redirects }) => {
  const ctx = (siteId: string, extra: Partial<PlanContext> = {}): PlanContext => ({
    tenantSlug: 'demo',
    siteId,
    findRef: async () => null,
    findUserByPhone: async () => null,
    currentChecksum: async () => null,
    now: new Date('2026-11-07T00:00:00Z'),
    ...extra,
  })

  it('verifies with the fixture secret only', async () => {
    await expect(BundleSource.open(load(name), 'wrong')).rejects.toBeInstanceOf(BundleError)
    const m = await (await BundleSource.open(load(name), SECRET)).manifest()
    expect(m).toMatchObject({ tenantSlug: 'demo', connectionId: 'cnx_fixture', woo: { currency: 'IRT' }, lifterlms: { currency: 'IRR' } })
  })

  it('plans the whole site (golden counts)', async () => {
    const source = await BundleSource.open(load(name), SECRET)
    const siteId = (await source.manifest()).site.siteId
    const first = await planImport({ source, ctx: ctx(siteId) })
    // LifterLMS + Tutor are both active and one product needs an operator mapping → blocking.
    expect(first.warnings.filter((w) => w.severity === 'blocking').map((w) => w.code).sort()).toEqual(['lms_conflict', 'unmapped_product', 'unmapped_product'])
    const brand = first.productCourseMap.find((l) => l.productWpId === ids.brandProduct)
    expect(brand).toMatchObject({ method: 'unmapped', hint: 'similar', candidates: [{ refKey: `${siteId}:lifterlms.course:${ids.brandCourse}` }] })

    const plan = await planImport({ source, ctx: ctx(siteId, { productCourseOverrides: { [ids.brandProduct]: { course: `${siteId}:lifterlms.course:${ids.brandCourse}` } } }) })
    expect(actions(plan.counts)).toEqual({
      users: { create: 9, held: 4 },
      media: { create: 1 },
      courses: { create: 3 },
      lessons: { create: 6 },
      questions: { create: 5 },
      quizzes: { create: 2 },
      coupons: { create: 2 },
      orders: { create: 3, held: 3 },
      enrollments: { create: 8 },
      certificates: {},
      posts: { create: 4 },
      pages: { create: pages },
      redirects: { create: redirects },
    })
    expect(plan.heldUsers.map((u) => [u.wpId, u.reason])).toEqual([
      ['1', 'no_phone'],
      ['7', 'no_phone'],
      ['8', 'duplicate_phone'],
      ['9', 'duplicate_phone'],
    ])
    const order = (wpId: number) => plan.drafts.orders.filter((o) => o.wpId.startsWith(`${wpId}#`))
    // HPOS "18760000.00000000" IRT → integer rials.
    expect(order(ids.order)[0]?.fields).toMatchObject({ total: 187_600_000, status: 'paid' })
    // The refund row folds into its parent; it is never an order of its own.
    expect(order(ids.refunded).map((o) => o.fields.status)).toEqual(['refunded'])
    expect(order(ids.refunded + 1)).toEqual([])
    expect(plan.notImported['woo.order:refund_folded']).toBe(1)
    // 1234567.50 toman = 12,345,675 rials exactly (not fractional); held until the workshop product is mapped.
    expect(order(ids.fractional)[0]).toMatchObject({ action: 'held', reason: 'unmapped_product', fields: { total: 12_345_675 } })
    expect(plan.productCourseMap.find((l) => l.productWpId === ids.workshop)?.method).toBe('unmapped')
    expect(plan.drafts.users.find((u) => u.wpId === '2')?.fields.phone).toBe('09120000001')
    const completed = plan.drafts.enrollments.find((e) => e.wpId === `2>lifterlms.course:${ids.brandCourse}`)
    expect((completed?.fields.completedLessons as unknown[]).length).toBeGreaterThan(0)
  })
})
