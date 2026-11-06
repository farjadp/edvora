import { describe, expect, it } from 'vitest'
import {
  ACADEMY_PERMISSIONS,
  ROLE_TEMPLATES,
  accessWhere,
  activeMemberships,
  can,
  canEditRole,
  checkFourEyes,
  checkGrant,
  managersRemaining,
  satisfies,
  tenantsWith,
  validateRolePermissions,
  type AccessContext,
  type MembershipGrant,
} from './index'

const NOW = new Date('2026-11-06T12:00:00Z')
const A = 1 // academy A
const B = 2 // academy B

const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions

const ctx = (memberships: MembershipGrant[], extra: Partial<AccessContext> = {}): AccessContext => ({
  userId: 10,
  isPlatformAdmin: false,
  userStatus: 'active',
  memberships,
  now: NOW,
  ...extra,
})

const m = (tenantId: number, permissions: readonly string[], extra: Partial<MembershipGrant> = {}): MembershipGrant => ({
  tenantId,
  status: 'active',
  permissions,
  ...extra,
})

describe('catalog', () => {
  it('x.all implies x.own; base is satisfied by either', () => {
    expect(satisfies('leads.view.all', 'leads.view.own')).toBe(true)
    expect(satisfies('leads.view.own', 'leads.view.all')).toBe(false)
    expect(satisfies('leads.view.own', 'leads.view')).toBe(true)
    expect(satisfies('users.view', 'users.edit')).toBe(false)
  })
  it('roles may only hold academy catalog keys', () => {
    expect(validateRolePermissions(['users.view', 'users.view'])).toEqual({ ok: true, permissions: ['users.view'] })
    expect(validateRolePermissions(['tenants.manage']).ok).toBe(false)
    expect(validateRolePermissions(['users.fly']).ok).toBe(false)
  })
  it('templates include finance and support and never platform keys', () => {
    expect(template('finance')).toContain('payments.manual.approve')
    expect(template('support')).toContain('tickets.reply')
    expect(template('support')).not.toContain('payments.manual.approve')
    for (const t of ROLE_TEMPLATES) expect(validateRolePermissions(t.permissions).ok).toBe(true)
    expect(template('academy-admin')).toEqual(ACADEMY_PERMISSIONS)
    expect(template('student')).toEqual([])
  })
})

describe('tenant isolation', () => {
  const advisorInA = ctx([m(A, template('advisor'))])
  it('permissions in academy A do not apply in academy B', () => {
    expect(can(advisorInA, A, 'leads.create')).toBe(true)
    expect(can(advisorInA, B, 'leads.create')).toBe(false)
    expect(tenantsWith(advisorInA, 'leads.create')).toEqual([A])
  })
  it('query filters are pinned to the granting tenant', () => {
    expect(accessWhere(ctx([m(A, ['coupons.manage'])]), 'coupons.manage', {})).toEqual({ tenant: { equals: A } })
    expect(accessWhere(advisorInA, 'coupons.manage', {})).toBe(false)
  })
  it('a role held in two academies yields a filter over both, nothing else', () => {
    const c = ctx([m(A, ['coupons.manage']), m(B, ['coupons.manage'])])
    expect(accessWhere(c, 'coupons.manage', {})).toEqual({ tenant: { in: [A, B] } })
  })
  it('platform admins see every tenant; nobody else does', () => {
    expect(tenantsWith(ctx([], { isPlatformAdmin: true }), 'coupons.manage')).toBe('all')
    expect(accessWhere(ctx([], { isPlatformAdmin: true }), 'coupons.manage', {})).toBe(true)
    expect(accessWhere(ctx([]), 'coupons.manage', {})).toBe(false)
  })
})

describe('default deny and status', () => {
  it('no membership → nothing', () => {
    expect(can(ctx([]), A, 'users.view')).toBe(false)
  })
  it('suspended or archived users get nothing, even platform admins', () => {
    expect(can(ctx([m(A, ['users.view'])], { userStatus: 'suspended' }), A, 'users.view')).toBe(false)
    expect(can(ctx([], { isPlatformAdmin: true, userStatus: 'archived' }), A, 'users.view')).toBe(false)
  })
  it('suspended membership grants nothing', () => {
    expect(can(ctx([m(A, ['users.view'], { status: 'suspended' })]), A, 'users.view')).toBe(false)
  })
  it('pending second factor grants nothing', () => {
    expect(can(ctx([m(A, ['users.view'])], { secondFactorOk: false }), A, 'users.view')).toBe(false)
    expect(can(ctx([], { isPlatformAdmin: true, secondFactorOk: false }), A, 'users.view')).toBe(false)
  })
})

