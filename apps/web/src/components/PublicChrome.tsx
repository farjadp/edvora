'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * Public site chrome (notice bar, header, footer) around every page except the staff desk, which brings its own
 * shell (E-022). Keeps one root layout, so theme + tenant palette stay shared and no public route moves.
 */
export function PublicChrome({ notice, header, footer, children }: { notice: ReactNode; header: ReactNode; footer: ReactNode; children: ReactNode }) {
  const pathname = usePathname() ?? ''
  if (pathname === '/staff' || pathname.startsWith('/staff/')) return <>{children}</>
  return (
    <>
      {notice}
      {header}
      <main>{children}</main>
      {footer}
    </>
  )
}
