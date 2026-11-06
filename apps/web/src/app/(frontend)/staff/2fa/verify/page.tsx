import { safeStaffNext } from '@edvora/core/staff'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BareAuthLayout } from '../../../../../components/staff/BareAuthLayout'
import { TwoFactorVerifyForm } from '../../../../../components/staff/TwoFactorVerifyForm'
import { STAFF_LOGOUT, getStaffSession, lockedUntilOf, settledRedirect, tenantLogo } from '../../../../../lib/staff'

export const metadata: Metadata = { title: 'تأیید دومرحله‌ای' }

type Props = { searchParams: Promise<{ next?: string }> }

/** Per-session TOTP check. No nav and no permission lookups: the session is still pending. */
export default async function VerifyPage({ searchParams }: Props) {
  const next = safeStaffNext((await searchParams).next)
  const s = await getStaffSession()
  if (s.state === 'anonymous') redirect(`/staff/login?next=${encodeURIComponent(next)}`)
  if (s.state !== 'needs-verify') redirect(settledRedirect(s, next) ?? '/staff')
  const logo = tenantLogo(s.tenant)
  return (
    <BareAuthLayout tenantName={s.tenant.name} logoUrl={logo.url} logoAlt={logo.alt} title="تأیید دومرحله‌ای">
      <TwoFactorVerifyForm email={s.user?.email ?? ''} next={next} logoutHref={STAFF_LOGOUT} initialLockedUntil={await lockedUntilOf(s)} />
    </BareAuthLayout>
  )
}
