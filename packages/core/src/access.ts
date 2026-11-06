/**
 * Permission resolution (ADR 006 §4). Pure functions: the web app loads memberships from the database on every
 * request and passes them in; nothing here trusts a token. Default deny everywhere.
 */
import { PERMISSIONS, isPlatformPermission, isScopedPermission, permissionBase, satisfies, validateRolePermissions } from './permissions'

export type Id = number | string
export type UserStatus = 'active' | 'suspended' | 'archived'
export type MembershipStatus = 'active' | 'suspended'

export type Scope = {
  /** Empty or missing = every course in the academy. */
  courses?: readonly Id[] | null
  /** Empty or missing = every cohort in the academy. */
  cohorts?: readonly Id[] | null
  /** Downgrades every `x.all` permission to `x.own`. */
  ownRecordsOnly?: boolean | null
}

export type MembershipGrant = {
  tenantId: Id
  status: MembershipStatus
  expiresAt?: string | Date | null
  /** Union of the permissions of the membership's (non-archived) roles. */
  permissions: readonly string[]
  scope?: Scope | null
}

export type AccessContext = {
  userId: Id
  userStatus?: UserStatus | null
  /** Edvora super-admin (platform layer). */
  isPlatformAdmin: boolean
  /** False while a staff session still waits for its TOTP code. */
  secondFactorOk?: boolean
  memberships: readonly MembershipGrant[]
  now?: Date
}

export type Decision = { ok: true } | { ok: false; reason: string }

/** A query filter in Payload's `Where` shape, without depending on Payload. */
export type FilterWhere = { [field: string]: { equals: Id } | { in: Id[] } | FilterWhere[] }

/** `cohortId: undefined` means the record has no cohort; `null` means it has one but it is empty. */
export type Target = { ownerId?: Id | null; courseId?: Id | null; cohortId?: Id | null }

const same = (a: Id | null | undefined, b: Id | null | undefined) => a != null && b != null && String(a) === String(b)
const includesId = (list: readonly Id[], id: Id | null | undefined) => id != null && list.some((x) => same(x, id))
const nonEmpty = (list: readonly Id[] | null | undefined): list is readonly Id[] => Array.isArray(list) && list.length > 0

const SCOPED_BASES: ReadonlySet<string> = new Set(PERMISSIONS.filter(isScopedPermission).map(permissionBase))

function principalActive(ctx: AccessContext): boolean {
  return (ctx.userStatus ?? 'active') === 'active' && ctx.secondFactorOk !== false
}

function notExpired(expiresAt: MembershipGrant['expiresAt'], now: Date): boolean {
  if (!expiresAt) return true
  const t = new Date(expiresAt).getTime()
  return Number.isFinite(t) && t > now.getTime()
}

export function isPlatformAdmin(ctx: AccessContext): boolean {
  return ctx.isPlatformAdmin && principalActive(ctx)
}

/** Memberships that grant anything right now. */
export function activeMemberships(ctx: AccessContext): MembershipGrant[] {
  if (!principalActive(ctx)) return []
  const now = ctx.now ?? new Date()
  return ctx.memberships.filter((m) => m.status === 'active' && notExpired(m.expiresAt, now))
}

type Grant = { tenantId: Id; own: boolean; courses: readonly Id[] | null; cohorts: readonly Id[] | null }

/** How one membership grants `permission`, or null. */
function grantOf(m: MembershipGrant, permission: string): Grant | null {
  if (!m.permissions.some((p) => satisfies(p, permission))) return null
  const family = SCOPED_BASES.has(permissionBase(permission))
  const hasAll = m.permissions.includes(`${permissionBase(permission)}.all`)
  return {
    tenantId: m.tenantId,
    own: family && (Boolean(m.scope?.ownRecordsOnly) || !hasAll),
    courses: nonEmpty(m.scope?.courses) ? m.scope.courses : null,
    cohorts: nonEmpty(m.scope?.cohorts) ? m.scope.cohorts : null,
  }
}

function grants(ctx: AccessContext, permission: string, tenantId?: Id): Grant[] {
  return activeMemberships(ctx)
    .filter((m) => tenantId === undefined || same(m.tenantId, tenantId))
    .map((m) => grantOf(m, permission))
    .filter((g): g is Grant => g !== null)
}

/**
 * Single-record check. Without a target it answers "may do this somewhere in the academy";
 * with one it also checks owner and course/cohort scope (fails closed when the target lacks the scoped field).
 */
export function can(ctx: AccessContext, tenantId: Id, permission: string, target?: Target): boolean {
  if (isPlatformAdmin(ctx)) return true
  return grants(ctx, permission, tenantId).some((g) => {
    if (!target) return true
    if (g.own && !same(target.ownerId, ctx.userId)) return false
    if (g.courses && !includesId(g.courses, target.courseId)) return false
    if (g.cohorts) {
      // `cohortId: undefined` = the record has no cohort dimension (e.g. a lesson): the course scope must cover it.
      if (target.cohortId === undefined) return g.courses !== null
      if (!includesId(g.cohorts, target.cohortId)) return false
    }
    return true
  })
}

/** Tenants where the user holds `permission` in any scope. */
export function tenantsWith(ctx: AccessContext, permission: string): 'all' | Id[] {
  if (isPlatformAdmin(ctx)) return 'all'
  const out: Id[] = []
  for (const g of grants(ctx, permission)) if (!out.some((t) => same(t, g.tenantId))) out.push(g.tenantId)
  return out
}

export type ScopeFields = { tenant?: string; owner?: string; course?: string; cohort?: string }

/**
 * Turns grants + scope into a query filter. `true` = unrestricted (platform admin), `false` = deny.
 * A grant whose scope needs a field the collection does not have is dropped (deny, never widen).
 */
