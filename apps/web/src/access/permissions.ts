/**
 * Permission-based access (ADR 006 §4). Every check reads memberships + roles from the database once per request
 * (cached on req.context), never from the login token, so revoking takes effect on the next request.
 * Rules live in @edvora/core; this file only loads data and adapts the results to Payload.
 */
import {
  accessWhere,
  activeMemberships,
  can,
  isPlatformAdmin,
  tenantsWith,
  type AccessContext,
  type Id,
  type MembershipGrant,
  type ScopeFields,
  type Target,
  type UserStatus,
} from '@edvora/core'
import type { Access, CollectionBeforeChangeHook, FieldAccess, PayloadRequest, Where } from 'payload'
import { APIError } from 'payload'
import { idOf } from '../lib/ids'
import { isSuperAdmin } from './roles'

const CACHE_KEY = 'edvoraAccess'
/** Set while server code makes follow-up writes (sync user.tenants, 2FA state) so guards and audit skip them. */
export const SYSTEM_CONTEXT = 'edvoraSystem'

type Cached = { uid: Id; ctx: AccessContext }
type TwoFactorState = { verifiedSessions?: { sid?: string | null }[] | null }

const ids = (v: unknown): Id[] => (Array.isArray(v) ? v.map(idOf).filter((x): x is number => x !== null) : [])

export function staff2faRequired(): boolean {
  return process.env.STAFF_2FA_REQUIRED === 'true'
}

/** The current session id from Payload's sessions (`sid` in the JWT). */
export function sessionIdOf(req: PayloadRequest): string | null {
  const sid = (req.user as { _sid?: unknown } | null)?._sid
  return typeof sid === 'string' ? sid : null
}

