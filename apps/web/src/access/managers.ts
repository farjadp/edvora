import { managersRemaining, type MembershipRow, type UserStatus } from '@edvora/core'
import type { PayloadRequest } from 'payload'
import { APIError } from 'payload'
import { idOf } from '../lib/ids'

type Override =
  | { kind: 'membership'; id: number | null; row: MembershipRow }
  | { kind: 'role'; id: number; permissions: string[]; archived: boolean }
  | { kind: 'user'; id: number; status: UserStatus }

/** All memberships of an academy as plain rows, with one pending change applied. */
async function rows(req: PayloadRequest, tenantId: number, override: Override): Promise<MembershipRow[]> {
  const res = await req.payload.find({
    collection: 'memberships',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    limit: 5000,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const out: MembershipRow[] = []
  for (const m of res.docs) {
    if (override.kind === 'membership' && override.id === m.id) continue
    const roles = (m.roles ?? []).flatMap((r) => (typeof r === 'object' && r ? [r] : []))
    const permissions = roles.flatMap((r) => {
      if (override.kind === 'role' && r.id === override.id) return override.archived ? [] : override.permissions
      return r.archived ? [] : (r.permissions ?? [])
    })
    const user = typeof m.user === 'object' && m.user ? m.user : null
    const userId = idOf(m.user) ?? -1
    out.push({
      userId,
      tenantId,
      status: m.status ?? 'active',
      expiresAt: m.expiresAt ?? null,
      permissions,
      userStatus: override.kind === 'user' && override.id === userId ? override.status : ((user?.status ?? 'active') as UserStatus),
    })
  }
  if (override.kind === 'membership') out.push(override.row)
  return out
}

/** The last active user with roles.manage in an academy cannot be removed, suspended or downgraded. */
export async function assertManagersRemain(req: PayloadRequest, tenantId: number, override: Override): Promise<void> {
  const before = await rows(req, tenantId, { kind: 'role', id: -1, permissions: [], archived: false })
  if (managersRemaining(before, tenantId) === 0) return // academy has no manager yet (bootstrap): nothing to protect
  const after = await rows(req, tenantId, override)
  if (managersRemaining(after, tenantId) === 0) {
    throw new APIError('This would leave the academy without anyone who can manage roles', 409)
  }
}
