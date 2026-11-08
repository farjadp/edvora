import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SandboxBanner } from '../../../components/demo/SandboxBanner'
import { getCurrentTenant } from '../../../lib/tenant'

// Staff desk (E-022): never indexed. The root layout drops the public header/footer for /staff.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant()
  return {
    title: { default: `میز کار · ${tenant.name}`, template: `%s · میز کار · ${tenant.name}` },
    robots: { index: false, follow: false, nocache: true },
  }
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SandboxBanner />
      {children}
    </>
  )
}
