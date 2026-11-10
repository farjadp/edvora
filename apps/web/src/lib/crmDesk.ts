import 'server-only'
/**
 * Advisor CRM desk data (E-015). Every query names the academy explicitly (`tenant equals`). Own/all and course
 * scope come from collection access (the staff user's request, `overrideAccess: false`); the unassigned pool is read
 * with `overrideAccess: true` ONLY after `leadPoolAccess` (core) allowed it, narrowed to the pool's course scope.
 * Rules (due state, search, KPIs, claim/assign, timeline) live in @edvora/core/crm.
 */
import { activeMemberships, can, isPlatformAdmin, type AccessContext, type LeadStatus } from '@edvora/core'
import {
  OPEN_LEAD_STATUSES,
  actorSeesLead,
  buildLeadTimeline,
  canAssignLead,
  crmKpis,
  jalaliMonthStart,
  leadDue,
  leadPoolAccess,
  leadSearch,
  leadSourceKey,
  tehranDayStart,
  type CrmKpis,
  type LeadDue,
  type PoolAccess,
  type TimelineEvent,
} from '@edvora/core/crm'
import type { Where } from 'payload'
import { getAccess, loadMembershipGrants } from '../access/permissions'
import { docOf, idOf } from './ids'
import type { requireStaff } from './staff'
import type { Course, Lead, User } from '../payload-types'

type StaffCtx = Awaited<ReturnType<typeof requireStaff>>

export type CrmView = 'today' | 'mine' | 'pool' | 'team'
export const CRM_VIEWS: readonly CrmView[] = ['today', 'mine', 'pool', 'team']
export const isCrmView = (v: unknown): v is CrmView => typeof v === 'string' && (CRM_VIEWS as readonly string[]).includes(v)

export type CrmDateRange = 'today' | '7d' | 'month' | 'all'
const DATE_RANGES: readonly CrmDateRange[] = ['today', '7d', 'month', 'all']

export type CrmFilters = { q: string; status: LeadStatus | ''; course: number | null; source: string; date: CrmDateRange }

const STATUS_SET = new Set<string>(['new', 'contacted', 'follow_up', 'enrolled', 'lost'])

/** URL params → filters. Unknown values are dropped, never passed to a query. */
export function parseCrmFilters(sp: Record<string, string | string[] | undefined>): CrmFilters {
  const one = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? ''
  }
  const status = one('status')
  const course = Number(one('course'))
  const source = one('source').toLowerCase()
  const date = one('d') as CrmDateRange
  return {
    q: one('q').slice(0, 80),
    status: STATUS_SET.has(status) ? (status as LeadStatus) : '',
    course: Number.isInteger(course) && course > 0 ? course : null,
    source: /^[a-z0-9_.\-]{1,60}$/.test(source) ? source : '',
    date: DATE_RANGES.includes(date) ? date : 'all',
  }
}

export type CrmAccess = {
  ctx: AccessContext
  pool: PoolAccess
  /** Sees every lead of the academy (`leads.view.all`, not downgraded by ownRecordsOnly). */
  team: boolean
  canAssign: boolean
  canCreateOrder: boolean
}

export async function crmAccess(s: StaffCtx): Promise<CrmAccess> {
  const ctx = await getAccess(s.req)
  if (!ctx) return { ctx: { userId: s.user.id, isPlatformAdmin: false, memberships: [] }, pool: { canSee: false }, team: false, canAssign: false, canCreateOrder: false }
  const t = s.tenant.id
  // `.all` that ownRecordsOnly downgrades is not "team" (course scope still narrows the list through access).
  const team = isPlatformAdmin(ctx) || activeMemberships(ctx).some((m) => m.tenantId === t && !m.scope?.ownRecordsOnly && m.permissions.includes('leads.view.all'))
  return {
    ctx,
    pool: leadPoolAccess(ctx, t),
    team,
    canAssign: can(ctx, t, 'leads.assign'),
    canCreateOrder: can(ctx, t, 'orders.create_for_lead'),
  }
}

