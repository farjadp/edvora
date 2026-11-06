/**
 * Staff desk (`/staff`, E-022): which desks a person sees, where they land, and the gate that decides between
 * login / 2FA / 403 / ok. Pure and client-safe (imports no Node modules): the web app loads memberships from the
 * database per request and passes them in. Default deny.
 */
import { activeMemberships, type AccessContext, type Id, type MembershipGrant } from './access'
import { permissionBase, satisfies } from './permissions'

export type DeskKey = 'overview' | 'leads' | 'finance' | 'students' | 'teaching' | 'support' | 'content'

/** `any`: holds at least one key. `all`: holds every key. Scoped keys satisfy base keys (`satisfies`). */
export type Requirement = { any: readonly string[] } | { all: readonly string[] }

export type DeskDef = {
  key: DeskKey
  href: `/staff/${DeskKey}`
  /** Nav label (fa). */
  label: string
  /** Page h1 (fa). */
  title: string
  /** Who sees the nav item and may open the desk page. */
  access: Requirement
  /** Landing condition; null = never a landing target. */
  landing: Requirement | null
  /** Lower lands first (UX §3). */
  landingRank: number | null
}

/**
 * The one table (UX §3 + §4). Order of the array = nav order. `landingRank` = landing priority.
 * Changing who sees a desk or where people land means changing only this table.
 */
export const STAFF_DESKS: readonly DeskDef[] = [
  {
    key: 'overview',
    href: '/staff/overview',
    label: 'نمای کلی',
    title: 'نمای کلی',
    access: { any: ['roles.manage', 'settings.edit', 'audit.view'] },
    landing: { any: ['roles.manage', 'settings.edit'] },
    landingRank: 1,
  },
  {
    key: 'leads',
    href: '/staff/leads',
    label: 'مشتریان',
    title: 'مشتریان بالقوه',
    access: { any: ['leads.view.own', 'leads.view.all'] },
    landing: { any: ['leads.view.own', 'leads.view.all'] },
    landingRank: 2,
  },
  {
    key: 'finance',
    href: '/staff/finance',
    label: 'مالی',
    title: 'مالی',
    access: { any: ['orders.view', 'payments.manual.approve', 'refunds.approve', 'finance.export', 'reports.finance'] },
    landing: { any: ['orders.view', 'payments.manual.approve', 'refunds.approve', 'finance.export'] },
    landingRank: 3,
  },
  {
    key: 'students',
    href: '/staff/students',
    label: 'دانشجویان',
    title: 'دانشجویان',
    access: { all: ['users.view', 'enrollments.view'] },
    landing: null,
    landingRank: null,
  },
  {
    key: 'teaching',
    href: '/staff/teaching',
    label: 'آموزش',
    title: 'آموزش',
    access: { any: ['assignments.grade', 'live.host', 'qa.answer', 'defense.score', 'lessons.edit'] },
    landing: { any: ['assignments.grade', 'live.host', 'qa.answer', 'defense.score', 'lessons.edit'] },
    landingRank: 5,
  },
  {
    key: 'support',
    href: '/staff/support',
    label: 'پشتیبانی',
    title: 'پشتیبانی',
    access: { any: ['tickets.view.own', 'tickets.view.all'] },
    landing: { any: ['tickets.view.own', 'tickets.view.all'] },
    landingRank: 4,
  },
  {
    key: 'content',
    href: '/staff/content',
    label: 'محتوا',
    title: 'محتوا',
    access: { any: ['content.edit', 'content.publish', 'media.upload'] },
    landing: { any: ['content.edit', 'content.publish', 'media.upload'] },
    landingRank: 6,
  },
]

/** Nav link to Payload `/admin` (setup layer). Cosmetic filter: `/admin` itself still admits any staff (E-022 decision). */
export const SETUP_ACCESS: Requirement = {
  any: ['settings.edit', 'roles.manage', 'roles.assign', 'users.create', 'users.edit', 'courses.edit', 'courses.publish', 'pricing.edit', 'cohorts.manage', 'lessons.edit', 'content.edit', 'templates.edit'],
}

export type StaffPerms = {
  /** Union of the permissions of the user's active memberships in THIS academy. */
  permissions: readonly string[]
  isPlatformAdmin: boolean
}

const holds = (permissions: readonly string[], key: string) => permissions.some((p) => satisfies(p, key))

export function meets(who: StaffPerms, req: Requirement): boolean {
  if (who.isPlatformAdmin) return true
  if ('all' in req) return req.all.length > 0 && req.all.every((k) => holds(who.permissions, k))
  return req.any.some((k) => holds(who.permissions, k))
}

