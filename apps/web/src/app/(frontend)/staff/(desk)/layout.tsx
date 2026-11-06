import type { ReactNode } from 'react'
import { StaffShell } from '../../../../components/staff/StaffShell'
import { STAFF_LOGOUT, currentHost, getStaffSession, navItems, staffUserInfo, tenantLogo } from '../../../../lib/staff'

/**
 * Shell for the desks. Only a settled staff session (`ok`) gets the shell and nav; every other state renders the
 * page bare, and the page's own guard (`requireStaff`) redirects or answers 403 — pages know their path, layouts don't.
 */
export default async function DeskLayout({ children }: { children: ReactNode }) {
  const s = await getStaffSession()
  if (s.state !== 'ok' || !s.user || !s.req) return <div className="min-h-dvh bg-bg px-4 text-ink">{children}</div>
  const [user, host] = await Promise.all([staffUserInfo({ ...s, user: s.user, req: s.req }), currentHost()])
  const { items, secondaryItems } = navItems(s)
  const logo = tenantLogo(s.tenant)
  return (
    <StaffShell tenantName={s.tenant.name} logoUrl={logo.url} logoAlt={logo.alt} host={host} user={user} items={items} secondaryItems={secondaryItems} logoutHref={STAFF_LOGOUT}>
      {children}
    </StaffShell>
  )
}
