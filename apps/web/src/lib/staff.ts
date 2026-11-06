import 'server-only'
import {
  canOpenDesk,
  deskDef,
  landingDesk,
  safeStaffNext,
  staffGate,
  staffNav,
  type DeskKey,
  type StaffGate,
} from '@edvora/core'
import { forbidden, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createLocalReq, type PayloadRequest } from 'payload'
import { cache } from 'react'
import { getAccess, staff2faRequired } from '../access/permissions'
import type { StaffNavItem, StaffUserInfo } from '../components/staff/types'
import type { Media, Tenant, User } from '../payload-types'
import { getPayloadClient } from './payload'
import { getCurrentTenant, normalizeHost } from './tenant'

/**
 * Staff desk session (E-022). Staff authenticate with Payload (`payload-token` cookie + `sid`), never the student
 * SMS cookie. Permissions come from the E-021 resolution (DB-backed, per request); the gate rules are in
 * @edvora/core `staffGate`. Every lookup is scoped to the academy resolved from the Host header.
 */
export type StaffSession = StaffGate & {
  tenant: Tenant
  user: User | null
  /** Payload request carrying the signed-in user (server code only). */
  req: PayloadRequest | null
}

export const STAFF_LOGOUT = '/staff/logout'

export const getStaffSession = cache(async (): Promise<StaffSession> => {
  const [payload, tenant, h] = await Promise.all([getPayloadClient(), getCurrentTenant(), headers()])
  let user: User | null = null
  try {
    const auth = await payload.auth({ headers: h })
    user = auth.user && auth.user.collection === 'users' ? (auth.user as User) : null
  } catch (err) {
    payload.logger.error({ err, msg: 'staff session: auth failed' })
  }
  if (!user) return { ...staffGate({ ctx: null, tenantId: tenant.id, twoFactorEnabled: false, sessionVerified: false, twoFactorRequired: false }), tenant, user: null, req: null }

  const req = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
  const ctx = await getAccess(req)
  const gate = staffGate({
    ctx,
    tenantId: tenant.id,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    // getAccess checks the session's `sid` against the verified sessions when 2FA is on.
    sessionVerified: Boolean(user.twoFactorEnabled) && ctx?.secondFactorOk !== false,
    twoFactorRequired: staff2faRequired(),
  })
  return { ...gate, tenant, user, req }
})

const withNext = (path: string, next: string) => `${path}?next=${encodeURIComponent(safeStaffNext(next))}`

/**
 * Guard for every page inside the shell. Redirects (server component, so ADR 005 is satisfied) or answers 403
 * via `forbidden()`. Returns the session only when the state is `ok` (and the desk permission is held).
 */
export async function requireStaff(path: string, desk?: DeskKey): Promise<StaffSession & { user: User; req: PayloadRequest }> {
  const s = await getStaffSession()
  switch (s.state) {
    case 'anonymous':
      redirect(withNext('/staff/login', path))
    case 'inactive':
      redirect('/staff/login?error=inactive')
    case 'needs-verify':
      redirect(withNext('/staff/2fa/verify', path))
    case 'needs-enrol':
      redirect(withNext('/staff/2fa/enrol', path))
    case 'no-membership':
    case 'student':
      forbidden()
    case 'ok':
      break
  }
  if (desk && !canOpenDesk(s, desk)) forbidden()
  return s as StaffSession & { user: User; req: PayloadRequest }
}

/** For the bare pages (login, verify, enrol): where an already-settled session should go instead. */
export function settledRedirect(s: StaffSession, next: string): string | null {
  if (s.state === 'ok') return safeStaffNext(next)
  if (s.state === 'needs-verify') return withNext('/staff/2fa/verify', next)
  if (s.state === 'needs-enrol') return withNext('/staff/2fa/enrol', next)
  return null
}

export function landingHref(s: StaffGate): string {
  const desk = landingDesk(s)
  return desk ? deskDef(desk).href : '/staff'
}

export function navItems(s: StaffGate): { items: StaffNavItem[]; secondaryItems: StaffNavItem[] } {
  const nav = staffNav(s)
  const items: StaffNavItem[] = nav.desks.map((d) => ({ key: d.key, label: d.label, href: d.href, icon: d.key }))
  const secondaryItems: StaffNavItem[] = []
  if (nav.setup) secondaryItems.push({ key: 'settings', label: 'تنظیمات و راه‌اندازی', href: '/admin', icon: 'settings', external: true })
  secondaryItems.push({ key: 'security', label: 'امنیت حساب', href: '/staff/security', icon: 'security' })
  return { items, secondaryItems }
}

/** Name, email and the role names of the active memberships in THIS academy (tenant-filtered). */
export async function staffUserInfo(s: StaffSession & { user: User; req: PayloadRequest }): Promise<StaffUserInfo> {
  const res = await s.req.payload.find({
    collection: 'memberships',
    where: { and: [{ user: { equals: s.user.id } }, { tenant: { equals: s.tenant.id } }, { status: { equals: 'active' } }] },
    depth: 1,
    limit: 50,
    pagination: false,
    overrideAccess: true,
    req: s.req,
  })
  const roles = res.docs.flatMap((m) => (m.roles ?? []).flatMap((r) => (typeof r === 'object' && r && !r.archived ? [r.name] : [])))
  if (s.isPlatformAdmin && roles.length === 0) roles.push('مدیر ادورا')
  return { name: s.user.name?.trim() || s.user.email, email: s.user.email, roles: [...new Set(roles)] }
}

export async function currentHost(): Promise<string> {
  return normalizeHost((await headers()).get('host')) || 'localhost'
}

export function tenantLogo(tenant: Tenant): { url: string | null; alt: string | null } {
  const logo = typeof tenant.logo === 'object' ? (tenant.logo as Media | null) : null
  return { url: logo?.url ?? null, alt: logo?.alt ?? null }
}

/** Lockout of the signed-in user's second factor (epoch ms) for the verify page's first render. */
export async function lockedUntilOf(s: StaffSession): Promise<number | null> {
  if (!s.user || !s.req) return null
  const full = await s.req.payload.findByID({ collection: 'users', id: s.user.id, depth: 0, showHiddenFields: true, overrideAccess: true, req: s.req })
  const raw = (full.twoFactor as { lockedUntil?: string | null } | undefined)?.lockedUntil
  const t = raw ? new Date(raw).getTime() : NaN
  return Number.isFinite(t) && t > Date.now() ? t : null
}
