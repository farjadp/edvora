import { describe, expect, it } from 'vitest'
import {
  ACADEMY_PERMISSIONS,
  DASHBOARD_WIDGETS,
  LANDING_DESKS,
  LANDING_OPTIONS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  READ_ONLY_PERMISSIONS,
  ROLE_TEMPLATES,
  STAFF_DESKS,
  can,
  canOpenDesk,
  inLoginHours,
  landingTarget,
  mergeExperience,
  rolePolicyBlock,
  sectionShown,
  staffGate,
  tehranHour,
  validateRoleSettings,
  validateRolePermissions,
  widgetShown,
  type AccessContext,
  type MembershipGrant,
  type RoleTemplateKey,
  type SessionFacts,
} from './index'

const NOW = new Date('2026-11-08T08:00:00Z') // 11:30 Tehran
const perms = (key: RoleTemplateKey) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions
const facts = (extra: Partial<SessionFacts> = {}): SessionFacts => ({ secondFactorVerified: false, sessionStartedAt: new Date(NOW.getTime() - 3_600_000), now: NOW, ...extra })

describe('role security rules', () => {
  it('no rule → nothing withheld', () => {
    expect(rolePolicyBlock(null, facts())).toBeNull()
    expect(rolePolicyBlock({ require2fa: false, maxSessionHours: null, loginHours: { enabled: false, from: 9, to: 9 } }, facts())).toBeNull()
  })

  it('2FA required: withheld until the session passed TOTP', () => {
    expect(rolePolicyBlock({ require2fa: true }, facts())).toBe('needs-2fa')
    expect(rolePolicyBlock({ require2fa: true }, facts({ secondFactorVerified: true }))).toBeNull()
  })

  it('max session length counts from login; unknown start fails closed', () => {
    expect(rolePolicyBlock({ maxSessionHours: 2 }, facts())).toBeNull()
    expect(rolePolicyBlock({ maxSessionHours: 2 }, facts({ sessionStartedAt: new Date(NOW.getTime() - 3 * 3_600_000) }))).toBe('session-too-old')
    expect(rolePolicyBlock({ maxSessionHours: 2 }, facts({ sessionStartedAt: null }))).toBe('session-too-old')
  })

  it('login hours use Tehran time and may wrap midnight', () => {
    expect(tehranHour(NOW)).toBe(11)
    expect(tehranHour(new Date('2026-11-08T20:45:00Z'))).toBe(0) // 00:15 Tehran
    expect(inLoginHours(9, 17, 11)).toBe(true)
    expect(inLoginHours(9, 17, 17)).toBe(false)
    expect(inLoginHours(22, 6, 23)).toBe(true)
    expect(inLoginHours(22, 6, 3)).toBe(true)
    expect(inLoginHours(22, 6, 12)).toBe(false)
    expect(inLoginHours(9, 9, 9)).toBe(false)
    expect(inLoginHours(null, 17, 10)).toBe(false)
    expect(rolePolicyBlock({ loginHours: { enabled: true, from: 9, to: 17 } }, facts())).toBeNull()
    expect(rolePolicyBlock({ loginHours: { enabled: true, from: 13, to: 17 } }, facts())).toBe('outside-hours')
  })

  it('2FA is reported before session age and hours', () => {
    const all = { require2fa: true, maxSessionHours: 1, loginHours: { enabled: true, from: 0, to: 1 } }
    expect(rolePolicyBlock(all, facts({ sessionStartedAt: null }))).toBe('needs-2fa')
  })
})

describe('validateRoleSettings', () => {
  it('accepts empty and valid settings', () => {
    expect(validateRoleSettings({}).ok).toBe(true)
    expect(validateRoleSettings({ security: { maxSessionHours: 8, loginHours: { enabled: true, from: 22, to: 6 } }, experience: { landing: 'leads', menuSections: ['crm'], dashboardWidgets: ['kpis'] } }).ok).toBe(true)
  })
  it('rejects bad values with a Persian reason', () => {
    for (const bad of [
      { security: { maxSessionHours: 0 } },
      { security: { maxSessionHours: 1.5 } },
      { security: { maxSessionHours: 10_000 } },
      { security: { loginHours: { enabled: true, from: 9, to: 9 } } },
      { security: { loginHours: { enabled: true, from: 24, to: 3 } } },
      { experience: { landing: 'nowhere' } },
      { experience: { menuSections: ['secret'] } },
      { experience: { dashboardWidgets: ['clock'] } },
    ]) {
      const r = validateRoleSettings(bad)
      expect(r.ok, JSON.stringify(bad)).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/[؀-ۿ]/)
    }
  })
})

