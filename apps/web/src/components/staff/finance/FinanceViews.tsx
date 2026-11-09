import {
  CONTACT_OUTCOMES,
  OVERDUE_BUCKETS,
  REFUND_STATUS_LABELS,
  UPCOMING_WINDOWS,
  defaultExportRange,
  formatJalali,
  formatToman,
  overdueInstalments,
  refundActionsFor,
  rial,
  upcomingInstalments,
  type OverdueFilter,
  type RefundStatus,
  type UpcomingWindow,
} from '@edvora/core'
import { DataTable, EmptyState, EntityCell, FilterBar, FilterSelect, KpiCard, KpiGrid, Panel, Pill, consoleBtn, type Column } from '@edvora/ui/console'
import { fa } from '../../../lib/consoleData'
import type { FinanceActor, FinanceData, InstalmentRow, RefundListRow } from '../../../lib/finance'
import { idOf } from '../../../lib/ids'
import { ContactNoteForm, RefundActions } from './FinanceForms'

const BASE = '/staff/finance'
export type FinanceTab = 'overview' | 'overdue' | 'upcoming' | 'refunds' | 'export'

const TAB_LABEL: Record<FinanceTab, string> = { overview: 'نمای کلی', overdue: 'اقساط معوق', upcoming: 'اقساط پیش رو', refunds: 'بازپرداخت‌ها', export: 'خروجی اکسل' }

export function financeTabs(a: FinanceActor): FinanceTab[] {
  const tabs: FinanceTab[] = ['overview']
  if (a.canView) tabs.push('overdue', 'upcoming')
  if (a.canView || a.canApprove || a.canRequest) tabs.push('refunds')
  if (a.canExport) tabs.push('export')
  return tabs
}

export function FinanceTabs({ tabs, current }: { tabs: readonly FinanceTab[]; current: FinanceTab }) {
  if (tabs.length < 2) return null
  return (
    <nav aria-label="بخش‌های میز مالی" className="flex flex-wrap gap-2 border-b border-line pb-3" data-testid="finance-tabs">
      {tabs.map((t) => (
        <a
          key={t}
          href={t === 'overview' ? BASE : `${BASE}?tab=${t}`}
          aria-current={t === current ? 'page' : undefined}
          className={t === current ? consoleBtn.primary : consoleBtn.ghost}
        >
          {TAB_LABEL[t]}
        </a>
      ))}
    </nav>
  )
}

/** The four E-023 numbers, all in toman with Persian digits. */
export function FinanceKpis({ data }: { data: FinanceData }) {
  const k = data.kpis
  return (
    <div data-testid="finance-kpis">
      <KpiGrid>
        <KpiCard testId="kpi-collected" label="دریافتی این ماه" value={formatToman(k.collectedThisMonth, { unit: false })} hint="تومان، قسط‌های تسویه‌شده از اول ماه" icon="card" />
        <KpiCard testId="kpi-due-week" label="سررسید ۷ روز آینده" value={formatToman(k.dueThisWeek.amount, { unit: false })} hint={`تومان، ${fa(k.dueThisWeek.count)} قسط`} icon="calendar" href={`${BASE}?tab=upcoming`} />
        <KpiCard testId="kpi-overdue" label="معوق" value={formatToman(k.overdue.amount, { unit: false })} hint={`تومان، ${fa(k.overdue.count)} قسط`} icon="clock" href={`${BASE}?tab=overdue`} />
        <KpiCard testId="kpi-pending" label="در انتظار تأیید" value={fa(data.pendingConfirmations)} hint="پرداخت‌هایی که منتظر بررسی همکاران هستند" icon="inbox" href={`${BASE}#h-queue`} />
      </KpiGrid>
    </div>
  )
}

