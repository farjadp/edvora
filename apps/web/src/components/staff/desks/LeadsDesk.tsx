import { formatJalali } from '@edvora/core'
import { toPersianDigits as fa } from '@edvora/core/digits'
import { LEAD_OUTCOME_LABELS_FA } from '@edvora/core/staff-goals'
import { GoalRing, Icon, ProgressRing, cx } from '@edvora/ui'
import { Pill, DonutWithLegend, EmptyState, FilterBar, FilterSearch, FilterSelect, KpiCard, KpiGrid, Panel } from '@edvora/ui/console'
import { focusRing } from '@edvora/ui/classes'
import type { AdvisorDesk, AdvisorRow, DeskFilter } from '../../../lib/advisorDesk'
import { LEAD_STATUS } from '../../../lib/consoleLabels'
import { OutcomeChips } from '../OutcomeChips'
import { DeskPage, MainSide, PageHeader, consoleBtn } from '../Desk'

export type LeadsDeskProps = {
  name: string
  desk: AdvisorDesk
  filter: DeskFilter
  q: string
  /** Own leads by status (counts). */
  mix: { status: string; n: number }[]
  /** New leads this period vs before, for the KPI. */
  newLeads: { value: string; delta?: import('@edvora/ui/console').KpiDelta; spark?: number[] } | null
  adminLink?: { label: string; href: string }
}

const FILTERS: { value: DeskFilter; label: string }[] = [
  { value: 'today', label: 'امروز' },
  { value: 'overdue', label: 'عقب‌افتاده' },
  { value: 'all', label: 'همه' },
]

function Row({ r }: { r: AdvisorRow }) {
  return (
    <li id={`lead-${r.id}`} data-testid="lead-row" data-lead={r.id} data-due={r.due} data-done={r.doneOutcome ?? undefined} className="scroll-mt-24 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-wash text-brand-text">
            <Icon name="phone" className="size-[1.125rem]" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold">
              {r.name}
              {r.courseTitle ? <span className="font-normal text-muted"> · {r.courseTitle}</span> : null}
            </p>
            <a href={`tel:${r.phone}`} dir="ltr" className={cx('inline-flex min-h-8 items-center rounded-sm font-latin text-sm text-muted hover:text-brand-text', focusRing)}>
              {r.phone}
            </a>
          </div>
        </div>
        {r.doneOutcome ? (
          <Pill tone="ok">
            <Icon name="check" className="size-3.5" />
            ثبت شد: {LEAD_OUTCOME_LABELS_FA[r.doneOutcome]}
          </Pill>
        ) : r.nextFollowUpAt ? (
          <p data-testid="lead-due" className={cx('text-sm', r.due === 'overdue' ? 'font-bold text-danger' : 'text-muted')}>
            {r.due === 'overdue' ? 'عقب‌افتاده · ' : ''}
            {formatJalali(r.nextFollowUpAt, 'd MMMM')} · {formatJalali(r.nextFollowUpAt, 'HH:mm')}
          </p>
        ) : null}
      </div>
      {r.doneOutcome ? null : r.due === 'overdue' || r.due === 'today' ? <OutcomeChips leadId={r.id} name={r.name} /> : null}
    </li>
  )
}

