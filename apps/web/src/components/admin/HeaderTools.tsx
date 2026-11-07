import type { ServerProps } from 'payload'
import { getAdminConsoleContext } from '../../lib/adminTenant'
import { count, staffAccess } from '../../lib/consoleData'
import { adminConsoleNav, payloadAllows } from '../../lib/consoleNav'
import { HeaderToolsClient } from './HeaderToolsClient'

/**
 * Header actions (E-035): search (Ctrl K), theme, fullscreen, alerts bell, site link. The palette lists exactly the
 * nav's modules (same filter). The bell dot = grading queue + new leads without a follow-up date, in the same scope
 * as the dashboard; overdue instalments are on the dashboard and /staff/finance (too heavy for every page).
 */
export async function HeaderTools({ payload, permissions }: ServerProps) {
  const ctx = await getAdminConsoleContext(payload)
  if (!ctx) return null
  const can = (slug: string) => payloadAllows(permissions, slug)
  const a = staffAccess(ctx.who)
  const c = { payload, user: ctx.user, scope: ctx.scope, req: ctx.req }
  const [subs, leads] = await Promise.all([
    a.submissions && can('submissions') ? count(c, 'submissions', { status: { equals: 'submitted' } }) : null,
    a.leads && can('leads') ? count(c, 'leads', { status: { equals: 'new' } }, { nextFollowUpAt: { exists: false } }) : null,
  ])
  const groups = adminConsoleNav(can, ctx.who)
  return <HeaderToolsClient items={groups.flatMap((g) => g.items.map((i) => ({ key: i.key, label: i.label, href: i.href, group: g.label })))} alerts={(subs ?? 0) + (leads ?? 0)} />
}