const studentCell = (r: InstalmentRow) => (
  <span className="grid">
    <span className="max-w-40 truncate font-bold">{r.student}</span>
    {r.phone ? (
      <span dir="ltr" className="text-end font-latin text-xs text-muted">
        {r.phone}
      </span>
    ) : null}
  </span>
)
const courseCell = (r: InstalmentRow) => (
  <span className="grid">
    <span className="max-w-44 truncate">{r.course}</span>
    {r.cohort ? <span className="max-w-44 truncate text-xs text-muted">{r.cohort}</span> : null}
  </span>
)
const contactCell = (r: InstalmentRow) =>
  r.lastContact ? (
    <span className="grid text-xs" data-testid="last-contact">
      <span className="font-bold">{CONTACT_OUTCOMES[r.lastContact.outcome]}</span>
      <span className="text-muted">
        {formatJalali(r.lastContact.at, 'd MMM HH:mm')} · {r.lastContact.by}
      </span>
      {r.lastContact.note ? <span className="max-w-48 truncate text-muted">{r.lastContact.note}</span> : null}
    </span>
  ) : (
    <span className="text-xs text-muted">هنوز تماسی ثبت نشده</span>
  )

const OUTCOMES = Object.entries(CONTACT_OUTCOMES).map(([value, label]) => ({ value, label }))

