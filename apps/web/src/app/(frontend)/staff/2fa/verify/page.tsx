import { safeStaffNext } from '@edvora/core/staff'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthFrame } from '../../../../../components/auth/AuthFrame'
import { AuthHeading } from '../../../../../components/auth/kit'
import { TwoFactorVerifyForm } from '../../../../../components/staff/TwoFactorVerifyForm'
import { authBrand } from '../../../../../lib/authBrand'
import { STAFF_LOGOUT, getStaffSession, lockedUntilOf, settledRedirect } from '../../../../../lib/staff'

export const metadata: Metadata = { title: 'تأیید دومرحله‌ای' }

type Props = { searchParams: Promise<{ next?: string }> }

/** Per-session TOTP check. No nav and no permission lookups: the session is still pending. */
export default async function VerifyPage({ searchParams }: Props) {
  const next = safeStaffNext((await searchParams).next)
  const s = await getStaffSession()
  if (s.state === 'anonymous') redirect(`/staff/login?next=${encodeURIComponent(next)}`)
  if (s.state !== 'needs-verify') redirect(settledRedirect(s, next) ?? '/staff')
  return (
    <AuthFrame brand={authBrand(s.tenant)}>
      <AuthHeading title="تأیید دومرحله‌ای" sub="کد ۶رقمی را از برنامهٔ احراز هویت گوشی خود وارد کنید." />
      <div className="mt-7">
        <TwoFactorVerifyForm email={s.user?.email ?? ''} next={next} logoutHref={STAFF_LOGOUT} initialLockedUntil={await lockedUntilOf(s)} />
      </div>
    </AuthFrame>
  )
}
