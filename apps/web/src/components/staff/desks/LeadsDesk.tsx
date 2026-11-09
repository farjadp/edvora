import { formatJalali } from '@edvora/core'
import type { CrmKpis } from '@edvora/core/crm'
import { toPersianDigits as fa } from '@edvora/core/digits'
import { LEAD_OUTCOME_LABELS_FA } from '@edvora/core/staff-goals'
import { GoalRing, Icon, ProgressRing, cx } from '@edvora/ui'
import { Pill, DataTable, DonutWithLegend, EmptyState, FilterBar, FilterSearch, FilterSelect, KpiCard, KpiGrid, Panel, type Column } from '@edvora/ui/console'
import { focusRing } from '@edvora/ui/classes'
import type { AdvisorDesk, AdvisorRow, DeskFilter } from '../../../lib/advisorDesk'
import type { CrmFilters, CrmRow, CrmView } from '../../../lib/crmDesk'
import { LEAD_STATUS, pill } from '../../../lib/consoleLabels'
import { ClaimButton } from '../crm/LeadControls'
import { OutcomeChips } from '../OutcomeChips'
import { DeskPage, MainSide, PageHeader, consoleBtn } from '../Desk'

export type LeadsDeskProps = {
  name: string
  view: CrmView
  /** Tabs this person may open (pool: `leads.claim` without ownRecordsOnly; team: `leads.view.all`). */
  tabs: { pool: boolean; team: boolean }
  kpis: CrmKpis
  /** Today's follow-ups (view `today`). */
  desk: AdvisorDesk
  filter: DeskFilter
  q: string
  /** List views (`mine`, `pool`, `team`); null = the view is not open to this person. */
  list: { rows: CrmRow[]; total: number } | null
  filters: CrmFilters
  courses: { id: number; title: string }[]
  sources: string[]
  /** Own leads by status (counts). */
  mix: { status: string; n: number }[]
  adminLink?: { label: string; href: string }
}

const TABS: { view: CrmView; label: string }[] = [
  { view: 'today', label: 'پیگیری‌های امروز' },
  { view: 'mine', label: 'سرنخ‌های من' },
  { view: 'pool', label: 'بی‌مشاور' },
  { view: 'team', label: 'همهٔ سرنخ‌ها' },
]

const DATES = [
  { value: 'all', label: 'همهٔ تاریخ‌ها' },
  { value: 'today', label: 'امروز' },
  { value: '7d', label: '۷ روز گذشته' },
  { value: 'month', label: 'این ماه' },
]

const leadHref = (id: number) => `/staff/leads/${id}`

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
              <a href={leadHref(r.id)} data-testid="lead-link" className={cx('rounded-sm hover:text-brand-text', focusRing)}>
                {r.name}
              </a>
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
      {r.doneOutcome ? null : (
        <a href={`${leadHref(r.id)}#log`} data-testid="log-call-link" className={cx(consoleBtn.ghost, 'mt-2 h-9 px-2')}>
          ثبت تماس با یادداشت و تاریخ <span aria-hidden>←</span>
        </a>
      )}
    </li>
  )
}