/** Every membership of a user (any status), with the union of its non-archived roles' permissions. */
export async function loadMembershipGrants(req: PayloadRequest, userId: Id): Promise<MembershipGrant[]> {
  const res = await req.payload.find({
    collection: 'memberships',
    where: { user: { equals: userId } },
    depth: 1,
    limit: 500,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return res.docs.map((m) => {
    const roles = (m.roles ?? []).filter((r): r is Exclude<typeof r, number> => typeof r === 'object' && r !== null)
    return {
      tenantId: idOf(m.tenant) ?? -1,
      status: m.status ?? 'active',
      expiresAt: m.expiresAt ?? null,
      permissions: [...new Set(roles.filter((r) => !r.archived).flatMap((r) => r.permissions ?? []))],
      scope: { courses: ids(m.scope?.courses), cohorts: ids(m.scope?.cohorts), ownRecordsOnly: Boolean(m.scope?.ownRecordsOnly) },
    }
  })
}

async function load(req: PayloadRequest): Promise<AccessContext | null> {
  const user = req.user
  if (!user || user.collection !== 'users') return null

  const memberships = await loadMembershipGrants(req, user.id)

  const platform = isSuperAdmin(user)
  const isStaffUser = platform || memberships.some((m) => m.permissions.length > 0)
  let secondFactorOk = true
  if (user.twoFactorEnabled) {
    const full = await req.payload.findByID({ collection: 'users', id: user.id, depth: 0, showHiddenFields: true, overrideAccess: true, req })
    const sid = sessionIdOf(req)
    const verified = (full.twoFactor as TwoFactorState | undefined)?.verifiedSessions ?? []
    secondFactorOk = sid !== null && verified.some((v) => v.sid === sid)
  } else if (isStaffUser && staff2faRequired()) {
    secondFactorOk = false
  }

  return {
    userId: user.id,
    userStatus: (user.status ?? 'active') as UserStatus,
    isPlatformAdmin: platform,
    secondFactorOk,
    memberships,
  }
}

export async function getAccess(req: PayloadRequest): Promise<AccessContext | null> {
  if (!req.user) return null
  const cached = req.context[CACHE_KEY] as Cached | undefined
  if (cached && cached.uid === req.user.id) return cached.ctx
  const ctx = await load(req)
  if (ctx) req.context[CACHE_KEY] = { uid: req.user.id, ctx } satisfies Cached
  return ctx
}

/** Drop the per-request cache after changing memberships or roles. */
export function invalidateAccess(req: PayloadRequest): void {
  delete req.context[CACHE_KEY]
}

export const isSystemWrite = (req: PayloadRequest) => req.context[SYSTEM_CONTEXT] === true

/** Runs `fn` as a trusted server-side follow-up write (no guards, no audit row of its own). */
export async function asSystem<T>(req: PayloadRequest, fn: () => Promise<T>): Promise<T> {
  const prev = req.context[SYSTEM_CONTEXT]
  req.context[SYSTEM_CONTEXT] = true
  try {
    return await fn()
  } finally {
    req.context[SYSTEM_CONTEXT] = prev
  }
}

export async function isStaffRequest(req: PayloadRequest): Promise<boolean> {
  const ctx = await getAccess(req)
  if (!ctx) return false
  return isPlatformAdmin(ctx) || activeMemberships(ctx).some((m) => m.permissions.length > 0)
}

export async function canIn(req: PayloadRequest, tenantId: Id | null, permission: string, target?: Target): Promise<boolean> {
  const ctx = await getAccess(req)
  if (!ctx || tenantId === null) return false
  return can(ctx, tenantId, permission, target)
}

export async function platformAdmin(req: PayloadRequest): Promise<boolean> {
  const ctx = await getAccess(req)
  return Boolean(ctx && isPlatformAdmin(ctx))
}

// ---------------------------------------------------------------- Payload adapters

/** read/update/delete: a query filter built from grants + scope. Default deny. */
export const allow =
  (permission: string, fields: ScopeFields = {}): Access =>
  async ({ req }) => {
    const ctx = await getAccess(req)
    if (!ctx) return false
    return accessWhere(ctx, permission, fields) as boolean | Where
  }

/** create: true if the permission is held in any academy; `guard` then checks the record's own academy and scope. */
export const allowCreate =
  (...permissions: string[]): Access =>
  async ({ req }) => {
    const ctx = await getAccess(req)
    if (!ctx) return false
    return permissions.some((p) => {
      const t = tenantsWith(ctx, p)
      return t === 'all' || t.length > 0
    })
  }

/** OR of several access functions (e.g. "own orders" or "orders.view"). */
export const anyOf =
  (...fns: Access[]): Access =>
  async (args) => {
    const wheres: Where[] = []
    for (const fn of fns) {
      const r = await fn(args)
      if (r === true) return true
      if (r && typeof r === 'object') wheres.push(r)
    }
    if (wheres.length === 0) return false
    return wheres.length === 1 ? wheres[0]! : { or: wheres }
  }

export const ownRecords =
  (field: string): Access =>
  ({ req }) =>
    req.user ? { [field]: { equals: req.user.id } } : false

export const nobody: Access = () => false
export const anyone: Access = () => true

/** Field-level check for a permission in the academy the document belongs to. */
export const fieldAllow =
  (permission: string, tenantOf: (doc: Record<string, unknown> | undefined) => unknown = (d) => d?.tenant): FieldAccess =>
  async ({ req, doc, data }) => {
    const source = (doc ?? data) as Record<string, unknown> | undefined
    return canIn(req, idOf(tenantOf(source)), permission)
  }

const value = (doc: Record<string, unknown>, field: string | undefined): unknown => (field ? doc[field] : undefined)

/** The scope target of a record (after the change). `cohort` undefined = the collection has no cohort. */
export function targetOf(doc: Record<string, unknown>, fields: ScopeFields): Target {
  return {
    ownerId: idOf(value(doc, fields.owner)),
    courseId: fields.course ? idOf(value(doc, fields.course)) : undefined,
    cohortId: fields.cohort ? idOf(value(doc, fields.cohort)) : undefined,
  }
}

/**
 * beforeChange guard: on create and update the record — as it will be saved — must sit inside the actor's grant
 * for its academy and scope. Stops creating in another academy, moving a record to another academy or course,
 * and assigning a lead away on `.own` scope. Skipped for server code without a user (checkout, seed).
 */
export function guard(opts: { create: string[]; update: string[]; fields?: ScopeFields }): CollectionBeforeChangeHook {
  const fields = opts.fields ?? {}
  return async ({ req, data, originalDoc, operation }) => {
    if (!req.user || isSystemWrite(req)) return data
    const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as Record<string, unknown>
    const tenantId = idOf(merged[fields.tenant ?? 'tenant'])
    if (operation === 'update' && originalDoc && idOf(originalDoc[fields.tenant ?? 'tenant']) !== tenantId) {
      throw new APIError('A record cannot move to another academy', 403)
    }
    const perms = operation === 'create' ? opts.create : opts.update
    const target = targetOf(merged, fields)
    for (const p of perms) if (await canIn(req, tenantId, p, target)) return data
    throw new APIError('You do not have permission for this record', 403)
  }
}

/** beforeChange: changing any of `fieldNames` needs `permission` in the record's academy. */
export function requireForFields(fieldNames: string[], permission: string, isChange?: (before: unknown, after: unknown) => boolean): CollectionBeforeChangeHook {
  const changed = isChange ?? ((a, b) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null))
  return async ({ req, data, originalDoc, operation }) => {
    if (!req.user || isSystemWrite(req) || !data) return data
    const touched = fieldNames.filter((f) => f in data && changed(operation === 'create' ? undefined : originalDoc?.[f], data[f]))
    if (touched.length === 0) return data
    const tenantId = idOf((data.tenant ?? originalDoc?.tenant) as unknown)
    if (!(await canIn(req, tenantId, permission))) throw new APIError(`Changing ${touched.join(', ')} needs ${permission}`, 403)
    return data
  }
}
