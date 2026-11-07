import { formatJalali } from '@edvora/core'
import { STAFF_DESKS, deskDef, landingDesk, type DeskKey } from '@edvora/core/staff'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { staff2faRequired } from '../../../../../access/permissions'
import { DeskPlaceholder } from '../../../../../components/staff/DeskPlaceholder'
import { FinanceDesk } from '../../../../../components/staff/FinanceDesk'
import { LeadsDesk } from '../../../../../components/staff/LeadsDesk'
import { SecurityPromoCard } from '../../../../../components/staff/SecurityPromoCard'
import { getAdvisorDesk, isDeskFilter } from '../../../../../lib/advisorDesk'
import { getFinanceInbox } from '../../../../../lib/gamificationQueries'
import { requireStaff } from '../../../../../lib/staff'
import { deskCopy } from '../../../../../lib/staffDesks'

type Props = { params: Promise<{ desk: string }>; searchParams: Promise<{ f?: string }> }

const isDesk = (v: string): v is DeskKey => STAFF_DESKS.some((d) => d.key === v)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { desk } = await params
  return { title: isDesk(desk) ? deskDef(desk).title : 'میز کار' }
}

/** Desks. Leads (advisor) and finance have their E-028 bodies; the rest are E-022 placeholders until E-015 / E-023 / E-024. */
export default async function DeskPage({ params, searchParams }: Props) {
  const { desk } = await params
  const { f } = await searchParams
  // Gate first: anonymous visitors learn nothing about which paths exist.
  const s = await requireStaff(`/staff/${desk}`)
  if (!isDesk(desk)) notFound()
  await requireStaff(`/staff/${desk}`, desk)
  const { description, adminLink } = deskCopy(desk, s)
  const promo = landingDesk(s) === desk && !s.user.twoFactorEnabled && !staff2faRequired()

  let body = null
  if (desk === 'leads') {
    const data = await getAdvisorDesk(s, isDeskFilter(f) ? f : 'today')
    body = <LeadsDesk title={deskDef(desk).title} name={(s.user.name ?? '').trim().split(/\s+/)[0] || 'همکار'} desk={data} filter={isDeskFilter(f) ? f : 'today'} adminLink={adminLink} />
  } else if (desk === 'finance') {
    const inbox = await getFinanceInbox(s)
    if (inbox) body = <FinanceDesk title={deskDef(desk).title} inbox={inbox} checkedAt={formatJalali(new Date(), 'HH:mm')} adminLink={adminLink} orderHref />
  }

  return (
    <div className="grid gap-6">
      {promo ? <SecurityPromoCard userId={String(s.user.id)} /> : null}
      {body ?? <DeskPlaceholder title={deskDef(desk).title} description={description} adminLink={adminLink} />}
    </div>
  )
}
