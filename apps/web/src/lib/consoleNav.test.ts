import { ROLE_TEMPLATES } from '@edvora/core'
import { meets, type StaffPerms } from '@edvora/core/staff'
import { describe, expect, it } from 'vitest'
import { CONSOLE_GROUPS, adminConsoleNav, payloadAllows, staffConsoleNav } from './consoleNav'

const role = (key: string): StaffPerms => ({ isPlatformAdmin: false, permissions: [...(ROLE_TEMPLATES.find((r) => r.key === key)?.permissions ?? [])] })
const keys = (groups: { items: { key: string }[] }[]) => groups.flatMap((g) => g.items.map((i) => i.key))
const everyRead = () => true
const PLATFORM: StaffPerms = { isPlatformAdmin: true, permissions: [] }
const NOBODY: StaffPerms = { isPlatformAdmin: false, permissions: [] }

describe('console module map', () => {
  it('every list module has a read rule, and every key is in the permission catalog', async () => {
    const { PERMISSIONS } = await import('@edvora/core')
    const known = new Set<string>([...PERMISSIONS, ...PERMISSIONS.map((p) => p.replace(/\.(own|all)$/, ''))])
    for (const m of CONSOLE_GROUPS.flatMap((g) => g.items)) {
      if (m.slug) expect(m.read, m.key).toBeDefined()
      const req = m.read
      for (const k of req ? ('any' in req ? req.any : req.all) : []) expect(known.has(k), `${m.key}: ${k}`).toBe(true)
    }
  })
})

describe('staffConsoleNav', () => {
  it('default deny: no permissions → only the security page', () => {
    expect(keys(staffConsoleNav(NOBODY))).toEqual(['security'])
  })

  it('advisor: leads desk, catalog links, students lists; no finance, settings or grading', () => {
    const k = keys(staffConsoleNav(role('advisor')))
    expect(k).toContain('leads')
    expect(k).toContain('courses')
    expect(k).toContain('enrollments')
    expect(k).not.toContain('orders')
    expect(k).not.toContain('coupons')
    expect(k).not.toContain('submissions')
    expect(k).not.toContain('roles')
    expect(k).not.toContain('overview')
  })

  it('finance: finance desk and coupons; no leads, no grading', () => {
    const k = keys(staffConsoleNav(role('finance')))
    expect(k).toEqual(expect.arrayContaining(['orders', 'coupons']))
    expect(k).not.toContain('leads')
    expect(k).not.toContain('submissions')
  })

  it('instructor: teaching desk, quizzes, assignments, results; no money', () => {
    const k = keys(staffConsoleNav(role('instructor')))
    expect(k).toEqual(expect.arrayContaining(['submissions', 'quizzes', 'assignments', 'quiz-attempts', 'certificates']))
    expect(k).not.toContain('orders')
    expect(k).not.toContain('leads')
  })

  it('academy admin and platform admin see every module', () => {
    const all = CONSOLE_GROUPS.flatMap((g) => g.items.map((i) => i.key))
    expect(keys(staffConsoleNav(role('academy-admin')))).toEqual([...all, 'security'])
    expect(keys(staffConsoleNav(PLATFORM))).toEqual([...all, 'security'])
  })

  it('a desk module links to its desk, a list module to /admin (external)', () => {
    const items = staffConsoleNav(PLATFORM).flatMap((g) => g.items)
    expect(items.find((i) => i.key === 'orders')).toMatchObject({ href: '/staff/finance', external: false })
    expect(items.find((i) => i.key === 'coupons')).toMatchObject({ href: '/admin/collections/coupons', external: true })
  })
})

describe('adminConsoleNav', () => {
  it('needs BOTH Payload read and the staff read rule (own-records read is not enough)', () => {
    // Payload says `read: true` for orders to everyone (own purchases); an advisor still gets no Orders link.
    expect(keys(adminConsoleNav(everyRead, role('advisor')))).not.toContain('orders')
    // Payload denies → hidden, even for a platform admin.
    expect(keys(adminConsoleNav((slug) => slug !== 'audit-logs', PLATFORM))).not.toContain('audit-logs')
  })

  it('every list link it shows is one Payload lets the person read', () => {
    const readable = new Set(['leads', 'courses', 'enrollments', 'users'])
    const shown = adminConsoleNav((s) => readable.has(s), role('advisor')).flatMap((g) => g.items)
    for (const i of shown.filter((x) => x.href.startsWith('/admin/collections/'))) expect(readable.has(i.href.split('/')[3]!)).toBe(true)
  })

  it('always offers the dashboard, the staff desk and the account page; nothing else for nobody', () => {
    expect(keys(adminConsoleNav(everyRead, NOBODY))).toEqual(['overview', 'desk', 'account'])
  })

  it('the read rules agree with the role templates: each template sees the modules it can actually read', () => {
    for (const t of ROLE_TEMPLATES) {
      const who = role(t.key)
      for (const m of CONSOLE_GROUPS.flatMap((g) => g.items)) {
        if (!m.slug || !m.read) continue
        const shown = keys(adminConsoleNav(everyRead, who)).includes(m.key)
        expect(shown, `${t.key} / ${m.key}`).toBe(meets(who, m.read))
      }
    }
  })
})

describe('payloadAllows', () => {
  it('accepts true and where-scoped permission objects; denies the rest', () => {
    const perms = { collections: { leads: { read: { permission: true, where: { advisor: { equals: 1 } } } }, coupons: { read: true }, roles: { read: false }, media: {} } }
    expect(payloadAllows(perms, 'leads')).toBe(true)
    expect(payloadAllows(perms, 'coupons')).toBe(true)
    expect(payloadAllows(perms, 'roles')).toBe(false)
    expect(payloadAllows(perms, 'media')).toBe(false)
    expect(payloadAllows(perms, 'nope')).toBe(false)
    expect(payloadAllows(undefined, 'leads')).toBe(false)
    expect(payloadAllows({ collections: { x: { read: { permission: false } } } }, 'x')).toBe(false)
  })
})

describe('modules built alongside the console (E-032, E-033, E-030)', () => {
  it('platform admin sees WordPress import, live classes, attendance, pages and redirects in /admin', () => {
    const k = keys(adminConsoleNav(everyRead, PLATFORM))
    for (const key of ['import', 'live-sessions', 'attendance', 'pages', 'redirects']) expect(k, key).toContain(key)
  })

  it('WordPress import opens the /staff/import page from both consoles, only with import.view', () => {
    const withImport: StaffPerms = { isPlatformAdmin: false, permissions: ['import.view'] }
    const admin = adminConsoleNav(everyRead, withImport).flatMap((g) => g.items).find((i) => i.key === 'import')
    expect(admin).toMatchObject({ href: '/staff/import', external: true })
    const staff = staffConsoleNav(withImport).flatMap((g) => g.items).find((i) => i.key === 'import')
    expect(staff).toMatchObject({ href: '/staff/import', external: false })
    expect(keys(adminConsoleNav(everyRead, NOBODY))).not.toContain('import')
  })
})