export const deskDef = (key: DeskKey): DeskDef => STAFF_DESKS.find((d) => d.key === key)!

export function canOpenDesk(who: StaffPerms, desk: DeskKey): boolean {
  return meets(who, deskDef(desk).access)
}

export type StaffNavModel = {
  desks: DeskDef[]
  /** Show «تنظیمات و راه‌اندازی ↗» (/admin). */
  setup: boolean
  /** «امنیت حساب»: every staff user. */
  security: true
}

export function staffNav(who: StaffPerms): StaffNavModel {
  return { desks: STAFF_DESKS.filter((d) => meets(who, d.access)), setup: meets(who, SETUP_ACCESS), security: true }
}

/** First desk by landing priority whose condition holds; null → the neutral Start page. */
export function landingDesk(who: StaffPerms): DeskKey | null {
  const ranked = STAFF_DESKS.filter((d) => d.landing && d.landingRank !== null).sort((a, b) => a.landingRank! - b.landingRank!)
  return ranked.find((d) => meets(who, d.landing!))?.key ?? null
}

/** `/staff/leads/123` → `leads`. */
export function deskForPath(path: string): DeskKey | null {
  const seg = /^\/staff\/([a-z]+)(?:\/|$|\?)/.exec(path)?.[1]
  return STAFF_DESKS.find((d) => d.key === seg)?.key ?? null
}

/** Latin detail line on 403 variant C, e.g. `leads.view`. */
export function requirementCode(req: Requirement): string {
  const keys = 'all' in req ? req.all : req.any
  return [...new Set(keys.map(permissionBase))].join('all' in req ? ' + ' : ' | ')
}

const LOOP_PATHS = /^\/staff\/(login|logout|2fa)(\/|$|\?)/

/**
 * Validates a `next` parameter: same-site `/staff…` path only (no `//`, no backslash, no scheme, no control
 * characters), never back to login/2FA. Anything else → `/staff`.
 */
export function safeStaffNext(value: unknown, fallback = '/staff'): string {
  if (typeof value !== 'string' || value.length > 512) return fallback
  if (!/^\/staff(\/|$|\?|#)/.test(value)) return fallback
  if (value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value) || value.includes('/..')) return fallback
  if (LOOP_PATHS.test(value)) return fallback
  return value
}

// ---------------------------------------------------------------- Gate

export type StaffGateState = 'anonymous' | 'inactive' | 'needs-verify' | 'needs-enrol' | 'no-membership' | 'student' | 'ok'

export type StaffGateInput = {
  /** Null = no Payload session. */
  ctx: AccessContext | null
  tenantId: Id
  twoFactorEnabled: boolean
  /** This session (`sid`) passed its TOTP check. */
  sessionVerified: boolean
  /** `STAFF_2FA_REQUIRED`. */
  twoFactorRequired: boolean
}

export type StaffGate = { state: StaffGateState } & StaffPerms

const same = (a: Id, b: Id) => String(a) === String(b)

/**
 * Order matters (UX §1): account status, then 2FA, then membership and permissions, so a session waiting for its
 * code never learns which roles exist.
 */
export function staffGate(input: StaffGateInput): StaffGate {
  const deny = (state: StaffGateState): StaffGate => ({ state, permissions: [], isPlatformAdmin: false })
  const { ctx } = input
  if (!ctx) return deny('anonymous')
  if ((ctx.userStatus ?? 'active') !== 'active') return deny('inactive')

  // Grants as if the second factor were done; used only to decide whether the person is staff at all.
  const open: AccessContext = { ...ctx, secondFactorOk: true }
  const staffAnywhere = ctx.isPlatformAdmin || activeMemberships(open).some((m) => m.permissions.length > 0)

  if (input.twoFactorEnabled && !input.sessionVerified) return deny('needs-verify')
  if (!input.twoFactorEnabled && input.twoFactorRequired && staffAnywhere) return deny('needs-enrol')

  if (ctx.isPlatformAdmin) return { state: 'ok', permissions: [], isPlatformAdmin: true }

  const here = ctx.memberships.filter((m) => same(m.tenantId, input.tenantId))
  const activeHere: MembershipGrant[] = activeMemberships(open).filter((m) => same(m.tenantId, input.tenantId))
  const permissions = [...new Set(activeHere.flatMap((m) => m.permissions))]
  if (permissions.length > 0) return { state: 'ok', permissions, isPlatformAdmin: false }
  // Staff in another academy only, or a membership here that is suspended/expired → "not a member here".
  if (staffAnywhere || (here.length > 0 && activeHere.length === 0)) return deny('no-membership')
  // Signed in without any staff permission: a student (or plain) account.
  return deny('student')
}
