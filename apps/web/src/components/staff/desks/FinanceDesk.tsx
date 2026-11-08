import { MANUAL_CHANNELS, formatJalali, formatToman, rial } from '@edvora/core'
import { Pill, DataTable, EmptyState, EntityCell, FilterBar, FilterSelect, FilterSearch, KpiCard, KpiGrid, Pagination, Panel, AlertList, DonutWithLegend, type AlertItem, type Column } from '@edvora/ui/console'
import type { PayloadRequest, Where } from 'payload'
import { PERIOD_DAYS, PAGE_SIZE, deltaOf, fa, one, pageParam, pagerOf, sortHref, sortOf, settledTrend, sparkLabel, staffCtx, trend, count, has } from '../../../lib/consoleData'
import { ORDER_STATUS, pill } from '../../../lib/consoleLabels'
import { docOf } from '../../../lib/ids'
import { getFinanceInbox } from '../../../lib/gamificationQueries'
import type { StaffSession } from '../../../lib/staff'
import type { Course, Order, User } from '../../../payload-types'
import { DeskPage, MainSide, PageHeader, consoleBtn } from '../Desk'
import { reviewQueue, staffActor } from '../../../lib/payments'
import { ManualPaymentForm } from '../payments/PaymentForms'
import { ReviewQueue } from '../payments/ReviewQueue'

const KIND_LABEL = { to_verify: 'در انتظار بررسی', needs_attention: 'نیازمند توجه', overdue: 'سررسید گذشته' } as const
const BASE = '/staff/finance'

type Props = { s: StaffSession & { user: User; req: PayloadRequest }; sp: Record<string, string | string[] | undefined>; adminLink?: { label: string; href: string } }