export type CrmRow = {
  id: number
  name: string
  phone: string
  courseTitle: string | null
  status: LeadStatus
  advisorName: string | null
  advisorId: number | null
  source: string
  createdAt: string
  nextFollowUpAt: string | null
  due: LeadDue
}

const userName = (u: User | null) => (u ? u.name || u.email || null : null)

function toRow(l: Lead, now: Date): CrmRow {
  return {
    id: l.id,
    name: l.name,
    phone: l.phone,
    courseTitle: docOf<Course>(l.course)?.title ?? null,
    status: l.status as LeadStatus,
    advisorName: userName(docOf<User>(l.advisor)),
    advisorId: idOf(l.advisor),
    source: leadSourceKey(l.source),
    createdAt: l.createdAt,
    nextFollowUpAt: l.nextFollowUpAt ?? null,
    due: leadDue({ status: l.status as LeadStatus, nextFollowUpAt: l.nextFollowUpAt }, now),
  }
}

function filterWhere(f: CrmFilters, now: Date): Where[] {
  const w: Where[] = []
  if (f.status) w.push({ status: { equals: f.status } })
  if (f.course) w.push({ course: { equals: f.course } })
  if (f.source === 'direct') w.push({ or: [{ 'source.utmSource': { exists: false } }, { 'source.utmSource': { equals: '' } }] })
  else if (f.source) w.push({ 'source.utmSource': { like: f.source } })
  if (f.date === 'today') w.push({ createdAt: { greater_than_equal: tehranDayStart(now).toISOString() } })
  if (f.date === '7d') w.push({ createdAt: { greater_than_equal: tehranDayStart(now, -6).toISOString() } })
  if (f.date === 'month') w.push({ createdAt: { greater_than_equal: jalaliMonthStart(now).toISOString() } })
  const s = leadSearch(f.q)
  if (s) w.push({ or: [{ name: { contains: s.text } }, ...(s.phone ? [{ phone: { contains: s.phone } }] : [])] })
  return w
}

const LIST_LIMIT = 100

/**
 * One list view. `mine` = my leads; `team` = every lead I may see (needs team); `pool` = unassigned, open leads
 * inside my pool scope. Returns null when the view is not open to this person (the page shows an empty state).
 */
export async function listLeads(s: StaffCtx, a: CrmAccess, view: Exclude<CrmView, 'today'>, f: CrmFilters, now = new Date()): Promise<{ rows: CrmRow[]; total: number } | null> {
  const t = s.tenant.id
  const base: Where[] = [{ tenant: { equals: t } }, ...filterWhere(f, now)]
  if (view === 'pool') {
    if (!a.pool.canSee) return null
    const scope: Where[] = a.pool.courses ? [{ course: { in: a.pool.courses } }] : []
    const res = await s.req.payload.find({
      collection: 'leads',
      where: { and: [...base, { advisor: { exists: false } }, ...(f.status ? [] : [{ status: { in: [...OPEN_LEAD_STATUSES] } }]), ...scope] },
      depth: 1,
      limit: LIST_LIMIT,
      sort: '-createdAt',
      overrideAccess: true,
    })
    return { rows: res.docs.filter((l) => !['enrolled', 'lost'].includes(l.status)).map((l) => toRow(l, now)), total: res.totalDocs }
  }
  if (view === 'team' && !a.team) return null
  const res = await s.req.payload.find({
    collection: 'leads',
    where: { and: [...base, ...(view === 'mine' ? [{ advisor: { equals: s.user.id } }] : [])] },
    depth: 1,
    limit: LIST_LIMIT,
    sort: '-createdAt',
    req: s.req,
    overrideAccess: false,
  })
  return { rows: res.docs.map((l) => toRow(l, now)), total: res.totalDocs }
}

/** Distinct UTM sources among leads this person sees (for the filter), Latin keys. */
export async function sourceOptions(s: StaffCtx): Promise<string[]> {
  const res = await s.req.payload.find({
    collection: 'leads',
    where: { and: [{ tenant: { equals: s.tenant.id } }, { 'source.utmSource': { exists: true } }] },
    depth: 0,
    limit: 500,
    pagination: false,
    select: { source: true },
    req: s.req,
    overrideAccess: false,
  })
  const keys = new Set(res.docs.map((l) => leadSourceKey(l.source)))
  keys.delete('direct')
  return [...keys].sort()
}

