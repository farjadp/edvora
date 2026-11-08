import 'server-only'
import type { AccessContext } from '@edvora/core'
import { AI_MANAGE, AI_USE, meetsIn } from '@edvora/core/ai'
import type { PayloadRequest } from 'payload'
import { getAccess } from '../../access/permissions'
import type { Tenant, User } from '../../payload-types'
import { getStaffSession } from '../staff'

export type AiSession = { req: PayloadRequest; ctx: AccessContext; tenant: Tenant; user: User; manage: boolean }

/**
 * The signed-in staff member and the academy of this Host (same rules as /staff: settled session, 2FA, role
 * policies), if they hold `ai.use` there. `null` = not allowed (the route answers 401/403).
 */
export async function aiSession(): Promise<{ ok: true; s: AiSession } | { ok: false; status: 401 | 403 }> {
  const s = await getStaffSession()
  if (s.state === 'anonymous' || !s.user || !s.req) return { ok: false, status: 401 }
  if (s.state !== 'ok') return { ok: false, status: 403 }
  const ctx = await getAccess(s.req)
  if (!ctx || !meetsIn(ctx, s.tenant.id, AI_USE)) return { ok: false, status: 403 }
  return { ok: true, s: { req: s.req, ctx, tenant: s.tenant, user: s.user, manage: meetsIn(ctx, s.tenant.id, AI_MANAGE) } }
}

/** Same-origin check for state-changing JSON routes (cookies are SameSite=Lax; this blocks cross-site form posts). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === request.headers.get('host')
  } catch {
    return false
  }
}
