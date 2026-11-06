import { ThemeToggle } from '@edvora/ui'
import type { ReactNode } from 'react'
import { AcademyMark } from './AcademyMark'
import { Card } from './ui'

export type BareAuthLayoutProps = {
  tenantName: string
  logoUrl?: string | null
  logoAlt?: string | null
  /** h1 of the page. */
  title: string
  children: ReactNode
}

/**
 * Bare layout for /staff/login, /staff/2fa/verify and /staff/2fa/enrol: no nav, no permission lookups.
 * Shows only the academy (public tenant data) and the page card.
 */
export function BareAuthLayout({ tenantName, logoUrl, logoAlt, title, children }: BareAuthLayoutProps) {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto grid w-full max-w-lg gap-6 px-4 py-6 sm:py-12">
        <div className="flex items-center justify-between gap-3">
          <AcademyMark name={tenantName} logoUrl={logoUrl} logoAlt={logoAlt} size="lg" />
          <ThemeToggle />
        </div>
        <main>
          <Card>
            <h1 className="mb-5 text-2xl font-black">{title}</h1>
            {children}
          </Card>
        </main>
      </div>
    </div>
  )
}
