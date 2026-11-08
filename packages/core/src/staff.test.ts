import { describe, expect, it } from 'vitest'
import {
  ACADEMY_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_TEMPLATES,
  STAFF_DESKS,
  canOpenDesk,
  checkTwoFactorReset,
  deskForPath,
  landingDesk,
  requirementCode,
  safeStaffNext,
  staffGate,
  staffNav,
  type AccessContext,
  type MembershipGrant,
  type RoleTemplateKey,
  type StaffGateInput,
} from './index'

const NOW = new Date('2026-11-06T12:00:00Z')
const A = 1
const B = 2
const perms = (key: RoleTemplateKey) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions
const who = (key: RoleTemplateKey) => ({ permissions: perms(key), isPlatformAdmin: false })
const m = (tenantId: number, permissions: readonly string[], extra: Partial<MembershipGrant> = {}): MembershipGrant => ({ tenantId, status: 'active', permissions, ...extra })
const ctx = (memberships: MembershipGrant[], extra: Partial<AccessContext> = {}): AccessContext => ({
  userId: 10,
  isPlatformAdmin: false,
  userStatus: 'active',
  memberships,
  now: NOW,
  ...extra,
})

describe('users.2fa.reset permission', () => {
  it('is in the catalog, in the users group, with a Persian label', () => {
    expect(PERMISSIONS).toContain('users.2fa.reset')
    expect(PERMISSION_LABELS['users.2fa.reset']?.fa).toBe('بازنشانی تأیید دومرحله‌ای')
  })
  it('is granted to academy-admin only', () => {
    expect(ACADEMY_PERMISSIONS).toContain('users.2fa.reset')
    const holders = ROLE_TEMPLATES.filter((t) => t.permissions.includes('users.2fa.reset')).map((t) => t.key)
    expect(holders).toEqual(['academy-admin'])
  })
})

describe('staff nav + landing per template', () => {
  const nav = (key: RoleTemplateKey) => staffNav(who(key)).desks.map((d) => d.key)
  const cases: [RoleTemplateKey, string[], string | null, boolean][] = [
    ['academy-admin', ['overview', 'leads', 'finance', 'students', 'teaching', 'support', 'content'], 'overview', true],
    ['advisor', ['leads', 'students'], 'leads', false],
    ['finance', ['finance', 'students'], 'finance', false],
    ['support', ['students', 'support'], 'support', false],
    ['instructor', ['teaching'], 'teaching', true],
    ['content-editor', ['content'], 'content', true],
    ['student', [], null, false],
  ]
  for (const [key, desks, landing, setup] of cases) {
    it(`${key}: nav ${desks.join(',') || '—'} · lands on ${landing ?? 'Start'} · setup ${setup}`, () => {
      expect(nav(key)).toEqual(desks)
      expect(landingDesk(who(key))).toBe(landing)
      expect(staffNav(who(key)).setup).toBe(setup)
      expect(staffNav(who(key)).security).toBe(true)
    })
  }

  it('platform admin without membership sees everything and lands on overview', () => {
    const p = { permissions: [], isPlatformAdmin: true }
    expect(staffNav(p).desks).toHaveLength(STAFF_DESKS.length)
    expect(landingDesk(p)).toBe('overview')
  })

  it('landing follows priority, not nav order: support beats teaching', () => {
    expect(landingDesk({ permissions: ['live.host', 'tickets.view.own'], isPlatformAdmin: false })).toBe('support')
  })

  it('students desk needs users.view AND enrollments.view, and is never a landing target', () => {
    expect(canOpenDesk({ permissions: ['users.view'], isPlatformAdmin: false }, 'students')).toBe(false)
    expect(canOpenDesk({ permissions: ['users.view', 'enrollments.view'], isPlatformAdmin: false }, 'students')).toBe(true)
    expect(landingDesk({ permissions: ['users.view', 'enrollments.view'], isPlatformAdmin: false })).toBeNull()
  })

  it('audit.view shows overview but does not land there; reports.finance shows finance but does not land there', () => {
    const p = { permissions: ['audit.view', 'reports.finance'], isPlatformAdmin: false }
    expect(staffNav(p).desks.map((d) => d.key)).toEqual(['overview', 'finance'])
    expect(landingDesk(p)).toBeNull()
  })

  it('scoped keys satisfy desks (leads.view.all)', () => {
    expect(canOpenDesk({ permissions: ['leads.view.all'], isPlatformAdmin: false }, 'leads')).toBe(true)
  })

  it('desk access matches nav (single table)', () => {
    for (const d of STAFF_DESKS) for (const t of ROLE_TEMPLATES) expect(canOpenDesk(who(t.key), d.key)).toBe(staffNav(who(t.key)).desks.includes(d))
  })

  it('maps paths to desks and prints the requirement', () => {
    expect(deskForPath('/staff/leads')).toBe('leads')
    expect(deskForPath('/staff/leads/12')).toBe('leads')
    expect(deskForPath('/staff/security')).toBeNull()
    expect(deskForPath('/staff')).toBeNull()
    expect(requirementCode(STAFF_DESKS.find((d) => d.key === 'leads')!.access)).toBe('leads.view')
    expect(requirementCode(STAFF_DESKS.find((d) => d.key === 'students')!.access)).toBe('users.view + enrollments.view')
  })
})