function Tabs({ view, tabs }: { view: CrmView; tabs: LeadsDeskProps['tabs'] }) {
  const open = TABS.filter((t) => (t.view === 'pool' ? tabs.pool : t.view === 'team' ? tabs.team : true))
  return (
    <nav aria-label="نمای سرنخ‌ها" className="-mb-2 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {open.map((t) => (
          <li key={t.view}>
            <a
              href={t.view === 'today' ? '/staff/leads' : `/staff/leads?v=${t.view}`}
              data-testid={`crm-tab-${t.view}`}
              aria-current={t.view === view ? 'page' : undefined}
              className={cx('-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-bold', t.view === view ? 'border-brand text-brand-text' : 'border-transparent text-muted hover:text-ink', focusRing)}
            >
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function LeadList({ view, list, filters, courses, sources }: Pick<LeadsDeskProps, 'list' | 'filters' | 'courses' | 'sources'> & { view: Exclude<CrmView, 'today'> }) {
  const columns: Column<CrmRow>[] = [
    {
      key: 'name',
      header: 'نام',
      cell: (r) => (
        <span className="grid min-w-0">
          <a href={leadHref(r.id)} data-testid="lead-link" className={cx('max-w-56 truncate rounded-sm font-bold hover:text-brand-text', focusRing)}>
            {r.name}
          </a>
          <a href={`tel:${r.phone}`} dir="ltr" className={cx('text-start font-latin text-xs text-muted hover:text-brand-text', focusRing)}>
            {r.phone}
          </a>
        </span>
      ),
    },
    { key: 'course', header: 'دوره', cell: (r) => r.courseTitle ?? <span className="text-muted">—</span> },
    {
      key: 'status',
      header: 'وضعیت',
      cell: (r) => {
        const p = pill(LEAD_STATUS, r.status)
        return <Pill tone={p.tone}>{p.label}</Pill>
      },
    },
    ...(view === 'team' ? [{ key: 'advisor', header: 'مشاور', cell: (r: CrmRow) => r.advisorName ?? <Pill tone="warn">بی‌مشاور</Pill> }] : []),
    { key: 'source', header: 'منبع', cell: (r) => (r.source === 'direct' ? 'فرم سایت' : <span dir="ltr" className="font-latin">{r.source}</span>) },
    { key: 'created', header: 'ثبت', cell: (r) => formatJalali(r.createdAt, 'd MMMM') },
    {
      key: 'next',
      header: 'پیگیری بعدی',
      cell: (r) =>
        r.nextFollowUpAt && r.due !== 'none' ? (
          <span className={cx(r.due === 'overdue' && 'font-bold text-danger')}>
            {r.due === 'overdue' ? 'عقب‌افتاده · ' : ''}
            {formatJalali(r.nextFollowUpAt, 'd MMMM')} · {formatJalali(r.nextFollowUpAt, 'HH:mm')}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    ...(view === 'pool' ? [{ key: 'claim', header: 'برداشتن', align: 'end' as const, cell: (r: CrmRow) => <ClaimButton leadId={r.id} name={r.name} compact /> }] : []),
  ]
  return (
    <>
      <FilterBar action="/staff/leads" resetHref={`/staff/leads?v=${view}`}>
        <input type="hidden" name="v" value={view} />
        <FilterSearch label="جست‌وجوی نام یا موبایل" placeholder="نام یا شمارهٔ موبایل" defaultValue={filters.q} />
        <FilterSelect name="status" label="وضعیت" defaultValue={filters.status} options={[{ value: '', label: 'همه' }, ...Object.entries(LEAD_STATUS).map(([value, l]) => ({ value, label: l.label }))]} />
        <FilterSelect name="course" label="دوره" defaultValue={filters.course ? String(filters.course) : ''} options={[{ value: '', label: 'همهٔ دوره‌ها' }, ...courses.map((c) => ({ value: String(c.id), label: c.title }))]} />
        <FilterSelect name="source" label="منبع" defaultValue={filters.source} options={[{ value: '', label: 'همهٔ منبع‌ها' }, { value: 'direct', label: 'فرم سایت (بدون UTM)' }, ...sources.map((x) => ({ value: x, label: x }))]} />
        <FilterSelect name="d" label="تاریخ ثبت" defaultValue={filters.date} options={DATES} />
      </FilterBar>
      <Panel
        title={view === 'pool' ? 'سرنخ‌های بی‌مشاور' : view === 'team' ? 'همهٔ سرنخ‌ها' : 'سرنخ‌های من'}
        subtitle={list ? (list.total > list.rows.length ? `${fa(list.rows.length)} از ${fa(list.total)} مورد (جدیدترین‌ها)` : `${fa(list.total)} مورد`) : undefined}
        headingId="h-list"
      >
        <div data-testid="crm-list" data-view={view}>
          {list ? (
            <DataTable
              columns={columns}
              rows={list.rows}
              rowKey={(r) => String(r.id)}
              caption="فهرست سرنخ‌ها"
              empty={
                <div data-testid="list-empty">
                  <EmptyState icon="inbox" title={view === 'pool' ? 'سرنخ بی‌مشاوری نیست.' : 'سرنخی با این فیلترها پیدا نشد.'} description={view === 'pool' ? 'سرنخ‌های تازهٔ فرم سایت تا وقتی کسی برشان ندارد اینجا می‌مانند.' : undefined} />
                </div>
              }
            />
          ) : (
            <EmptyState icon="lock" title="این نما برای شما باز نیست." />
          )}
        </div>
      </Panel>
    </>
  )
}

/** Advisor CRM desk (E-015; UX §2.4 + E-035 layout): tabs, KPIs, today's queue with outcome chips, list views. */
export function LeadsDesk({ name, view, tabs, kpis, desk, filter, q, list, filters, courses, sources, mix, adminLink }: LeadsDeskProps) {
  const { daily, goals, team, rows, next } = desk
  const ringOn = Boolean(goals)
  const segs = mix.filter((m) => m.n > 0).map((m) => ({ label: LEAD_STATUS[m.status]?.label ?? m.status, value: m.n, display: fa(m.n) }))
  const conv = kpis.conversion
  return (
    <DeskPage desk="leads">
      <div data-testid="leads-desk" data-view={view} data-goals={ringOn ? 'on' : 'off'} className="grid min-w-0 gap-6">
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
                <a href={view === 'today' ? `#lead-${next.id}` : leadHref(next.id)} data-testid="next-follow-up" className={consoleBtn.primary}>
                  <span className="truncate">پیگیری بعدی: {next.name}</span>
                </a>
              ) : null}
            </>
          }
        />

        <KpiGrid>
          <KpiCard testId="kpi-new-today" label="سرنخ تازهٔ امروز" value={fa(kpis.newToday)} icon="star" hint={tabs.team ? 'همهٔ سرنخ‌های امروز آکادمی' : tabs.pool ? 'سرنخ‌های شما و بی‌مشاورها' : 'سرنخ‌هایی که امروز به شما رسید'} />
          <KpiCard
            testId="kpi-due-today"
            label="پیگیری امروز"
            value={fa(kpis.dueToday)}
            icon="phone"
            hint="سررسید امروز، بدون عقب‌افتاده‌ها"
            progress={daily.due > 0 ? { pct: (daily.done / daily.due) * 100, text: `${fa(daily.done)} از ${fa(daily.due)} انجام شد`, tone: 'ok' } : undefined}
          />
          <KpiCard testId="kpi-overdue" label="عقب‌افتاده" value={fa(kpis.overdue)} icon="clock" hint={kpis.overdue ? 'پیش از امروز سررسید شده‌اند' : 'همه به‌روز است'} />
          <KpiCard
            testId="kpi-conversion"
            label="تبدیل این ماه"
            value={conv.pct === null ? '—' : `${fa(conv.pct)}٪`}
            icon="trendUp"
            hint={conv.created ? `${fa(conv.enrolled)} ثبت‌نام از ${fa(conv.created)} سرنخ این ماه` : 'این ماه هنوز سرنخی ثبت نشده است'}
          />
        </KpiGrid>

        <Tabs view={view} tabs={tabs} />

        {view !== 'today' ? (
          <LeadList view={view} list={list} filters={filters} courses={courses} sources={sources} />
        ) : (
          <>
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
          </>
        )}
      </div>
    </DeskPage>
  )
}
