import { landingDesk } from '@edvora/core/staff'
import { redirect } from 'next/navigation'
import { staff2faRequired } from '../../../../access/permissions'
import { SecurityPromoCard } from '../../../../components/staff/SecurityPromoCard'
import { StartPage } from '../../../../components/staff/StartPage'
import { landingHref, navItems, requireStaff } from '../../../../lib/staff'

/** /staff → the first desk by landing priority (UX §3), else the neutral Start page. */
export default async function StaffHome() {
  const s = await requireStaff('/staff')
  if (landingDesk(s)) redirect(landingHref(s))
  const { items, secondaryItems } = navItems(s)
  return (
    <div className="grid gap-6">
      {!s.user.twoFactorEnabled && !staff2faRequired() ? <SecurityPromoCard userId={String(s.user.id)} /> : null}
      <StartPage items={[...items, ...secondaryItems]} />
    </div>
  )
}
