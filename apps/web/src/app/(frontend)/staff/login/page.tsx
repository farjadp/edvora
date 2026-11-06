import { safeStaffNext } from '@edvora/core/staff'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BareAuthLayout } from '../../../../components/staff/BareAuthLayout'
import { StaffLoginForm } from '../../../../components/staff/StaffLoginForm'
import { getStaffSession, settledRedirect, tenantLogo } from '../../../../lib/staff'

export const metadata: Metadata = { title: 'ورود کارکنان' }

type Props = { searchParams: Promise<{ next?: string; error?: string }> }

/** Email + password (Payload). Pending sessions skip straight to 2FA; signed-in staff go to `next`. */
export default async function StaffLoginPage({ searchParams }: Props) {
  const sp = await searchParams
  const next = safeStaffNext(sp.next)
  const s = await getStaffSession()
  const to = settledRedirect(s, next)
  if (to) redirect(to)
  const logo = tenantLogo(s.tenant)
  return (
    <BareAuthLayout tenantName={s.tenant.name} logoUrl={logo.url} logoAlt={logo.alt} title="ورود کارکنان">
      <StaffLoginForm next={next} initialError={sp.error === 'inactive' || s.state === 'inactive' ? 'inactive' : undefined} />
    </BareAuthLayout>
  )
}
