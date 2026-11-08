import { safeStaffNext } from '@edvora/core/staff'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthFrame } from '../../../../components/auth/AuthFrame'
import { AuthHeading } from '../../../../components/auth/kit'
import { StaffLoginForm } from '../../../../components/staff/StaffLoginForm'
import { authBrand } from '../../../../lib/authBrand'
import { getStaffSession, settledRedirect } from '../../../../lib/staff'

export const metadata: Metadata = { title: 'ورود کارکنان' }

type Props = { searchParams: Promise<{ next?: string; error?: string }> }

/** Email + password (Payload). Pending sessions skip straight to 2FA; signed-in staff go to `next`. */
export default async function StaffLoginPage({ searchParams }: Props) {
  const sp = await searchParams
  const next = safeStaffNext(sp.next)
  const s = await getStaffSession()
  const to = settledRedirect(s, next)
  if (to) redirect(to)
  const inactive = sp.error === 'inactive' || s.state === 'inactive'
  // E-039 (ADR 016): a role rule (session length, sign-in hours) switched this session off.
  const roleNotice = sp.error === 'session' || s.state === 'session-too-old' ? 'session' : sp.error === 'hours' || s.state === 'outside-hours' ? 'hours' : undefined
  return (
    <AuthFrame brand={authBrand(s.tenant)}>
      <AuthHeading title="ورود کارکنان" sub="برای ورود به میز کار و بخش مدیریت." />
      <div className="mt-7">
        {/* T11: a guard sent an anonymous visitor here with `next` (expired or never signed in: one neutral line). */}
        <StaffLoginForm next={next} initialError={inactive ? 'inactive' : undefined} notice={inactive ? undefined : (roleNotice ?? (sp.next ? 'expired' : undefined))} />
      </div>
    </AuthFrame>
  )
}
