'use client'

import { AppShell, type ShellMenuItem, type ShellNavGroup, type ShellUser } from '@edvora/ui/console'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export type StaffShellProps = {
  /** Server-rendered academy chip (logo + name). */
  brand: ReactNode
  tenantName: string
  host: string
  user: ShellUser
  nav: ShellNavGroup[]
  logoutHref: string
  siteHref?: string
  homeHref?: string
  /** Bell target and the number of real alerts behind it (0 = no dot). */
  alerts?: { href: string; count: number } | null
  settingsHref?: string
  /** Override the pathname used for aria-current (previews). Defaults to usePathname(). */
  currentPath?: string
  children: ReactNode
}

/** /staff chrome (E-035): the shared console AppShell plus the router's current path. */
export function StaffShell({ brand, tenantName, host, user, nav, logoutHref, siteHref = '/', homeHref = '/staff', alerts, settingsHref, currentPath, children }: StaffShellProps) {
  const pathname = usePathname()
  const menuItems: ShellMenuItem[] = [
    { key: 'security', label: 'امنیت حساب', href: '/staff/security', icon: 'shield' },
    { key: 'site', label: 'مشاهدهٔ سایت', href: siteHref, icon: 'site' },
  ]
  return (
    <AppShell
      brand={brand}
      homeHref={homeHref}
      nav={nav}
      navLabel="ناوبری میز کار"
      user={user}
      host={host}
      tenantName={tenantName}
      currentPath={currentPath ?? pathname}
      logoutHref={logoutHref}
      menuItems={menuItems}
      notifications={alerts ? { href: alerts.href, count: alerts.count, label: alerts.count ? `${alerts.count} هشدار` : 'هشدارها' } : undefined}
      settingsHref={settingsHref}
    >
      {children}
    </AppShell>
  )
}