describe('expiry', () => {
  it('expired membership grants nothing, future expiry still works', () => {
    const expired = m(A, ['users.view'], { expiresAt: '2026-11-06T11:59:59Z' })
    const future = m(A, ['users.view'], { expiresAt: new Date('2026-12-01T00:00:00Z') })
    expect(can(ctx([expired]), A, 'users.view')).toBe(false)
    expect(can(ctx([future]), A, 'users.view')).toBe(true)
    expect(activeMemberships(ctx([expired, future]))).toHaveLength(1)
  })
})

describe('scope', () => {
  it('own leads only: filter adds the owner field', () => {
    const c = ctx([m(A, ['leads.view.own'])])
    expect(accessWhere(c, 'leads.view', { owner: 'advisor' })).toEqual({ and: [{ tenant: { equals: A } }, { advisor: { equals: 10 } }] })
    expect(can(c, A, 'leads.view', { ownerId: 10 })).toBe(true)
    expect(can(c, A, 'leads.view', { ownerId: 11 })).toBe(false)
  })
  it('all leads: no owner restriction', () => {
    expect(accessWhere(ctx([m(A, ['leads.view.all'])]), 'leads.view', { owner: 'advisor' })).toEqual({ tenant: { equals: A } })
  })
  it('ownRecordsOnly downgrades .all to .own', () => {
    const c = ctx([m(A, ['leads.view.all'], { scope: { ownRecordsOnly: true } })])
    expect(can(c, A, 'leads.view', { ownerId: 11 })).toBe(false)
    expect(can(c, A, 'leads.view', { ownerId: 10 })).toBe(true)
  })
  it('own scope on a collection without an owner field is denied', () => {
    expect(accessWhere(ctx([m(A, ['leads.view.own'])]), 'leads.view', {})).toBe(false)
  })
  it('instructor scoped to own cohorts/courses', () => {
    const c = ctx([m(A, template('instructor'), { scope: { courses: [5], cohorts: [50] } })])
    expect(can(c, A, 'lessons.edit', { courseId: 5 })).toBe(true)
    expect(can(c, A, 'lessons.edit', { courseId: 6 })).toBe(false)
    expect(can(c, A, 'enrollments.view', { courseId: 5, cohortId: 50 })).toBe(true)
    expect(can(c, A, 'enrollments.view', { courseId: 5, cohortId: 51 })).toBe(false)
    expect(accessWhere(c, 'enrollments.view', { course: 'course', cohort: 'cohort' })).toEqual({
      and: [{ tenant: { equals: A } }, { course: { in: [5] } }, { cohort: { in: [50] } }],
    })
    // Lessons have a course but no cohort: the course scope narrows them.
    expect(accessWhere(c, 'lessons.edit', { course: 'course' })).toEqual({ and: [{ tenant: { equals: A } }, { course: { in: [5] } }] })
    expect(can(c, A, 'enrollments.view', { courseId: 5, cohortId: null })).toBe(false)
  })
  it('cohort-only scope is never widened on a record without cohorts', () => {
    const c = ctx([m(A, ['lessons.edit'], { scope: { cohorts: [50] } })])
    expect(accessWhere(c, 'lessons.edit', { course: 'course' })).toBe(false)
    expect(can(c, A, 'lessons.edit', { courseId: 5 })).toBe(false)
  })
  it('grants add up across memberships', () => {
    const c = ctx([m(A, ['leads.view.own']), m(A, ['enrollments.view'], { scope: { courses: [5] } })])
    expect(accessWhere(c, 'enrollments.view', { course: 'course' })).toEqual({ and: [{ tenant: { equals: A } }, { course: { in: [5] } }] })
    expect(can(c, A, 'leads.view', { ownerId: 10 })).toBe(true)
  })
})

