import 'server-only'
import { meets } from '@edvora/core/staff'
import { forbidden } from 'next/navigation'
import { getStaffSession, requireStaff, type StaffSession } from '../staff'
import type { User } from '../../payload-types'

export type ImportPermission = 'import.view' | 'import.run'

/** Page guard: staff session settled (login / 2FA handled by requireStaff), then the import permission in THIS academy, else 403. */
export async function requireImport(path: string, permission: ImportPermission = 'import.view') {
  const s = await requireStaff(path)
  if (!meets(s, { any: [permission] })) forbidden()
  return s
}

export const canRunImport = (s: StaffSession) => meets(s, { any: ['import.run'] })

/** Action guard: never redirects; returns the session or null (the action answers with a Persian error). */
export async function importActor(permission: ImportPermission): Promise<(StaffSession & { user: User }) | null> {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !s.user) return null
  if (!meets(s, { any: [permission] })) return null
  // E-029 (ADR 013): demo sandboxes never run imports (REST pulls and media downloads reach outside sites).
  if (permission === 'import.run' && s.tenant.isSandbox) return null
  return s as StaffSession & { user: User }
}