export function accessWhere(ctx: AccessContext, permission: string, fields: ScopeFields): boolean | FilterWhere {
  if (isPlatformAdmin(ctx)) return true
  const tenantField = fields.tenant ?? 'tenant'
  const open: Id[] = []
  const clauses: FilterWhere[] = []
  for (const g of grants(ctx, permission)) {
    const and: FilterWhere[] = []
    if (g.own) {
      if (!fields.owner) continue
      and.push({ [fields.owner]: { equals: ctx.userId } })
    }
    if (g.courses) {
      if (!fields.course) continue
      and.push({ [fields.course]: { in: [...g.courses] } })
    }
    if (g.cohorts) {
      // No cohort dimension: allowed only when a course scope already narrows it (never widen to the whole academy).
      if (fields.cohort) and.push({ [fields.cohort]: { in: [...g.cohorts] } })
      else if (!g.courses) continue
    }
    if (and.length === 0) {
      if (!open.some((t) => same(t, g.tenantId))) open.push(g.tenantId)
    } else {
      clauses.push({ and: [{ [tenantField]: { equals: g.tenantId } }, ...and] })
    }
  }
  const openClause: FilterWhere[] =
    open.length === 0 ? [] : open.length === 1 ? [{ [tenantField]: { equals: open[0]! } }] : [{ [tenantField]: { in: open } }]
  const all = [...openClause, ...clauses]
  if (all.length === 0) return false
  if (all.length === 1) return all[0]!
  return { or: all }
}

// ---------------------------------------------------------------- Granting

/** Does an actor's membership cover granting `permission` with `scope`? */
function covers(actor: MembershipGrant, permission: string, scope: Scope | null | undefined): boolean {
  if (!actor.permissions.some((p) => satisfies(p, permission))) return false
  const family = SCOPED_BASES.has(permissionBase(permission))
  if (family && actor.scope?.ownRecordsOnly && !permission.endsWith('.own') && !scope?.ownRecordsOnly) return false
  for (const key of ['courses', 'cohorts'] as const) {
    const mine = actor.scope?.[key]
    if (!nonEmpty(mine)) continue // actor holds it for every course/cohort
    const theirs = scope?.[key]
    if (!nonEmpty(theirs) || !theirs.every((id) => includesId(mine, id))) return false
  }
  return true
}

/**
 * No-escalation rule for assigning roles (a membership): the actor needs `roles.assign` in that academy and must
 * hold every granted permission with at least the granted scope. Nobody changes their own memberships.
 * Platform permissions are never grantable inside an academy.
 */
export function checkGrant(ctx: AccessContext, tenantId: Id, grant: { permissions: readonly string[]; scope?: Scope | null }, targetUserId: Id): Decision {
  const valid = validateRolePermissions(grant.permissions)
  if (!valid.ok) return valid
  if (same(targetUserId, ctx.userId)) return { ok: false, reason: 'self' }
  if (isPlatformAdmin(ctx)) return { ok: true }
  if (!can(ctx, tenantId, 'roles.assign')) return { ok: false, reason: 'Missing permission roles.assign' }
  const mine = activeMemberships(ctx).filter((m) => same(m.tenantId, tenantId))
  for (const p of valid.permissions) {
    if (!mine.some((m) => covers(m, p, grant.scope))) return { ok: false, reason: `Cannot grant ${p}: you do not hold it with this scope` }
  }
  return { ok: true }
}

/** Role editing: needs `roles.manage`, and the editor must hold every permission the role had and will have. */
export function canEditRole(ctx: AccessContext, tenantId: Id, before: readonly string[] | null, after: readonly string[]): Decision {
  const valid = validateRolePermissions(after)
  if (!valid.ok) return valid
  if (isPlatformAdmin(ctx)) return { ok: true }
  if (!can(ctx, tenantId, 'roles.manage')) return { ok: false, reason: 'Missing permission roles.manage' }
  for (const p of new Set([...(before ?? []), ...valid.permissions])) {
    if (isPlatformPermission(p)) return { ok: false, reason: `Platform permission: ${p}` }
    if (!can(ctx, tenantId, p)) return { ok: false, reason: `Cannot edit a role holding ${p}: you do not hold it` }
  }
  return { ok: true }
}

export type MembershipRow = MembershipGrant & { userId: Id; userStatus?: UserStatus | null }

/** Number of distinct users who can still manage roles in the academy. Must never drop to 0. */
export function managersRemaining(rows: readonly MembershipRow[], tenantId: Id, now: Date = new Date()): number {
  const users = new Set<string>()
  for (const r of rows) {
    if (!same(r.tenantId, tenantId) || r.status !== 'active' || (r.userStatus ?? 'active') !== 'active') continue
    if (!notExpired(r.expiresAt, now)) continue
    if (r.permissions.some((p) => satisfies(p, 'roles.manage'))) users.add(String(r.userId))
  }
  return users.size
}

// ---------------------------------------------------------------- Four-eyes

/**
 * Four-eyes is checked on the action, not the role: whoever made a money record (manual payment, refund) cannot
 * approve it, even if they hold both permissions.
 */
export function checkFourEyes(input: { makerId: Id | null | undefined; checkerId: Id; checkerAllowed: boolean }):
  | { ok: true }
  | { ok: false; reason: 'missing-maker' | 'same-person' | 'not-permitted' } {
  if (input.makerId == null || input.makerId === '') return { ok: false, reason: 'missing-maker' }
  if (same(input.makerId, input.checkerId)) return { ok: false, reason: 'same-person' }
  if (!input.checkerAllowed) return { ok: false, reason: 'not-permitted' }
  return { ok: true }
}
