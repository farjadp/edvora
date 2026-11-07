import type { ServerProps } from 'payload'
import { getAdminTenantContext } from '../../lib/adminTenant'
import { count } from '../../lib/consoleData'
import { adminConsoleNav } from '../../lib/consoleNav'
import { HeaderToolsClient } from './HeaderToolsClient'

/** Header actions (E-035): search (Ctrl K), theme, fullscreen, alerts bell, site link. The bell dot = real alert counts. */
export async function HeaderTools({ payload, permissions }: ServerProps) {
  const { user, tenant } = await getAdminTenantContext(payload)
  if (!user) return null
  const can = (slug: string) => permissions?.collections?.[slug]?.read === true
  const c = { payload, user, tenantId: tenant?.id ?? null }
  const [a, b] = await Promise.all([can('submissions') ? count(c, 'submissions', { status: { equals: 'submitted' } }) : null, can('leads') ? count(c, 'leads', { status: { equals: 'new' } }, { nextFollowUpAt: { exists: false } }) : null])
  const groups = adminConsoleNav(can)
  return <HeaderToolsClient items={groups.flatMap((g) => g.items.map((i) => ({ key: i.key, label: i.label, href: i.href, group: g.label })))} alerts={(a ?? 0) + (b ?? 0)} />
}