export async function courseOptions(s: StaffCtx): Promise<{ id: number; title: string }[]> {
  const res = await s.req.payload.find({ collection: 'courses', where: { tenant: { equals: s.tenant.id } }, depth: 0, limit: 200, pagination: false, sort: 'title', select: { title: true }, overrideAccess: true })
  return res.docs.map((c) => ({ id: c.id, title: c.title }))
}

/** KPI inputs: what this person works (own + pool, or the team) created this month, plus own leads due by tonight. */
export async function getCrmKpis(s: StaffCtx, a: CrmAccess, now = new Date()): Promise<CrmKpis> {
  const t = s.tenant.id
  const monthStart = jalaliMonthStart(now).toISOString()
  const select = { createdAt: true, status: true, advisor: true, nextFollowUpAt: true } as const
  const [visible, pool, due] = await Promise.all([
    s.req.payload.find({ collection: 'leads', where: { and: [{ tenant: { equals: t } }, { createdAt: { greater_than_equal: monthStart } }] }, depth: 0, limit: 5000, pagination: false, select, req: s.req, overrideAccess: false }),
    a.pool.canSee
      ? s.req.payload.find({
          collection: 'leads',
          where: { and: [{ tenant: { equals: t } }, { advisor: { exists: false } }, { createdAt: { greater_than_equal: monthStart } }, ...(a.pool.courses ? [{ course: { in: a.pool.courses } }] : [])] },
          depth: 0,
          limit: 5000,
          pagination: false,
          select,
          overrideAccess: true,
        })
      : Promise.resolve({ docs: [] as Lead[] }),
    s.req.payload.find({
      collection: 'leads',
      where: { and: [{ tenant: { equals: t } }, { advisor: { equals: s.user.id } }, { status: { in: [...OPEN_LEAD_STATUSES] } }, { nextFollowUpAt: { less_than: tehranDayStart(now, 1).toISOString() } }] },
      depth: 0,
      limit: 5000,
      pagination: false,
      select,
      req: s.req,
      overrideAccess: false,
    }),
  ])
  const byId = new Map<number, Pick<Lead, 'id' | 'createdAt' | 'status' | 'advisor' | 'nextFollowUpAt'>>()
  for (const l of [...visible.docs, ...pool.docs, ...due.docs]) byId.set(l.id, l)
  return crmKpis({
    userId: s.user.id,
    now,
    leads: [...byId.values()].map((l) => ({ createdAt: l.createdAt, status: l.status as LeadStatus, advisorId: idOf(l.advisor), nextFollowUpAt: l.nextFollowUpAt ?? null })),
  })
}

// ---------------------------------------------------------------- Lead page

export type AdvisorOption = { id: number; name: string }

export type LeadDetail = {
  lead: Lead
  row: CrmRow
  course: { id: number; title: string; slug: string; published: boolean } | null
  timeline: TimelineEvent[]
  names: Record<string, string>
  /** May log calls / mark lost (lead is inside `leads.view` scope; a pool lead must be claimed first). */
  canWork: boolean
  canClaim: boolean
  advisors: AdvisorOption[] | null
}