/** Advisor desk (UX §2.4 + E-035 layout): KPIs, filter bar, today's queue with outcome chips, goal ring and team line. */
export function LeadsDesk({ name, desk, filter, q, mix, newLeads, adminLink }: LeadsDeskProps) {
  const { daily, goals, team, counts, rows, next } = desk
  const ringOn = Boolean(goals)
  const segs = mix.filter((m) => m.n > 0).map((m) => ({ label: LEAD_STATUS[m.status]?.label ?? m.status, value: m.n, display: fa(m.n) }))
  return (
    <DeskPage desk="leads">
      <div data-testid="leads-desk" data-goals={ringOn ? 'on' : 'off'} className="grid min-w-0 gap-6">
        <PageHeader
          title="مشتریان بالقوه"
          subtitleTestId="advisor-greeting"
          subtitle={`سلام ${name}.${daily.due > 0 ? ` امروز ${fa(daily.due)} پیگیری دارید.` : ' امروز پیگیری عقب‌افتاده‌ای ندارید.'}${daily.remaining > 0 ? ` ${fa(daily.remaining)} پیگیری باقی مانده است.` : ''}`}
          actions={
            <>
              {adminLink ? (
                <a href={adminLink.href} className={consoleBtn.secondary}>
                  {adminLink.label} <span aria-hidden>↗</span>
                </a>
              ) : null}
              {next ? (
                <a href={`#lead-${next.id}`} data-testid="next-follow-up" className={consoleBtn.primary}>
                  <span className="truncate">پیگیری بعدی: {next.name}</span>
                </a>
              ) : null}
            </>
          }
        />

        <KpiGrid>
          <KpiCard label="پیگیری امروز" value={fa(counts.today)} icon="phone" hint="سرنخ‌های سررسید امروز" progress={daily.due > 0 ? { pct: (daily.done / daily.due) * 100, text: `${fa(daily.done)} از ${fa(daily.due)} انجام شد`, tone: 'ok' } : undefined} />
          <KpiCard label="عقب‌افتاده" value={fa(counts.overdue)} icon="clock" hint={counts.overdue ? 'پیش از امروز سررسید شده‌اند' : 'همه به‌روز است'} />
          <KpiCard label="سرنخ‌های باز من" value={fa(counts.all)} icon="leads" hint="جدید، در حال پیگیری یا تماس‌گرفته" />
          {newLeads ? <KpiCard label="سرنخ تازه (۳۰ روز)" value={newLeads.value} icon="star" delta={newLeads.delta} spark={newLeads.spark ? { values: newLeads.spark, label: 'روند ۱۴ روز گذشته', tone: 3 } : undefined} /> : null}
        </KpiGrid>

        <FilterBar action="/staff/leads" resetHref="/staff/leads">
          <FilterSearch label="جست‌وجوی نام یا شماره" placeholder="نام یا شمارهٔ تلفن" defaultValue={q} />
          <FilterSelect name="f" label="نمایش" defaultValue={filter} options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
        </FilterBar>

        <MainSide
          main={
            <Panel title="صف پیگیری" subtitle={`${fa(rows.length)} مورد`} headingId="queue">
              {rows.length ? (
                <ul className="divide-y divide-line">
                  {rows.map((r) => (
                    <Row key={r.id} r={r} />
                  ))}
                </ul>
              ) : (
                <div data-testid="queue-empty">
                  <EmptyState icon="inbox" title={q ? 'سرنخی با این جست‌وجو پیدا نشد.' : filter === 'overdue' ? 'پیگیری عقب‌افتاده‌ای ندارید.' : 'در این فهرست موردی نیست.'} description="وقتی سرنخ تازه‌ای به شما سپرده شود، اینجا می‌بینید." />
                </div>
              )}
            </Panel>
          }
          side={
            <>
              <Panel title="هدف امروز" headingId="goal">
                {daily.due === 0 ? (
                  <div data-testid="goal-empty">
                    <p className="font-display text-xl font-black">امروز پیگیری عقب‌افتاده‌ای ندارید.</p>
                    <p className="mt-1 leading-7 text-muted">فرصت خوبی برای تماس با سرنخ‌های جدید است.</p>
                    <a href="/staff/leads?f=all" className={cx(consoleBtn.secondary, 'mt-4')}>
                      سرنخ‌های جدید
                    </a>
                  </div>
                ) : ringOn ? (
                  <>
                    <GoalRing done={daily.done} total={daily.due} label={`${fa(daily.done)} از ${fa(daily.due)} پیگیری امروز`} valueText={`${fa(daily.done)} از ${fa(daily.due)}`} caption="پیگیری انجام شد" />
                    {goals && goals.streak.current > 0 ? (
                      <p data-testid="follow-up-streak" className="mt-4 text-sm leading-7">
                        {fa(goals.streak.current)} روز کاری پیاپی همه را پیگیری کردید.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div>
                    <p data-testid="goal-count" className="font-sans text-2xl font-bold tabular-nums">
                      {fa(daily.done)} از {fa(daily.due)} <span className="text-base font-normal text-muted">پیگیری انجام شد</span>
                    </p>
                    <progress
                      value={daily.done}
                      max={daily.due}
                      aria-label={`${fa(daily.done)} از ${fa(daily.due)} پیگیری امروز`}
                      className="mt-3 block h-2 w-full appearance-none overflow-hidden rounded-full bg-e-track [&::-moz-progress-bar]:bg-chart-1 [&::-webkit-progress-bar]:bg-e-track [&::-webkit-progress-value]:bg-chart-1"
                    />
                  </div>
                )}
                {daily.complete ? (
                  <div data-testid="goal-complete" className="mt-4 border-t border-line pt-4">
                    <p className="font-bold">همهٔ پیگیری‌های امروز انجام شد.</p>
                    <p className="text-sm text-muted">دست شما درد نکند.</p>
                  </div>
                ) : null}
              </Panel>
              {team ? (
                <section aria-labelledby="team" data-testid="team-goal" data-reached={team.reached}>
                  <Panel bodyClassName="flex items-center gap-4">
                    <ProgressRing value={team.pct} label={`تیم: ${fa(team.done)} از ${fa(team.target)} این هفته`} className="size-11" tone={team.reached ? 'ok' : 'brand'} />
                    <div className="min-w-0">
                      <h2 id="team" className="text-sm font-bold text-muted">
                        تیم این هفته
                      </h2>
                      <p data-testid="team-count" className="font-bold">
                        {fa(team.done)} از {fa(team.target)} پیگیری
                      </p>
                      {team.reached ? <p className="text-sm text-muted">هدف تیم این هفته کامل شد.</p> : null}
                    </div>
                  </Panel>
                </section>
              ) : null}
              <Panel title="سرنخ‌های من به تفکیک وضعیت" headingId="h-mix">
                {segs.length ? <DonutWithLegend segments={segs} centerValue={fa(segs.reduce((n, x) => n + x.value, 0))} centerLabel="سرنخ" label="سهم هر وضعیت از سرنخ‌های من" /> : <EmptyState icon="leads" title="هنوز سرنخی به شما سپرده نشده است." />}
              </Panel>
            </>
          }
        />
      </div>
    </DeskPage>
  )
}
