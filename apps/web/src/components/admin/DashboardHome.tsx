import { toPersianDigits } from '@edvora/core/digits'
import type { ServerProps } from 'payload'
import { PERIOD_DAYS, getOverview, type CollAccess } from '../../lib/consoleData'
import { getAdminTenantContext } from '../../lib/adminTenant'
import { Activity, Alerts, BarsBlock, DonutBlock, Empty, Kpis, Panel, Quick, SummaryBlock } from './console'

/**
 * Admin landing (E-035): greeting, 4 KPIs, alerts, recent events, charts, quick actions, financial summary, all from
 * real data (`getOverview`, shared with /staff/overview). What shows is driven by Payload's own `permissions` for this
 * user and every query runs with the collection's access rules (`overrideAccess: false`). Scope: the academy picked in
 * the nav selector, else every academy the user may read.
 */
export async function DashboardHome({ payload, permissions, user: serverUser }: ServerProps) {
  const { user, tenant } = await getAdminTenantContext(payload)
  if (!user) return null
  const can = (slug: string, action: 'read' | 'create') => permissions?.collections?.[slug]?.[action] === true
  const access: CollAccess = {
    orders: can('orders', 'read'),
    enrollments: can('enrollments', 'read'),
    leads: can('leads', 'read'),
    submissions: can('submissions', 'read'),
    create: { courses: can('courses', 'create'), coupons: can('coupons', 'create'), posts: can('posts', 'create'), users: can('users', 'create') },
  }
  const data = await getOverview({ payload, user, tenantId: tenant?.id ?? null }, access)
  const name = (serverUser as { name?: string | null } | undefined)?.name?.trim() || user.email

  return (
    <section className="c-dash" aria-labelledby="c-dash-title">
      <header className="c-dash__head">
        <div>
          <p className="c-eyebrow">{tenant ? tenant.name : 'همهٔ آکادمی‌هایی که به آن‌ها دسترسی دارید'}</p>
          <h1 id="c-dash-title" className="c-dash__title">
            سلام، {name}
          </h1>
          <p className="c-muted">
            آمار {toPersianDigits(String(PERIOD_DAYS))} روز گذشته در برابر {toPersianDigits(String(PERIOD_DAYS))} روز پیش از آن؛ همه از داده‌های واقعی.
          </p>
        </div>
        {access.create.courses ? (
          <a className="c-btn c-btn--primary" href={`${payload.config.routes.admin}/collections/courses/create`}>
            + دورهٔ تازه
          </a>
        ) : null}
      </header>

      {data.kpis.length ? <Kpis items={data.kpis} /> : <Empty icon="chart" title="برای حساب شما هنوز آماری فعال نشده است." text="با مدیر آکادمی تماس بگیرید." />}

      <div className="c-grid">
        <div className="c-col">
          <div id="alerts">
            <Panel title="هشدارها" id="c-h-alerts" chip={data.alerts.length ? `${toPersianDigits(String(data.alerts.length))} مورد` : undefined}>
              <Alerts items={data.alerts} />
            </Panel>
          </div>
          <Panel title="رویدادهای اخیر" id="c-h-activity">
            <Activity items={data.activity} />
          </Panel>
        </div>
        <div className="c-col">
          {data.donut ? (
            <Panel title="ثبت‌نام فعال به تفکیک دوره" id="c-h-donut">
              <DonutBlock donut={data.donut} />
            </Panel>
          ) : null}
          {data.bars ? (
            <Panel title={`${data.bars.what} در ۷ روز اخیر`} chip="هفتهٔ قبل در مقایسه" id="c-h-bars">
              <BarsBlock bars={data.bars} />
            </Panel>
          ) : null}
          <Panel title="میان‌برها" id="c-h-quick">
            <Quick items={data.quick} />
          </Panel>
          {data.summary ? (
            <Panel title="خلاصهٔ مالی ۳۰ روز اخیر" id="c-h-summary">
              <SummaryBlock s={data.summary} />
            </Panel>
          ) : null}
        </div>
      </div>
    </section>
  )
}