describe('no escalation', () => {
  const admin = ctx([m(A, template('academy-admin'))])
  it('an academy admin can grant templates inside their academy', () => {
    expect(checkGrant(admin, A, { permissions: template('finance') }, 20)).toEqual({ ok: true })
  })
  it('not in another academy', () => {
    expect(checkGrant(admin, B, { permissions: template('finance') }, 20).ok).toBe(false)
  })
  it('nobody grants what they do not hold', () => {
    const lead = ctx([m(A, ['roles.assign', 'leads.view.own'])])
    expect(checkGrant(lead, A, { permissions: ['leads.view.own'] }, 20)).toEqual({ ok: true })
    expect(checkGrant(lead, A, { permissions: ['leads.view.all'] }, 20).ok).toBe(false)
    expect(checkGrant(lead, A, { permissions: ['payments.manual.approve'] }, 20).ok).toBe(false)
  })
  it('granting needs roles.assign', () => {
    expect(checkGrant(ctx([m(A, ['leads.view.own'])]), A, { permissions: ['leads.view.own'] }, 20).ok).toBe(false)
  })
  it('cannot grant a wider scope than they hold', () => {
    const scoped = ctx([m(A, ['roles.assign', 'lessons.edit'], { scope: { courses: [5] } })])
    expect(checkGrant(scoped, A, { permissions: ['lessons.edit'], scope: { courses: [5] } }, 20)).toEqual({ ok: true })
    expect(checkGrant(scoped, A, { permissions: ['lessons.edit'] }, 20).ok).toBe(false)
    expect(checkGrant(scoped, A, { permissions: ['lessons.edit'], scope: { courses: [5, 6] } }, 20).ok).toBe(false)
    const ownOnly = ctx([m(A, ['roles.assign', 'leads.view.all'], { scope: { ownRecordsOnly: true } })])
    expect(checkGrant(ownOnly, A, { permissions: ['leads.view.all'] }, 20).ok).toBe(false)
    expect(checkGrant(ownOnly, A, { permissions: ['leads.view.all'], scope: { ownRecordsOnly: true } }, 20)).toEqual({ ok: true })
  })
  it('nobody edits their own memberships, not even an admin', () => {
    expect(checkGrant(admin, A, { permissions: ['users.view'] }, 10)).toEqual({ ok: false, reason: 'self' })
  })
  it('platform permissions are never grantable in an academy, even by a platform admin', () => {
    const platform = ctx([], { isPlatformAdmin: true })
    expect(checkGrant(platform, A, { permissions: ['tenants.manage'] }, 20).ok).toBe(false)
    expect(checkGrant(platform, A, { permissions: ['users.view'] }, 20)).toEqual({ ok: true })
  })
  it('role editing: only permissions the editor holds, and not a role above their own', () => {
    const manager = ctx([m(A, ['roles.manage', 'leads.view.all', 'leads.assign'])])
    expect(canEditRole(manager, A, null, ['leads.view.all', 'leads.assign'])).toEqual({ ok: true })
    expect(canEditRole(manager, A, null, ['refunds.approve']).ok).toBe(false)
    expect(canEditRole(manager, A, ['refunds.approve'], ['leads.view.all']).ok).toBe(false)
    expect(canEditRole(ctx([m(A, ['leads.view.all'])]), A, null, ['leads.view.all']).ok).toBe(false)
    expect(canEditRole(manager, A, null, ['impersonate']).ok).toBe(false)
  })
})

describe('last role manager', () => {
  const rows = [
    { userId: 1, tenantId: A, status: 'active' as const, permissions: ['roles.manage'] },
    { userId: 2, tenantId: A, status: 'active' as const, permissions: ['roles.manage'], expiresAt: '2026-01-01T00:00:00Z' },
    { userId: 3, tenantId: B, status: 'active' as const, permissions: ['roles.manage'] },
    { userId: 4, tenantId: A, status: 'active' as const, permissions: ['roles.manage'], userStatus: 'suspended' as const },
  ]
  it('counts only active, unexpired managers of that academy', () => {
    expect(managersRemaining(rows, A, NOW)).toBe(1)
    expect(managersRemaining(rows.slice(1), A, NOW)).toBe(0)
  })
})

describe('four-eyes', () => {
  it('the maker cannot approve their own action, even holding both permissions', () => {
    expect(checkFourEyes({ makerId: 10, checkerId: 10, checkerAllowed: true })).toEqual({ ok: false, reason: 'same-person' })
  })
  it('a second person with the permission can', () => {
    expect(checkFourEyes({ makerId: 10, checkerId: '11', checkerAllowed: true })).toEqual({ ok: true })
  })
  it('a second person without the permission cannot', () => {
    expect(checkFourEyes({ makerId: 10, checkerId: 11, checkerAllowed: false })).toEqual({ ok: false, reason: 'not-permitted' })
  })
  it('ids compare by value across number/string', () => {
    expect(checkFourEyes({ makerId: '10', checkerId: 10, checkerAllowed: true }).ok).toBe(false)
  })
  it('missing maker fails closed', () => {
    expect(checkFourEyes({ makerId: null, checkerId: 11, checkerAllowed: true })).toEqual({ ok: false, reason: 'missing-maker' })
  })
})