describe('safeStaffNext', () => {
  it('keeps same-site /staff paths', () => {
    expect(safeStaffNext('/staff')).toBe('/staff')
    expect(safeStaffNext('/staff/leads?x=1')).toBe('/staff/leads?x=1')
  })
  it('rejects everything else', () => {
    for (const bad of ['//evil.com', '/staff\\..', 'https://evil.com/staff', '/dashboard', '/staffx', '/staff/../admin', '', null, 42, '/staff/login', '/staff/2fa/verify', '/staff/logout', '/staff/\nx']) {
      expect(safeStaffNext(bad)).toBe('/staff')
    }
  })
})

describe('staffGate', () => {
  const base = (c: AccessContext | null, extra: Partial<StaffGateInput> = {}): StaffGateInput => ({
    ctx: c,
    tenantId: A,
    twoFactorEnabled: false,
    sessionVerified: false,
    twoFactorRequired: false,
    ...extra,
  })
  const state = (input: StaffGateInput) => staffGate(input).state

  it('anonymous', () => expect(state(base(null))).toBe('anonymous'))
  it('inactive account', () => {
    expect(state(base(ctx([m(A, perms('advisor'))], { userStatus: 'suspended' })))).toBe('inactive')
    expect(state(base(ctx([], { userStatus: 'archived', isPlatformAdmin: true })))).toBe('inactive')
  })
  it('needs-verify comes before any membership decision', () => {
    expect(state(base(ctx([]), { twoFactorEnabled: true }))).toBe('needs-verify')
    expect(state(base(ctx([m(A, perms('advisor'))], { secondFactorOk: false }), { twoFactorEnabled: true }))).toBe('needs-verify')
    expect(state(base(ctx([m(A, perms('advisor'))]), { twoFactorEnabled: true, sessionVerified: true }))).toBe('ok')
  })
  it('needs-enrol only when required and the person is staff somewhere', () => {
    expect(state(base(ctx([m(B, perms('advisor'))]), { twoFactorRequired: true }))).toBe('needs-enrol')
    expect(state(base(ctx([], { isPlatformAdmin: true }), { twoFactorRequired: true }))).toBe('needs-enrol')
    expect(state(base(ctx([m(A, [])]), { twoFactorRequired: true }))).toBe('student')
  })
  it('no-membership: staff elsewhere, or membership here suspended/expired', () => {
    expect(state(base(ctx([m(B, perms('advisor'))])))).toBe('no-membership')
    expect(state(base(ctx([m(A, perms('advisor'), { status: 'suspended' })])))).toBe('no-membership')
    expect(state(base(ctx([m(A, perms('advisor'), { expiresAt: '2026-11-01T00:00:00Z' })])))).toBe('no-membership')
  })
  it('student: signed in without any staff permission', () => {
    expect(state(base(ctx([])))).toBe('student')
    expect(state(base(ctx([m(A, perms('student'))])))).toBe('student')
  })
  it('ok: unions permissions of active memberships in this academy only', () => {
    const g = staffGate(base(ctx([m(A, ['leads.view.own']), m(A, ['live.host']), m(B, ['orders.view'])])))
    expect(g.state).toBe('ok')
    expect([...g.permissions].sort()).toEqual(['leads.view.own', 'live.host'])
  })
  it('platform admin is ok without a membership', () => {
    const g = staffGate(base(ctx([], { isPlatformAdmin: true })))
    expect(g).toMatchObject({ state: 'ok', permissions: [], isPlatformAdmin: true })
    expect(g.experience.menuSections).toBe('all')
  })
})