describe('mergeExperience', () => {
  it('no roles → everything', () => {
    const e = mergeExperience([])
    expect(e.menuSections).toBe('all')
    expect(widgetShown(e, 'summary')).toBe(true)
  })
  it('lists are a union; an empty list means all', () => {
    const e = mergeExperience([{ menuSections: ['crm'], dashboardWidgets: ['kpis'] }, { menuSections: ['learning', 'crm'], dashboardWidgets: ['alerts'] }])
    expect(e.menuSections).toEqual(['crm', 'learning'])
    expect(e.dashboardWidgets).toEqual(['kpis', 'alerts'])
    expect(sectionShown(e, 'sales')).toBe(false)
    expect(sectionShown(e, 'crm')).toBe(true)
    const open = mergeExperience([{ menuSections: ['crm'] }, { menuSections: [] }])
    expect(open.menuSections).toBe('all')
  })
  it('landings keep role order, skip auto and unknown values', () => {
    expect(mergeExperience([{ landing: 'auto' }, { landing: 'finance' }, { landing: 'bogus' }, { landing: 'leads' }]).landings).toEqual(['finance', 'leads'])
  })
})

describe('landingTarget', () => {
  const who = (key: RoleTemplateKey, landing: string | null) => ({ permissions: perms(key), isPlatformAdmin: false, experience: mergeExperience([{ landing }]) })
  it('uses the role landing when the person can open it', () => {
    expect(landingTarget(who('finance', 'finance'))).toBe('/staff/finance')
    expect(landingTarget(who('advisor', 'admin'))).toBe('/admin')
  })
  it('falls back to the desk priority when the landing is not allowed', () => {
    // An advisor cannot open the finance desk → the advisor's own priority (leads).
    expect(landingTarget(who('advisor', 'finance'))).toBe('/staff/leads')
    expect(landingTarget(who('student', 'finance'))).toBeNull()
  })
  it('landing desks match STAFF_DESKS', () => {
    expect([...LANDING_DESKS].sort()).toEqual(STAFF_DESKS.map((d) => d.key).sort())
    const options = LANDING_OPTIONS.map((o) => o.value)
    for (const d of LANDING_DESKS) expect(options).toContain(d)
  })
})

describe('staffGate with withheld roles', () => {
  const T = 1
  const m = (extra: Partial<MembershipGrant>): MembershipGrant => ({ tenantId: T, status: 'active', permissions: [], ...extra })
  const ctx = (memberships: MembershipGrant[]): AccessContext => ({ userId: 9, isPlatformAdmin: false, secondFactorOk: true, memberships, now: NOW })
  const gate = (c: AccessContext, twoFactorEnabled = false) => staffGate({ ctx: c, tenantId: T, twoFactorEnabled, sessionVerified: twoFactorEnabled, twoFactorRequired: false })

  it('a 2FA-required role without enrolment → needs-enrol', () => {
    expect(gate(ctx([m({ withheld: [{ reason: 'needs-2fa', permissions: perms('finance') }] })])).state).toBe('needs-enrol')
  })
  it('session too old / outside hours get their own states', () => {
    expect(gate(ctx([m({ withheld: [{ reason: 'session-too-old', permissions: perms('advisor') }] })])).state).toBe('session-too-old')
    expect(gate(ctx([m({ withheld: [{ reason: 'outside-hours', permissions: perms('advisor') }] })])).state).toBe('outside-hours')
  })
  it('another role that still grants keeps the session usable, with only its permissions', () => {
    const g = gate(ctx([m({ permissions: perms('support'), experience: [{ landing: 'support' }], withheld: [{ reason: 'outside-hours', permissions: perms('finance') }] })]))
    expect(g.state).toBe('ok')
    expect(g.permissions).not.toContain('orders.view')
    expect(landingTarget(g)).toBe('/staff/support')
  })
  it('withheld roles of a student-only template do not make the person staff', () => {
    expect(gate(ctx([m({ withheld: [{ reason: 'needs-2fa', permissions: [] }] })])).state).toBe('student')
  })
})

