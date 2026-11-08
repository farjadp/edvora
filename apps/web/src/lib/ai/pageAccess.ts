import 'server-only'
import { AI_MANAGE, AI_USE, meetsIn } from '@edvora/core/ai'
import { forbidden } from 'next/navigation'
import type { PayloadRequest } from 'payload'
import { getAccess } from '../../access/permissions'
import type { User } from '../../payload-types'
import { getStaffSession, requireStaff, type StaffSession } from '../staff'

export type AiPageSession = StaffSession & { user: User; req: PayloadRequest; manage: boolean }

/** Page guard for «دستیار هوشمند»: settled staff session, then `ai.use` (or `ai.manage`) in THIS academy, else 403. */
export async function requireAi(path: string, need: 'use' | 'manage' = 'use'): Promise<AiPageSession> {
  const s = await requireStaff(path)
  const ctx = await getAccess(s.req)
  if (!ctx || !meetsIn(ctx, s.tenant.id, AI_USE)) forbidden()
  const manage = meetsIn(ctx, s.tenant.id, AI_MANAGE)
  if (need === 'manage' && !manage) forbidden()
  return { ...s, manage }
}

/** Action guard: never redirects; null = not allowed (the action answers with a Persian error). */
export async function aiActor(need: 'use' | 'manage'): Promise<AiPageSession | null> {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !s.user || !s.req) return null
  const ctx = await getAccess(s.req)
  if (!ctx || !meetsIn(ctx, s.tenant.id, need === 'manage' ? AI_MANAGE : AI_USE)) return null
  return { ...s, user: s.user, req: s.req, manage: meetsIn(ctx, s.tenant.id, AI_MANAGE) }
}