describe('checkTwoFactorReset', () => {
  const admin = (tenants: number[]) => ctx(tenants.map((t) => m(t, perms('academy-admin'))))
  const target = (memberships: MembershipGrant[], extra: Partial<Parameters<typeof checkTwoFactorReset>[1]> = {}) => ({
    userId: 20,
    isPlatformAdmin: false,
    tenantIds: [...new Set(memberships.map((x) => x.tenantId))],
    memberships,
    ...extra,
  })

  it('academy admin resets staff of their academy and audits there', () => {
    expect(checkTwoFactorReset(admin([A]), target([m(A, perms('advisor'))]))).toEqual({ ok: true, tenantIds: [A] })
  })
  it('never on yourself', () => {
    expect(checkTwoFactorReset(admin([A]), target([m(A, perms('advisor'))], { userId: 10 }))).toEqual({ ok: false, reason: 'self' })
    expect(checkTwoFactorReset(ctx([], { isPlatformAdmin: true }), target([], { userId: 10 }))).toEqual({ ok: false, reason: 'self' })
  })
  it('needs the permission (advisor cannot)', () => {
    expect(checkTwoFactorReset(ctx([m(A, perms('advisor'))]), target([m(A, perms('advisor'))]))).toEqual({ ok: false, reason: 'not-permitted' })
  })
  it('staff in another academy too → only if the actor holds it there as well', () => {
    const t = target([m(A, perms('advisor')), m(B, perms('support'))])
    expect(checkTwoFactorReset(admin([A]), t)).toEqual({ ok: false, reason: 'other-academy' })
    expect(checkTwoFactorReset(admin([A, B]), t)).toEqual({ ok: true, tenantIds: [A, B] })
  })
  it('suspended memberships elsewhere do not count', () => {
    expect(checkTwoFactorReset(admin([A]), target([m(A, perms('advisor')), m(B, perms('support'), { status: 'suspended' })]))).toEqual({ ok: true, tenantIds: [A] })
  })
  it('non-staff account: uses the academies it belongs to', () => {
    expect(checkTwoFactorReset(admin([A]), target([], { tenantIds: [A] }))).toEqual({ ok: true, tenantIds: [A] })
    expect(checkTwoFactorReset(admin([A]), target([], { tenantIds: [B] }))).toEqual({ ok: false, reason: 'not-permitted' })
    expect(checkTwoFactorReset(admin([A]), target([], { tenantIds: [] }))).toEqual({ ok: false, reason: 'not-permitted' })
  })
  it('platform-admin accounts only by platform admins', () => {
    expect(checkTwoFactorReset(admin([A]), target([m(A, perms('advisor'))], { isPlatformAdmin: true }))).toEqual({ ok: false, reason: 'platform-target' })
    expect(checkTwoFactorReset(ctx([], { isPlatformAdmin: true }), target([m(A, perms('advisor'))], { isPlatformAdmin: true }))).toEqual({ ok: true, tenantIds: [A] })
  })
  it('no escalation: a scoped actor cannot reset someone with wider access', () => {
    const scoped = ctx([m(A, perms('academy-admin'), { scope: { courses: [5] } })])
    expect(checkTwoFactorReset(scoped, target([m(A, perms('instructor'))]))).toEqual({ ok: false, reason: 'escalation' })
    expect(checkTwoFactorReset(scoped, target([m(A, perms('instructor'), { scope: { courses: [5] } })]))).toEqual({ ok: true, tenantIds: [A] })
  })
  it('a suspended actor can do nothing', () => {
    expect(checkTwoFactorReset(ctx([m(A, perms('academy-admin'))], { userStatus: 'suspended' }), target([m(A, perms('advisor'))]))).toEqual({ ok: false, reason: 'not-permitted' })
  })
})
