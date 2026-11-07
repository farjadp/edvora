import type { Metadata } from 'next'
import { staff2faRequired } from '../../../../../access/permissions'
import { TwoFactorStatusCard } from '../../../../../components/staff/TwoFactorStatusCard'
import { STAFF_LOGOUT, requireStaff } from '../../../../../lib/staff'

export const metadata: Metadata = { title: 'امنیت حساب' }

/** Every signed-in staff user: 2FA status, turn on (inline enrolment), turn off. */
export default async function SecurityPage() {
  const s = await requireStaff('/staff/security')
  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-2xl font-black">امنیت حساب</h1>
      <TwoFactorStatusCard enabled={Boolean(s.user.twoFactorEnabled)} required={staff2faRequired()} enrol={{ next: '/staff/security', logoutHref: STAFF_LOGOUT }} />
    </div>
  )
}