describe('permission descriptions', () => {
  it('every academy permission has a Persian and English description', () => {
    for (const p of ACADEMY_PERMISSIONS) {
      const d = PERMISSION_DESCRIPTIONS[p]
      expect(d?.fa, p).toMatch(/[؀-ۿ]/)
      expect(d?.en.length, p).toBeGreaterThan(3)
    }
    expect(Object.keys(PERMISSION_DESCRIPTIONS).sort()).toEqual([...ACADEMY_PERMISSIONS].sort())
  })
  it('Persian text uses half-spaces, not spaces, before suffixes and after می', () => {
    const texts = [...Object.values(PERMISSION_DESCRIPTIONS).map((d) => d.fa), ...DASHBOARD_WIDGETS.map((w) => w.fa), ...ROLE_TEMPLATES.map((t) => t.name.fa)]
    for (const t of texts) {
      expect(t, t).not.toMatch(/(^|\s)(می|نمی) [؀-ۿ]/)
      expect(t, t).not.toMatch(/[؀-ۿ] (ها|های|هایش|هایشان)(\s|$|[)،.])/)
    }
  })
})

describe('E-039 role templates', () => {
  const MONEY = new Set<string>([...PERMISSION_GROUPS.finance, 'orders.create_for_lead', 'discount.give', 'pricing.edit'])

  it('all templates are valid academy permission lists with unique keys', () => {
    expect(new Set(ROLE_TEMPLATES.map((t) => t.key)).size).toBe(ROLE_TEMPLATES.length)
    for (const t of ROLE_TEMPLATES) expect(validateRolePermissions(t.permissions).ok, t.key).toBe(true)
    for (const t of ROLE_TEMPLATES) if (t.experience) expect(LANDING_OPTIONS.map((o) => o.value)).toContain(t.experience.landing)
  })

  it('teaching assistant: exactly grading and Q&A, no money, no editing', () => {
    expect([...perms('teaching-assistant')].sort()).toEqual(['assignments.grade', 'courses.view', 'enrollments.view', 'qa.answer', 'submissions.grade'])
    expect(perms('teaching-assistant').some((p) => MONEY.has(p))).toBe(false)
    for (const p of ['lessons.edit', 'live.host', 'certificates.issue', 'quizzes.manage', 'assignments.manage']) expect(perms('teaching-assistant')).not.toContain(p)
    const who = { permissions: perms('teaching-assistant'), isPlatformAdmin: false }
    expect(canOpenDesk(who, 'teaching')).toBe(true)
    expect(canOpenDesk(who, 'finance')).toBe(false)
  })

  it('teaching assistant respects the membership course scope', () => {
    const c: AccessContext = { userId: 5, isPlatformAdmin: false, memberships: [{ tenantId: 1, status: 'active', permissions: perms('teaching-assistant'), scope: { courses: [10] } }] }
    expect(can(c, 1, 'submissions.grade', { courseId: 10, cohortId: undefined })).toBe(true)
    expect(can(c, 1, 'submissions.grade', { courseId: 11, cohortId: undefined })).toBe(false)
  })

  it('reporting: read-only keys only, and no lead access (lead view also allows editing)', () => {
    const r = perms('reporting')
    for (const p of r) expect(READ_ONLY_PERMISSIONS, p).toContain(p)
    expect(r.some((p) => p.startsWith('leads.'))).toBe(false)
    for (const p of ['reports.sales', 'reports.finance', 'reports.learning', 'orders.view', 'courses.view', 'users.view']) expect(r).toContain(p)
    const who = { permissions: r, isPlatformAdmin: false }
    expect(canOpenDesk(who, 'overview')).toBe(true)
    expect(canOpenDesk(who, 'finance')).toBe(true)
    expect(canOpenDesk(who, 'leads')).toBe(false)
  })

  it('sales manager: advisor + all leads + reassign + sales reports, nothing more', () => {
    const sm = new Set<string>(perms('sales-manager'))
    for (const p of perms('advisor')) if (p !== 'leads.view.own') expect(sm.has(p), p).toBe(true)
    expect([...sm].filter((p) => !(perms('advisor') as readonly string[]).includes(p)).sort()).toEqual(['leads.assign', 'leads.view.all', 'reports.sales'])
    const c: AccessContext = { userId: 5, isPlatformAdmin: false, memberships: [{ tenantId: 1, status: 'active', permissions: perms('sales-manager') }] }
    expect(can(c, 1, 'leads.view.own', { ownerId: 99 })).toBe(true) // someone else's lead
    expect(can(c, 1, 'leads.assign')).toBe(true)
    expect(can(c, 1, 'payments.manual.approve')).toBe(false)
    expect(can(c, 1, 'refunds.approve')).toBe(false)
  })
})