export function OverdueView({ data, filter, back }: { data: FinanceData; filter: OverdueFilter; back: string }) {
  const rows = overdueInstalments(data.rows, filter)
  const total = rows.reduce((n, r) => n + r.amount, 0)
  const cohorts = data.cohorts.filter((c) => !filter.courseId || c.courseId === filter.courseId)
  const columns: Column<InstalmentRow>[] = [
    { key: 'student', header: 'دانشجو', cell: studentCell },
    { key: 'course', header: 'دوره', cell: courseCell },
    { key: 'index', header: 'قسط', cell: (r) => <span className="whitespace-nowrap">{fa(r.index + 1)}</span> },
    { key: 'amount', header: 'مبلغ', cell: (r) => <span className="whitespace-nowrap font-bold">{formatToman(r.amount)}</span> },
    {
      key: 'late',
      header: 'تأخیر',
      cell: (r) => (
        <span className="grid gap-1">
          <Pill tone={r.daysLate > 30 ? 'danger' : 'warn'}>{fa(r.daysLate)} روز</Pill>
          {r.awaitingReview ? <span className="text-xs text-muted">پرداختی در انتظار بررسی است</span> : null}
        </span>
      ),
    },
    { key: 'contact', header: 'آخرین تماس', cell: contactCell },
    {
      key: 'actions',
      header: 'کار',
      cell: (r) => (
        <div className="grid justify-items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <a href={`/staff/payments/orders/${r.orderId}`} className={consoleBtn.small}>
              سفارش {fa(r.orderId)}
            </a>
            <a href={`/staff/payments/orders/${r.orderId}#h-manual`} className={consoleBtn.small}>
              ثبت پرداخت دستی
            </a>
          </div>
          <ContactNoteForm orderId={r.orderId} index={r.index} outcomes={OUTCOMES} back={back} />
        </div>
      ),
    },
  ]
  return (
    <div className="grid min-w-0 gap-6" data-testid="overdue-view">
      <FilterBar action={BASE} resetHref={`${BASE}?tab=overdue`}>
        <input type="hidden" name="tab" value="overdue" />
        <FilterSelect name="course" label="دوره" defaultValue={filter.courseId ? String(filter.courseId) : ''} options={[{ value: '', label: 'همه' }, ...data.courses.map((c) => ({ value: String(c.id), label: c.title }))]} />
        <FilterSelect name="cohort" label="دورهٔ برگزاری" defaultValue={filter.cohortId ? String(filter.cohortId) : ''} options={[{ value: '', label: 'همه' }, ...cohorts.map((c) => ({ value: String(c.id), label: c.title }))]} />
        <FilterSelect name="late" label="مدت تأخیر" defaultValue={filter.bucket ?? ''} options={[{ value: '', label: 'همه' }, ...Object.entries(OVERDUE_BUCKETS).map(([value, b]) => ({ value, label: b.label }))]} />
      </FilterBar>
      <Panel title="اقساط معوق" subtitle={`${fa(rows.length)} قسط · ${formatToman(rial(total))}`} headingId="h-overdue">
        <DataTable
          caption="اقساط سررسیدگذشته"
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.orderId}-${r.index}`}
          empty={<EmptyState icon="check" title="قسط معوقی با این فیلتر نیست." description="قسط‌هایی که سررسیدشان گذشته و پرداخت نشده‌اند اینجا می‌آیند." />}
        />
        {data.capped ? <p className="mt-3 text-xs text-muted">فقط ۵٬۰۰۰ سفارش باز اول خوانده شد.</p> : null}
      </Panel>
    </div>
  )
}

export function UpcomingView({ data, days }: { data: FinanceData; days: UpcomingWindow }) {
  const rows = upcomingInstalments(data.rows, days)
  const total = rows.reduce((n, r) => n + r.amount, 0)
  const columns: Column<InstalmentRow>[] = [
    { key: 'due', header: 'سررسید', cell: (r) => <span className="whitespace-nowrap">{r.daysLate === 0 ? 'امروز' : formatJalali(r.dueDate, 'EEEE d MMMM')}</span> },
    { key: 'student', header: 'دانشجو', cell: studentCell },
    { key: 'course', header: 'دوره', cell: courseCell },
    { key: 'index', header: 'قسط', cell: (r) => fa(r.index + 1) },
    { key: 'amount', header: 'مبلغ', cell: (r) => <span className="whitespace-nowrap font-bold">{formatToman(r.amount)}</span> },
    {
      key: 'order',
      header: 'سفارش',
      cell: (r) => <EntityCell icon="orders" title={`سفارش ${fa(r.orderId)}`} code={r.awaitingReview ? 'پرداخت در انتظار بررسی' : undefined} href={`/staff/payments/orders/${r.orderId}`} />,
    },
  ]
  return (
    <div className="grid min-w-0 gap-6" data-testid="upcoming-view">
      <nav aria-label="بازهٔ زمانی" className="flex gap-2">
        {UPCOMING_WINDOWS.map((w) => (
          <a key={w} href={`${BASE}?tab=upcoming&days=${w}`} aria-current={w === days ? 'page' : undefined} className={w === days ? consoleBtn.primary : consoleBtn.secondary}>
            {fa(w)} روز آینده
          </a>
        ))}
      </nav>
      <Panel title={`اقساط ${fa(days)} روز آینده`} subtitle={`${fa(rows.length)} قسط · ${formatToman(rial(total))}`} headingId="h-upcoming">
        <DataTable
          caption="اقساط پیش رو"
          columns={columns}
          rows={rows}
          rowKey={(r) => `${r.orderId}-${r.index}`}
          empty={<EmptyState icon="calendar" title="در این بازه قسطی سررسید نمی‌شود." />}
        />
      </Panel>
    </div>
  )
}

const REFUND_FILTERS: { value: RefundStatus | ''; label: string }[] = [{ value: '', label: 'همه' }, ...(Object.entries(REFUND_STATUS_LABELS) as [RefundStatus, { label: string }][]).map(([value, v]) => ({ value, label: v.label }))]

export function RefundRow({ r, actor, back, showOrder = true }: { r: RefundListRow; actor: FinanceActor; back: string; showOrder?: boolean }) {
  const st = REFUND_STATUS_LABELS[r.status]
  const actions = refundActionsFor({ status: r.status, requestedBy: idOf(r.requestedBy), studentId: idOf(r.user)! }, actor)
  return (
    <li className="grid gap-3 rounded-xl border border-line p-4" data-testid={`refund-${r.id}`} data-status={r.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <p className="font-bold">
            {formatToman(rial(r.amount))} {r.full ? <span className="text-sm font-normal text-muted">(کامل)</span> : <span className="text-sm font-normal text-muted">(بخشی)</span>}
          </p>
          <p className="text-sm text-muted">
            {showOrder ? (
              <>
                <a href={`/staff/payments/orders/${idOf(r.order)}`} className="underline underline-offset-4">
                  سفارش {fa(idOf(r.order)!)}
                </a>{' '}
                · {r.studentName} · {r.courseTitle} ·{' '}
              </>
            ) : null}
            درخواست: {r.requester} · {formatJalali(r.requestedAt ?? r.createdAt, 'd MMM yyyy HH:mm')}
            {r.approver ? ` · تأیید: ${r.approver}` : ''}
          </p>
        </div>
        <Pill tone={st.tone}>{st.label}</Pill>
      </div>
      <p className="text-sm leading-6">دلیل: {r.reason}</p>
      {r.status === 'refunded' && r.reference ? (
        <p className="text-sm text-muted">
          واریز شد {r.refundedAt ? formatJalali(r.refundedAt, 'd MMM yyyy') : ''} · شمارهٔ پیگیری{' '}
          <span dir="ltr" className="font-latin">
            {r.reference}
          </span>
        </p>
      ) : null}
      {r.status === 'rejected' && r.rejectionReason ? <p className="text-sm text-danger">دلیل رد: {r.rejectionReason}</p> : null}
      <RefundActions refundId={r.id} actions={actions} back={back} />
    </li>
  )
}

export function RefundsView({ rows, actor, status }: { rows: RefundListRow[]; actor: FinanceActor; status: RefundStatus | null }) {
  const back = `${BASE}?tab=refunds${status ? `&status=${status}` : ''}`
  return (
    <div className="grid min-w-0 gap-6" data-testid="refunds-view">
      <FilterBar action={BASE} resetHref={`${BASE}?tab=refunds`}>
        <input type="hidden" name="tab" value="refunds" />
        <FilterSelect name="status" label="وضعیت" defaultValue={status ?? ''} options={REFUND_FILTERS} />
      </FilterBar>
      <Panel title="بازپرداخت‌ها" subtitle="درخواست را یک نفر ثبت می‌کند و همکار دیگری تأیید می‌کند. درخواست تازه از صفحهٔ هر سفارش ثبت می‌شود." headingId="h-refunds">
        {rows.length === 0 ? (
          <EmptyState icon="refresh" title="بازپرداختی ثبت نشده است." description="برای درخواست بازپرداخت، سفارش دانشجو را باز کنید." />
        ) : (
          <ul className="grid gap-3">
            {rows.map((r) => (
              <RefundRow key={r.id} r={r} actor={actor} back={back} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

export function ExportView({ now }: { now: Date }) {
  const def = defaultExportRange(now)
  const field = 'h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none focus:border-focus focus:ring-1 focus:ring-focus'
  return (
    <Panel
      title="خروجی اکسل"
      subtitle="پرداخت‌ها، اقساط و بازپرداخت‌های این آکادمی در یک فایل اکسل با سه برگه. مبلغ‌ها به تومان (و ریال) و تاریخ‌ها شمسی است. هر خروجی در گزارش ممیزی ثبت می‌شود."
      headingId="h-export"
    >
      <form method="get" action="/staff/payments/export" className="flex flex-wrap items-end gap-3" data-testid="export-form">
        <label className="grid gap-1 text-sm font-bold">
          از تاریخ
          <input type="date" name="from" required defaultValue={def.from} dir="ltr" className={`${field} font-latin`} />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          تا تاریخ
          <input type="date" name="to" required defaultValue={def.to} dir="ltr" className={`${field} font-latin`} />
        </label>
        <button className={consoleBtn.primary}>دریافت فایل اکسل</button>
      </form>
      <p className="mt-3 text-xs leading-6 text-muted">
        بازهٔ پیش‌فرض: از اول ماه جاری ({formatJalali(now, 'MMMM yyyy')}) تا امروز. هر دو روز جزو بازه است؛ حداکثر یک سال.
      </p>
    </Panel>
  )
}
