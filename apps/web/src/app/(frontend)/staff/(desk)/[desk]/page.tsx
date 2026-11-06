import { STAFF_DESKS, deskDef, landingDesk, type DeskKey } from '@edvora/core/staff'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { staff2faRequired } from '../../../../../access/permissions'
import { DeskPlaceholder } from '../../../../../components/staff/DeskPlaceholder'
import { SecurityPromoCard } from '../../../../../components/staff/SecurityPromoCard'
import { requireStaff } from '../../../../../lib/staff'
import { deskCopy } from '../../../../../lib/staffDesks'

type Props = { params: Promise<{ desk: string }> }

const isDesk = (v: string): v is DeskKey => STAFF_DESKS.some((d) => d.key === v)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { desk } = await params
  return { title: isDesk(desk) ? deskDef(desk).title : 'میز کار' }
}

/** Desk placeholders (E-022). Contents arrive with E-015 / E-023 / E-024. */
export default async function DeskPage({ params }: Props) {
  const { desk } = await params
  // Gate first: anonymous visitors learn nothing about which paths exist.
  const s = await requireStaff(`/staff/${desk}`)
  if (!isDesk(desk)) notFound()
  await requireStaff(`/staff/${desk}`, desk)
  const { description, adminLink } = deskCopy(desk, s)
  const promo = landingDesk(s) === desk && !s.user.twoFactorEnabled && !staff2faRequired()
  return (
    <div className="grid gap-6">
      {promo ? <SecurityPromoCard userId={String(s.user.id)} /> : null}
      <DeskPlaceholder title={deskDef(desk).title} description={description} adminLink={adminLink} />
    </div>
  )
}
