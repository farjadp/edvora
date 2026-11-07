import { ActivityList, AlertList, BarCompare, DonutWithLegend, KpiCard, KpiGrid, Panel, PageHeader, QuickActions, SeriesLegend, SummaryCard, consoleBtn } from '@edvora/ui/console'
import { toPersianDigits as fa } from '@edvora/core/digits'
import type { ReactNode } from 'react'
import type { OverviewData } from '../../lib/consoleData'

/** Wrapper every desk page uses: stable hook for e2e and the shared vertical rhythm. */
export function DeskPage({ desk, children }: { desk: string; children: ReactNode }) {
  return (
    <div data-testid="desk" data-desk={desk} className="grid min-w-0 gap-6">
      {children}
    </div>
  )
}

export { PageHeader, KpiGrid, KpiCard, Panel, consoleBtn }

/** Two-thirds / one-third grid; stacks on small screens. */
export function MainSide({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-6">{main}</div>
      <div className="grid min-w-0 gap-6">{side}</div>
    </div>
  )
}

/** The panels shared by the overview and the dashboard: donut, week bars, alerts, quick actions, activity, summary. */
export function OverviewPanels({ data }: { data: OverviewData }) {
  return (
    <>
      <KpiGrid>
        {data.kpis.map(({ key, ...k }) => (
          <KpiCard key={key} {...k} />
        ))}
      </KpiGrid>
      {data.kpis.length === 0 ? (
        <Panel title="آمار">
          <p className="text-muted">برای نقش شما هنوز آماری فعال نشده است.</p>
        </Panel>
      ) : null}
      <MainSide
        main={
          <>
            <Panel title="هشدارها" headingId="h-alerts" chip={data.alerts.length ? `${fa(data.alerts.length)} مورد` : undefined}>
              <AlertList items={data.alerts} emptyTitle="موردی نیاز به توجه ندارد." emptyDescription="اقساط سررسیدگذشته، تکلیف‌های بی‌نمره و سرنخ‌های بی‌پیگیری اینجا نمایش داده می‌شوند." />
            </Panel>
            <Panel title="رویدادهای اخیر" headingId="h-activity">
              <ActivityList items={data.activity} emptyTitle="هنوز رویدادی ثبت نشده است." emptyDescription="سفارش‌ها، ثبت‌نام‌ها، سرنخ‌ها و تکلیف‌ها که برسند، اینجا دیده می‌شوند." />
            </Panel>
          </>
        }
        side={
          <>
            {data.donut ? (
              <Panel title="ثبت‌نام فعال به تفکیک دوره" headingId="h-donut">
                {data.donut.segments.length ? (
                  <DonutWithLegend segments={data.donut.segments} centerValue={data.donut.centerValue} centerLabel={data.donut.centerLabel} label="سهم هر دوره از ثبت‌نام‌های فعال" />
                ) : (
                  <p className="py-6 text-center text-sm text-muted">ثبت‌نام فعالی وجود ندارد.</p>
                )}
              </Panel>
            ) : null}
            {data.bars ? (
              <Panel title={`${data.bars.what} در ۷ روز اخیر`} headingId="h-bars" chip="هفتهٔ قبل در مقایسه">
                {data.bars.empty ? (
                  <p className="py-6 text-center text-sm text-muted">در ۱۴ روز گذشته رویدادی ثبت نشده است.</p>
                ) : (
                  <>
                    <span className="block h-40">
                      <BarCompare categories={data.bars.categories} series={data.bars.series} label={`مقایسهٔ ${data.bars.what} این هفته با هفتهٔ قبل`} />
                    </span>
                    <SeriesLegend items={data.bars.series.map((s) => ({ label: s.label, tone: s.tone ?? 1 }))} />
                  </>
                )}
              </Panel>
            ) : null}
            <Panel title="میان‌برها" headingId="h-quick">
              <QuickActions items={data.quick} />
            </Panel>
            {data.summary ? (
              <Panel title="خلاصهٔ مالی ۳۰ روز اخیر" headingId="h-summary">
                <SummaryCard totalLabel="مجموع سفارش‌های باز و تسویه‌شده" totalValue={data.summary.totalValue} rows={data.summary.rows} footer={data.summary.footer} />
              </Panel>
            ) : null}
          </>
        }
      />
    </>
  )
}
