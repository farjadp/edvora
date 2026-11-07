'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** Routes that bring their own full-page frame: the staff desk (E-022) and the login screens (E-034). */
function isBare(pathname: string): boolean {
  return pathname === '/login' || pathname === '/staff' || pathname.startsWith('/staff/')
}

/**
 * Public site chrome (notice bar, header, footer) around every other page. Keeps one root layout, so theme + tenant
 * palette stay shared and no public route moves.
 */
export function PublicChrome({ notice, header, footer, children }: { notice: ReactNode; header: ReactNode; footer: ReactNode; children: ReactNode }) {
  const pathname = usePathname() ?? ''
  if (isBare(pathname)) return <>{children}</>
  return (
    <>
      {notice}
      {header}
      <main>{children}</main>
      {footer}
    </>
  )
}
