import { toPersianDigits } from '@edvora/core/digits'
import type { ServerProps } from 'payload'
import { PERIOD_DAYS, applyWidgets, getOverview, scopeLabel, staffAccess, type CollAccess } from '../../lib/consoleData'
import { getAdminConsoleContext } from '../../lib/adminTenant'
import { payloadAllows } from '../../lib/consoleNav'
import { Activity, Alerts, BarsBlock, DonutBlock, Empty, Kpis, Panel, Quick, SummaryBlock } from './console'

/**
 * Admin landing (E-035): greeting, 4 KPIs, alerts, recent events, charts, quick actions, financial summary, all from
 * real data (`getOverview`, shared with /staff/overview). What shows is driven by Payload's own `permissions` for this
 * user and their membership permissions; every query runs with the collection's access rules (`overrideAccess: false`).
 * Scope (`ConsoleScope`, labelled in the eyebrow): the academy picked in the nav selector; else the academies the
 * person is staff in; else, for an Edvora platform admin only, the whole platform.
 */
export async function DashboardHome({ payload, permissions, user: serverUser }: ServerProps) {
  const ctx = await getAdminConsoleContext(payload)
  if (!ctx) return null
  const { user, tenant, scope } = ctx
  // Both gates: Payload's own permission for the collection AND the staff permission behind the number.
  const can = (slug: string, action: 'read' | 'create') => payloadAllows(permissions, slug, action)
  const staff = staffAccess(ctx.who)
  const access: CollAccess = {
    orders: staff.orders && can('orders', 'read'),
    enrollments: staff.enrollments && can('enrollments', 'read'),
    leads: staff.leads && can('leads', 'read'),
    submissions: staff.submissions && can('submissions', 'read'),
    create: { courses: can('courses', 'create'), coupons: can('coupons', 'create'), posts: can('posts', 'create'), users: can('users', 'create') },
  }
  const data = applyWidgets(await getOverview({ payload, user, scope, req: ctx.req }, access), ctx.who.experience)
  const name = (serverUser as { name?: string | null } | undefined)?.name?.trim() || user.email

  return (
    <section className="c-dash" aria-labelledby="c-dash-title">
      <header className="c-dash__head">
        <div>
          <p className="c-eyebrow" data-scope={scope.kind}>{scopeLabel(scope, tenant?.name)}</p>
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

      {data.kpis.length ? <Kpis items={data.kpis} /> : data.hidden?.kpis ? null : <Empty icon="chart" title="برای حساب شما هنوز آماری فعال نشده است." text="با مدیر آکادمی تماس بگیرید." />}

      <div className="c-grid">
        <div className="c-col">
          {data.hidden?.alerts ? null : (
            <div id="alerts">
              <Panel title="هشدارها" id="c-h-alerts" chip={data.alerts.length ? `${toPersianDigits(String(data.alerts.length))} مورد` : undefined}>
                <Alerts items={data.alerts} />
              </Panel>
            </div>
          )}
          {data.hidden?.activity ? null : (
            <Panel title="رویدادهای اخیر" id="c-h-activity">
              <Activity items={data.activity} />
            </Panel>
          )}
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
          {data.hidden?.quick ? null : (
            <Panel title="میان‌برها" id="c-h-quick">
              <Quick items={data.quick} />
            </Panel>
          )}
          {data.summary ? (
            <Panel title="سفارش‌های ۳۰ روز اخیر" id="c-h-summary">
              <SummaryBlock s={data.summary} />
            </Panel>
          ) : null}
        </div>
      </div>
    </section>
  )
}
