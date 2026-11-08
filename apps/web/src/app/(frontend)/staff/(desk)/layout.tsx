import { meets } from '@edvora/core/staff'
import type { ReactNode } from 'react'
import { AssistantDrawer } from '../../../../components/assistant/AssistantDrawer'
import { AcademyMark } from '../../../../components/staff/AcademyMark'
import { StaffShell } from '../../../../components/staff/StaffShell'
import { drawerProps } from '../../../../lib/ai/view'
import { count, staffCtx } from '../../../../lib/consoleData'
import { staffConsoleNav } from '../../../../lib/consoleNav'
import { STAFF_LOGOUT, currentHost, getStaffSession, staffUserInfo, tenantLogo } from '../../../../lib/staff'

/**
 * Shell for the desks. Only a settled staff session (`ok`) gets the shell and nav; every other state renders the
 * page bare, and the page's own guard (`requireStaff`) redirects or answers 403 — pages know their path, layouts don't.
 */
export default async function DeskLayout({ children }: { children: ReactNode }) {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !s.user || !s.req) return <div className="min-h-dvh bg-bg px-4 text-ink">{children}</div>
  const session = { ...s, user: s.user, req: s.req }
  const [user, host, assistant] = await Promise.all([staffUserInfo(session), currentHost(), drawerProps()])
  const logo = tenantLogo(s.tenant)

  // Bell: the same three real signals as the overview's alert list (overview desk only, so no extra work for others).
  const canOverview = meets(s, { any: ['roles.manage', 'settings.edit', 'audit.view'] })
  let alertCount = 0
  if (canOverview) {
    const c = staffCtx(session)
    const [a, b] = await Promise.all([count(c, 'submissions', { status: { equals: 'submitted' } }), count(c, 'leads', { status: { equals: 'new' } }, { nextFollowUpAt: { exists: false } })])
    alertCount = (a ?? 0) + (b ?? 0)
  }

  return (
    <StaffShell
      brand={<AcademyMark name={s.tenant.name} logoUrl={logo.url} logoAlt={logo.alt} onSide />}
      tenantName={s.tenant.name}
      host={host}
      user={user}
      nav={staffConsoleNav(s)}
      logoutHref={STAFF_LOGOUT}
      alerts={canOverview ? { href: '/staff/overview#h-alerts', count: alertCount } : null}
      settingsHref={meets(s, { any: ['settings.edit', 'roles.manage'] }) ? '/admin' : undefined}
    >
      {children}
      {assistant ? <AssistantDrawer {...assistant} /> : null}
    </StaffShell>
  )
}
