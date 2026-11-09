import { STAFF_DESKS, deskDef, landingTarget, type DeskKey } from '@edvora/core/staff'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { staff2faRequired } from '../../../../../access/permissions'
import { ContentDesk } from '../../../../../components/staff/desks/ContentDesk'
import { FinanceDesk } from '../../../../../components/staff/desks/FinanceDesk'
import { LeadsDesk } from '../../../../../components/staff/desks/LeadsDesk'
import { OverviewDesk } from '../../../../../components/staff/desks/OverviewDesk'
import { StudentsDesk } from '../../../../../components/staff/desks/StudentsDesk'
import { SupportDesk } from '../../../../../components/staff/desks/SupportDesk'
import { TeachingDesk } from '../../../../../components/staff/desks/TeachingDesk'
import { SecurityPromoCard } from '../../../../../components/staff/SecurityPromoCard'
import { getAdvisorDesk, isDeskFilter } from '../../../../../lib/advisorDesk'
import { count, one, staffCtx } from '../../../../../lib/consoleData'
import { courseOptions, crmAccess, getCrmKpis, isCrmView, listLeads, parseCrmFilters, sourceOptions } from '../../../../../lib/crmDesk'
import { leadSearch, matchesLeadSearch } from '@edvora/core/crm'
import { LEAD_STATUS } from '../../../../../lib/consoleLabels'
import { HostLivePanel } from '../../../../../components/live/HostLivePanel'
import { hostRows } from '../../../../../lib/liveAccess'
import { greetingName } from '@edvora/core/names'
import { requireStaff } from '../../../../../lib/staff'
import { tenantHasFeature } from '../../../../../lib/tenant'
import { deskCopy } from '../../../../../lib/staffDesks'

type Sp = Record<string, string | string[] | undefined>
type Props = { params: Promise<{ desk: string }>; searchParams: Promise<Sp> }

const isDesk = (v: string): v is DeskKey => STAFF_DESKS.some((d) => d.key === v)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { desk } = await params
  return { title: isDesk(desk) ? deskDef(desk).title : 'میز کار' }
}

/**
 * Desks (E-035): each desk is header + KPIs + filter bar + table + side panels with real, tenant-filtered data.
 * The support desk has no data source yet and shows an honest empty state.
 */
export default async function DeskPage({ params, searchParams }: Props) {
  const { desk } = await params
  const sp = await searchParams
  // Gate first: anonymous visitors learn nothing about which paths exist.
  const s = await requireStaff(`/staff/${desk}`)
  if (!isDesk(desk)) notFound()
  await requireStaff(`/staff/${desk}`, desk)
  const { description, adminLink } = deskCopy(desk, s)
  const promo = landingTarget(s) === deskDef(desk).href && !s.user.twoFactorEnabled && !staff2faRequired()

  let body
  switch (desk) {
    case 'overview':
      body = <OverviewDesk s={s} />
      break
    case 'leads': {
      // E-015 advisor CRM desk: today's follow-ups (default), my leads, the unassigned pool, the whole team.
      const a = await crmAccess(s)
      const view = isCrmView(sp.v) ? sp.v : 'today'
      const f = isDeskFilter(sp.f) ? sp.f : 'today'
      const q = one(sp.q).trim()
      const filters = parseCrmFilters(sp)
      const c = staffCtx(s)
      const own = { advisor: { equals: s.user.id } }
      const [data, kpis, list, courses, sources, ...mix] = await Promise.all([
        getAdvisorDesk(s, f),
        getCrmKpis(s, a),
        view === 'today' ? Promise.resolve(null) : listLeads(s, a, view, filters),
        view === 'today' ? Promise.resolve([]) : courseOptions(s),
        view === 'today' ? Promise.resolve([]) : sourceOptions(s),
        ...Object.keys(LEAD_STATUS).map(async (status) => ({ status, n: (await count(c, 'leads', own, { status: { equals: status } })) ?? 0 })),
      ])
      const search = leadSearch(q)
      if (search) data.rows = data.rows.filter((r) => matchesLeadSearch(r, search))
      body = (
        <LeadsDesk
          name={greetingName(s.user) ?? 'همکار'}
          view={view}
          tabs={{ pool: a.pool.canSee, team: a.team }}
          kpis={kpis}
          desk={data}
          filter={f}
          q={q}
          list={list}
          filters={filters}
          courses={courses}
          sources={sources}
          mix={mix as { status: string; n: number }[]}
          adminLink={adminLink}
        />
      )
      break
    }
    case 'finance':
      body = <FinanceDesk s={s} sp={sp} adminLink={adminLink} />
      break
    case 'students':
      body = <StudentsDesk s={s} sp={sp} />
      break
    case 'teaching': {
      // E-033: the Teaching desk lists the classes this person may host (D3).
      const live = tenantHasFeature(s.tenant, 'live') ? await hostRows(s) : null
      body = (
        <>
          {live ? <HostLivePanel rows={live} message={one(sp.live) || null} /> : null}
          <TeachingDesk s={s} sp={sp} />
        </>
      )
      break
    }
    case 'content':
      body = <ContentDesk s={s} sp={sp} />
      break
    case 'support':
      body = <SupportDesk description={description} />
      break
  }

  return (
    <div className="grid min-w-0 gap-6">
      {promo ? <SecurityPromoCard userId={String(s.user.id)} /> : null}
      {body}
    </div>
  )
}