/** Finance desk (E-028 G10 inbox + E-035 orders list): real counters, the unpaid-instalment inbox, orders with filters. */
export async function FinanceDesk({ s, sp, adminLink }: Props) {
  const c = staffCtx(s)
  const q = one(sp.q).trim()
  const status = one(sp.status)
  const page = pageParam(sp.page)
  const sorted = sortOf(one(sp.sort), ['createdAt', 'total', 'status'], '-createdAt')
  const params = { q: q || undefined, status: status || undefined, sort: one(sp.sort) || undefined }

  const where: Where[] = [{ tenant: { equals: s.tenant.id } }]
  if (status && status in ORDER_STATUS) where.push({ status: { equals: status } })
  if (/^\d+$/.test(q)) where.push({ id: { equals: Number(q) } })
  else if (q) where.push({ or: [{ 'user.name': { contains: q } }, { 'user.email': { contains: q } }] })

  // Orders read access also covers one's OWN purchases; the desk numbers need the staff permission itself.
  const view = has(s, 'orders.view')
  // ADR 017: the four-eyes queue and manual payments, for whoever can record or approve.
  const reviewer = has(s, 'payments.manual.record') || has(s, 'payments.manual.approve')
  const [queue, actor] = reviewer ? await Promise.all([reviewQueue(s), staffActor(s)]) : [null, null]
  const [inbox, sales, orderCount, list, mix] = await Promise.all([
    getFinanceInbox(s),
    view ? settledTrend(c) : null,
    view ? trend(c, 'orders') : null,
    view
      ? s.req.payload
          .find({ collection: 'orders', where: { and: where }, sort: sorted.sort, page, limit: PAGE_SIZE, depth: 1, overrideAccess: false, req: s.req })
          .catch(() => null)
      : null,
    view ? Promise.all(Object.keys(ORDER_STATUS).map(async (k) => ({ k, n: await count(c, 'orders', { status: { equals: k } }) }))) : [],
  ])

  const segs = mix.filter((m) => (m.n ?? 0) > 0).map((m) => ({ label: ORDER_STATUS[m.k]!.label, value: m.n ?? 0, display: fa(m.n ?? 0) }))
  const totalOrders = segs.reduce((n, x) => n + x.value, 0)

  const columns: Column<Order>[] = [
    {
      key: 'id',
      header: 'سفارش',
      cell: (o) => <EntityCell icon="orders" title={`سفارش ${fa(o.id)}`} code={`#${o.id}`} href={`/staff/payments/orders/${o.id}`} />,
    },
    { key: 'user', header: 'دانشجو', cell: (o) => <span className="block max-w-40 truncate">{docOf<User>(o.user)?.name || docOf<User>(o.user)?.email || '—'}</span> },
    { key: 'course', header: 'دوره', cell: (o) => <span className="block max-w-44 truncate">{docOf<Course>(o.course)?.title ?? '—'}</span> },
    { key: 'total', header: 'مبلغ', sort: sortHref(BASE, params, 'total', sorted), cell: (o) => <span className="whitespace-nowrap font-bold">{formatToman(rial(o.total))}</span> },
    {
      key: 'status',
      header: 'وضعیت',
      sort: sortHref(BASE, params, 'status', sorted),
      cell: (o) => {
        const p = pill(ORDER_STATUS, o.status)
        return <Pill tone={p.tone}>{p.label}</Pill>
      },
    },
    { key: 'createdAt', header: 'تاریخ', sort: sortHref(BASE, params, 'createdAt', sorted), cell: (o) => <span className="whitespace-nowrap text-muted">{formatJalali(o.createdAt, 'd MMM yyyy')}</span> },
  ]
  const pager = list ? pagerOf(BASE, params, list.page ?? 1, list.totalPages, list.totalDocs) : null

  const alertItems: AlertItem[] = (inbox?.items ?? []).map((it) => ({
    key: `${it.orderId}-${it.instalmentIndex}-${it.kind}`,
    icon: it.kind === 'overdue' ? 'clock' : 'alert',
    title: `سفارش ${fa(it.orderId)} · قسط ${fa(it.instalmentIndex + 1)}`,
    detail: `${KIND_LABEL[it.kind]} · ${formatToman(rial(it.amount))}`,
    pill: { tone: it.kind === 'overdue' ? 'danger' : 'warn', label: KIND_LABEL[it.kind] },
    action: { label: 'بررسی سفارش', href: `/staff/payments/orders/${it.orderId}` },
  }))

  return (
    <DeskPage desk="finance">
      <div data-testid="finance-desk" data-zero={inbox ? inbox.zero : undefined} className="grid min-w-0 gap-6">
        <PageHeader
          title="مالی"
          subtitle={`پرداخت‌ها، اقساط و سفارش‌ها. آمار ${fa(PERIOD_DAYS)} روز گذشته در برابر ${fa(PERIOD_DAYS)} روز قبل از آن.`}
          actions={
            adminLink ? (
              <a href={adminLink.href} className={consoleBtn.secondary}>
                {adminLink.label} <span aria-hidden>↗</span>
              </a>
            ) : null
          }
        />
        <div data-testid={inbox ? 'inbox-counts' : undefined}>
          <KpiGrid>
            {inbox ? (
              <>
                <KpiCard testId="inbox-to_verify" label="در انتظار بررسی" value={fa(inbox.toVerify)} icon="inbox" hint="پرداخت‌هایی که منتظر تأیید شما هستند" />
                <KpiCard testId="inbox-needs_attention" label="نیازمند توجه" value={fa(inbox.needsAttention)} icon="alert" hint="تلاش پرداخت ناموفق" />
                <KpiCard testId="inbox-overdue" label="سررسید گذشته" value={fa(inbox.overdue)} icon="clock" hint="قسط‌های عقب‌افتاده" />
              </>
            ) : null}
            {sales ? (
              <KpiCard
                label="فروش تسویه‌شده"
                value={formatToman(rial(sales.current), { unit: false })}
                hint="تومان، قسط‌های پرداخت‌شده در این دوره"
                icon="card"
                delta={deltaOf(sales.current, sales.previous)}
                spark={{ values: sales.spark, label: sparkLabel('مبلغ دریافت‌شده'), tone: 2 }}
              />
            ) : null}
            {!inbox && orderCount ? <KpiCard label="سفارش‌های تازه" value={fa(orderCount.current)} icon="orders" delta={deltaOf(orderCount.current, orderCount.previous)} spark={{ values: orderCount.spark, label: sparkLabel('سفارش‌ها') }} /> : null}
          </KpiGrid>
        </div>

        {queue && actor ? <ReviewQueue items={queue} actor={actor} /> : null}
        {actor?.canRecord ? (
          <Panel title="ثبت پرداخت دستی" subtitle="نقدی، کارت‌خوان یا واریز بانکی. تأیید نهایی با همکار دیگری است." headingId="h-manual">
            <ManualPaymentForm channels={Object.entries(MANUAL_CHANNELS).map(([value, label]) => ({ value, label }))} />
          </Panel>
        ) : null}

        <FilterBar action={BASE} resetHref={BASE}>
          <FilterSearch label="جست‌وجوی شمارهٔ سفارش یا دانشجو" placeholder="شمارهٔ سفارش، نام یا ایمیل دانشجو" defaultValue={q} />
          <FilterSelect name="status" label="وضعیت" defaultValue={status} options={[{ value: '', label: 'همه' }, ...Object.entries(ORDER_STATUS).map(([value, v]) => ({ value, label: v.label }))]} />
        </FilterBar>

        <MainSide
          main={
            <Panel title="سفارش‌ها" subtitle={list ? `نمایش ${fa(list.docs.length)} از ${fa(list.totalDocs)} نتیجه` : undefined} headingId="h-orders">
              {list ? (
                <>
                  <DataTable
                    caption="فهرست سفارش‌ها"
                    columns={columns}
                    rows={list.docs}
                    rowKey={(o) => String(o.id)}
                    empty={<EmptyState icon="orders" title="سفارشی با این فیلتر پیدا نشد." description="فیلتر را پاک کنید یا منتظر سفارش‌های تازه بمانید." action={<a href={BASE} className={consoleBtn.secondary}>پاک کردن فیلتر</a>} />}
                  />
                  {pager?.show ? <Pagination summary={pager.summary} pages={pager.pages} prev={pager.prev} next={pager.next} /> : null}
                </>
              ) : (
                <EmptyState icon="lock" title="فهرست سفارش‌ها برای نقش شما فعال نیست." description="دسترسی «مشاهدهٔ سفارش‌ها» لازم است." />
              )}
            </Panel>
          }
          side={
            <>
              <Panel title={inbox ? 'قسط‌های نیازمند پیگیری' : 'صندوق مالی'} headingId="h-inbox">
                {inbox ? (
                  inbox.zero ? (
                    <div data-testid="inbox-zero">
                      <EmptyState icon="check" title="همه‌چیز بررسی شده است." description="پرداختی در انتظار بررسی نیست." />
                    </div>
                  ) : (
                    <div data-testid="inbox-items">
                      <AlertList items={alertItems} emptyTitle="" />
                    </div>
                  )
                ) : (
                  <EmptyState icon="inbox" title="صندوق مالی خاموش است." description="در تنظیمات آکادمی می‌توان آن را روشن کرد." />
                )}
              </Panel>
              <Panel title="سفارش‌ها به تفکیک وضعیت" headingId="h-mix">
                {segs.length ? <DonutWithLegend segments={segs} centerValue={fa(totalOrders)} centerLabel="سفارش" label="سهم هر وضعیت از سفارش‌ها" /> : <EmptyState icon="orders" title="هنوز سفارشی ثبت نشده است." />}
              </Panel>
            </>
          }
        />
        {inbox ? <p className="text-sm text-muted">آخرین بررسی: {formatJalali(new Date(), 'HH:mm')}</p> : null}
      </div>
    </DeskPage>
  )
}

