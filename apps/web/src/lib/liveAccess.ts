import 'server-only'
import type { Target } from '@edvora/core'
import type { PayloadRequest } from 'payload'
import { canIn } from '../access/permissions'
import type { LiveSession, Tenant, User } from '../payload-types'
import { idOf } from './ids'
import { getStaff, type Staff } from './staff'

/**
 * D3: who may host a session. `live.host` in the session's course/cohort scope, and, when an instructor is set,
 * that instructor (or someone who manages cohorts, to cover for them).
 */
/** Anything that can answer permission checks for one user (the /admin cookie session or a staff desk session). */
export type HostChecker = { user: { id: number }; can: Staff['can'] }

export async function canHost(staff: HostChecker | null, tenant: Tenant, session: LiveSession): Promise<boolean> {
  if (!staff || idOf(session.tenant) !== tenant.id) return false
  const target = { courseId: idOf(session.course), cohortId: idOf(session.cohort) }
  if (!(await staff.can(tenant.id, 'live.host', target))) return false
  const instructor = idOf(session.instructor)
  return instructor === null || instructor === staff.user.id || (await staff.can(tenant.id, 'cohorts.manage', target))
}

export async function currentHost(tenant: Tenant, session: LiveSession): Promise<Staff | null> {
  const staff = await getStaff()
  return (await canHost(staff, tenant, session)) ? staff : null
}

/** The Teaching desk list: sessions of this academy from 2 days ago onwards that this person may host. */
export async function hostRows(s: { tenant: Tenant; user: User; req: PayloadRequest }) {
  const staff: HostChecker = { user: s.user, can: (tenantId: number, permission: string, target?: Target) => canIn(s.req, tenantId, permission, target) }
  const res = await s.req.payload.find({
    collection: 'live-sessions',
    where: { and: [{ tenant: { equals: s.tenant.id } }, { startsAt: { greater_than: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() } }] },
    sort: 'startsAt',
    limit: 50,
    depth: 1,
    overrideAccess: false,
    req: s.req,
  })
  const rows = []
  for (const session of res.docs) {
    if (!(await canHost(staff, s.tenant, session))) continue
    const attendees = await s.req.payload.count({ collection: 'attendance', where: { session: { equals: session.id } }, overrideAccess: true })
    const course = typeof session.course === 'object' ? session.course : null
    const cohort = typeof session.cohort === 'object' ? session.cohort : null
    rows.push({ session, courseTitle: course?.title ?? '', cohortTitle: cohort?.title ?? null, attendees: attendees.totalDocs })
  }
  return rows
}
