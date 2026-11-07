import { safeStaffNext } from '@edvora/core/staff'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthFrame } from '../../../../../components/auth/AuthFrame'
import { AuthHeading } from '../../../../../components/auth/kit'
import { TwoFactorEnrolForm } from '../../../../../components/staff/TwoFactorEnrolForm'
import { authBrand } from '../../../../../lib/authBrand'
import { STAFF_LOGOUT, getStaffSession, settledRedirect } from '../../../../../lib/staff'

export const metadata: Metadata = { title: 'فعال‌سازی تأیید دومرحله‌ای' }

type Props = { searchParams: Promise<{ next?: string }> }

/**
 * Forced enrolment (STAFF_2FA_REQUIRED and not enrolled). The secret is created by the form via POST setup on
 * mount, never on GET. Voluntary enrolment lives on /staff/security.
 */
export default async function EnrolPage({ searchParams }: Props) {
  const next = safeStaffNext((await searchParams).next)
  const s = await getStaffSession()
  if (s.state === 'anonymous') redirect(`/staff/login?next=${encodeURIComponent(next)}`)
  if (s.state !== 'needs-enrol') redirect(settledRedirect(s, next) ?? '/staff')
  return (
    <AuthFrame brand={authBrand(s.tenant)}>
      <AuthHeading title="فعال‌سازی تأیید دومرحله‌ای" />
      <div className="mt-7">
        <TwoFactorEnrolForm mode="forced" next={next} logoutHref={STAFF_LOGOUT} />
      </div>
    </AuthFrame>
  )
}