/** null = not in this academy or not visible to this person (the page answers 404 either way: no existence leak). */
export async function getLeadDetail(s: StaffCtx, a: CrmAccess, id: number, now = new Date()): Promise<LeadDetail | null> {
  const payload = s.req.payload
  const t = s.tenant.id
  const lead = await payload.findByID({ collection: 'leads', id, depth: 1, overrideAccess: true, disableErrors: true })
  if (!lead || idOf(lead.tenant) !== t) return null
  const target = { advisorId: idOf(lead.advisor), courseId: idOf(lead.course) }
  if (!actorSeesLead(a.ctx, t, target)) return null
  const canWork = can(a.ctx, t, 'leads.view', { ownerId: target.advisorId, courseId: target.courseId }) && target.advisorId !== null
  const canClaim = target.advisorId === null && a.pool.canSee

  const users = await payload.find({ collection: 'users', where: { and: [{ phone: { equals: lead.phone } }, { 'tenants.tenant': { equals: t } }] }, depth: 0, limit: 5, overrideAccess: true, select: { phone: true } })
  const userIds = users.docs.map((u) => u.id)
  const [audit, orders] = await Promise.all([
    payload.find({
      collection: 'audit-logs',
      where: { and: [{ tenant: { equals: t } }, { targetCollection: { equals: 'leads' } }, { docId: { equals: String(lead.id) } }] },
      depth: 0,
      limit: 200,
      pagination: false,
      sort: 'createdAt',
      overrideAccess: true,
      select: { actor: true, changes: true, createdAt: true },
    }),
    userIds.length
      ? payload.find({ collection: 'orders', where: { and: [{ tenant: { equals: t } }, { user: { in: userIds } }] }, depth: 1, limit: 20, sort: '-createdAt', overrideAccess: true })
      : Promise.resolve({ docs: [] }),
  ])

  type Diff = { from: unknown; to: unknown }
  const timeline = buildLeadTimeline({
    createdAt: lead.createdAt,
    source: leadSourceKey(lead.source),
    followUps: (lead.followUps ?? []).map((f) => ({ at: f.at, outcome: f.outcome, note: f.note ?? null, by: idOf(f.by) })),
    changes: audit.docs.map((r) => {
      const c = (r.changes ?? {}) as Record<string, Diff | undefined>
      return { at: r.createdAt, by: idOf(r.actor), status: c.status, advisor: c.advisor }
    }),
    orders: orders.docs.map((o) => ({ id: o.id, createdAt: o.createdAt, status: o.status, total: o.total, courseTitle: docOf<Course>(o.course)?.title ?? null })),
  })

  const peopleIds = new Set<number>()
  for (const e of timeline) {
    for (const k of ['by', 'from', 'to'] as const) {
      const v = (e as Record<string, unknown>)[k]
      if (typeof v === 'number' && (k === 'by' || e.kind === 'owner')) peopleIds.add(v)
    }
  }
  const people = peopleIds.size
    ? await payload.find({ collection: 'users', where: { id: { in: [...peopleIds] } }, depth: 0, limit: peopleIds.size, overrideAccess: true, select: { name: true, email: true } })
    : { docs: [] }
  const names: Record<string, string> = {}
  for (const u of people.docs) names[String(u.id)] = u.name || u.email || '—'

  const c = docOf<Course>(lead.course)
  return {
    lead,
    row: toRow(lead, now),
    course: c ? { id: c.id, title: c.title, slug: c.slug, published: c.status === 'published' } : null,
    timeline,
    names,
    canWork,
    canClaim,
    advisors: a.canAssign ? await assignableAdvisors(s, a, target) : null,
  }
}

/** People in this academy who could work the lead if it were theirs (active, `leads.view` covering it). */
export async function assignableAdvisors(s: StaffCtx, a: CrmAccess, lead: { advisorId: number | null; courseId: number | null }): Promise<AdvisorOption[]> {
  const t = s.tenant.id
  const ms = await s.req.payload.find({ collection: 'memberships', where: { and: [{ tenant: { equals: t } }, { status: { equals: 'active' } }] }, depth: 1, limit: 300, pagination: false, overrideAccess: true })
  const out: AdvisorOption[] = []
  const seen = new Set<number>()
  for (const m of ms.docs) {
    const u = docOf<User>(m.user)
    if (!u || seen.has(u.id) || (u.status ?? 'active') !== 'active') continue
    seen.add(u.id)
    const target = await targetAccess(s, u.id, u.status ?? 'active')
    if (canAssignLead(a.ctx, target, t, lead)) out.push({ id: u.id, name: u.name || u.email || String(u.id) })
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, 'fa'))
}

/** Another person's grants (no session facts: security rules of their roles are not evaluated for them). */
export async function targetAccess(s: StaffCtx, userId: number, status: User['status'] = 'active'): Promise<AccessContext> {
  return { userId, userStatus: status ?? 'active', isPlatformAdmin: false, memberships: await loadMembershipGrants(s.req, userId) }
}
