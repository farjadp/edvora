import 'server-only'
import { formatJalali, formatToman, rial } from '@edvora/core'
import { PERIOD_DAYS, periodDelta, settledPayments, sharePct, trendOf, trendSince, type DatedValue, type Trend } from '@edvora/core/console'
import { toPersianDigits } from '@edvora/core/digits'
import { meets, type StaffPerms } from '@edvora/core/staff'
import { financeInbox } from '@edvora/core/staff-goals'
import type { ActivityItem, AlertItem, BarSeries, DonutSegment, KpiCardProps, KpiDelta, PageLink, QuickAction } from '@edvora/ui/console'
import type { CollectionSlug, Payload, PayloadRequest, TypedUser, Where } from 'payload'
import { ENROLLMENT_STATUS, LEAD_STATUS, ORDER_STATUS, SUBMISSION_STATUS, pill } from './consoleLabels'
import { docOf } from './ids'
import type { StaffSession } from './staff'
import type { Course, Order, User } from '../payload-types'

/**
 * Console data (E-035): real, tenant-filtered numbers for the /staff desks and the /admin dashboard.
 * Every query (1) names the academy scope explicitly (AGENTS.md) and (2) runs with `overrideAccess: false` as the
 * signed-in user, so the collections' own access rules (scoped instructors, advisors' own leads) still apply.
 * Nothing is invented: no data means an empty state. Period math and Tehran-day bucketing live in
 * `@edvora/core/console` (unit-tested): last 30 Tehran days vs the 30 before; sparklines 14 days; bars 7 vs 7.
 */
export type ConsoleScope =
  /** One academy: /staff (from the Host) or the academy picked in the /admin selector. */
  | { kind: 'academy'; tenantId: number }
  /** /admin without a selection, academy staff: the academies on the user's own record (never more). */
  | { kind: 'mine'; tenantIds: number[] }
  /** /admin without a selection, Edvora platform admin only: every academy on the platform (labelled as such). */
  | { kind: 'platform' }

export type DataCtx = {
  payload: Payload
  user: TypedUser
  scope: ConsoleScope
  req?: PayloadRequest
}

const DAY = 86_400_000
export { PERIOD_DAYS }
export const fa = (n: number | string) => toPersianDigits(String(n))
export const faNum = (n: number) => toPersianDigits(Math.round(n).toLocaleString('en-US').replace(/,/g, '٬'))

/** Upper bound for the rows one chart reads (createdAt / instalments only). Above it the chart says so. */
export const TREND_CAP = 10_000

const acc = (c: DataCtx) => ({ overrideAccess: false as const, ...(c.req ? { req: c.req } : { user: c.user }) })

/** The explicit academy filter for a scope. `mine` with no academies matches nothing (default deny). */
export function tenantWhere(scope: ConsoleScope): Where[] {
  if (scope.kind === 'academy') return [{ tenant: { equals: scope.tenantId } }]
  if (scope.kind === 'mine') return [{ tenant: { in: scope.tenantIds.length ? scope.tenantIds : [-1] } }]
  return []
}
const and = (c: DataCtx, ...w: Where[]): Where => ({ and: [...tenantWhere(c.scope), ...w] })

/** Eyebrow text for the /admin scope, so an aggregate is never mistaken for one academy. */
export function scopeLabel(scope: ConsoleScope, academyName?: string | null): string {
  if (scope.kind === 'academy') return academyName ?? 'آکادمی انتخاب‌شده'
  if (scope.kind === 'platform') return 'همهٔ آکادمی‌های ادورا (آکادمی انتخاب نشده؛ برای یک آکادمی از فهرست کناری انتخاب کنید)'
  return 'همهٔ آکادمی‌هایی که در آن‌ها عضو هستید'
}

type Collection = 'orders' | 'enrollments' | 'leads' | 'submissions' | 'certificates' | 'quiz-attempts'

/** Safe count: a collection the user may not read, or any failure, is "no data" (null), never a thrown error. */
export async function count(c: DataCtx, collection: CollectionSlug, ...w: Where[]): Promise<number | null> {
  try {
    const r = await c.payload.count({ collection, where: and(c, ...w), ...acc(c) })
    return r.totalDocs
  } catch (err) {
    c.payload.logger.error({ err, msg: `console: count ${collection} failed` })
    return null
  }
}

export type ConsoleTrend = Trend & { /** More rows than TREND_CAP: the numbers are a lower bound. */ capped: boolean }

/** Records created per Tehran day: one bounded query that reads `createdAt` only. */
export async function trend(c: DataCtx, collection: Collection, opts: { where?: Where; now?: Date } = {}): Promise<ConsoleTrend | null> {
  const now = opts.now ?? new Date()
  try {
    const r = await c.payload.find({
      collection,
      where: and(c, { createdAt: { greater_than_equal: trendSince(now).toISOString() } }, ...(opts.where ? [opts.where] : [])),
      depth: 0,
      limit: TREND_CAP,
      pagination: false,
      select: { createdAt: true } as never,
      ...acc(c),
    })
    const docs = r.docs as unknown as { createdAt: string }[]
    return { ...trendOf(docs.map((d): DatedValue => ({ at: d.createdAt })), now), capped: docs.length >= TREND_CAP }
  } catch (err) {
    c.payload.logger.error({ err, msg: `console: trend ${collection} failed` })
    return null
  }
}

/**
 * Settled money (integer rials) per Tehran day: PAID instalments by `paidAt`, on any order (fully or partly paid).
 * One bounded query over orders that have an instalment paid in the window; reads `instalments` only.
 */
export async function settledTrend(c: DataCtx, now = new Date()): Promise<ConsoleTrend | null> {
  try {
    const r = await c.payload.find({
      collection: 'orders',
      where: and(c, { 'instalments.paidAt': { greater_than_equal: trendSince(now).toISOString() } }),
      depth: 0,
      limit: TREND_CAP,
      pagination: false,
      select: { instalments: true } as never,
      ...acc(c),
    })
    const docs = r.docs as unknown as Pick<Order, 'instalments'>[]
    return { ...trendOf(settledPayments(docs), now), capped: docs.length >= TREND_CAP }
  } catch (err) {
    c.payload.logger.error({ err, msg: 'console: settled trend failed' })
    return null
  }
}

export const PERIOD_NOTE = `نسبت به ${fa(PERIOD_DAYS)} روز قبل`

/** This period against the previous one, as KPI text (math in `periodDelta`). */
export function deltaOf(current: number, previous: number, goodWhen: 'up' | 'down' = 'up'): KpiDelta {
  const d = periodDelta(current, previous, goodWhen)
  if (d.kind === 'empty') return { text: 'بدون رویداد', trend: 'flat', tone: 'neutral', note: '' }
  if (d.kind === 'no-baseline') return { text: 'بدون دورهٔ قبل برای مقایسه', trend: 'flat', tone: 'neutral', note: '' }
  if (d.kind === 'same') return { text: 'بدون تغییر', trend: 'flat', tone: 'neutral', note: PERIOD_NOTE }
  return { text: `${fa(d.pct)}٪ ${d.trend === 'up' ? 'بیشتر' : 'کمتر'}`, trend: d.trend, tone: d.good ? 'ok' : 'danger', note: PERIOD_NOTE }
}

export const sparkLabel = (what: string) => `${what}، روند ${fa(14)} روز گذشته`

/* ---------------------------------------------------------------- Pagination / sorting helpers */

export const PAGE_SIZE = 8

export function pageParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v)
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1
}
export const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/** Link builder that keeps the current filters. */
export function hrefWith(base: string, params: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

export function pagerOf(base: string, params: Record<string, string | undefined>, page: number, totalPages: number, totalDocs: number, size = PAGE_SIZE) {
  const from = totalDocs === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, totalDocs)
  const first = Math.max(1, Math.min(page - 2, totalPages - 4))
  const last = Math.min(totalPages, first + 4)
  const pages: PageLink[] = []
  for (let p = first; p <= last; p++) pages.push({ label: fa(p), href: hrefWith(base, params, { page: p === 1 ? undefined : String(p) }), current: p === page })
  return {
    summary: totalDocs === 0 ? 'موردی نیست' : `نمایش ${fa(from)} تا ${fa(to)} از ${fa(totalDocs)}`,
    pages: totalPages > 1 ? pages : [],
    prev: page > 1 ? hrefWith(base, params, { page: page - 1 === 1 ? undefined : String(page - 1) }) : null,
    next: page < totalPages ? hrefWith(base, params, { page: String(page + 1) }) : null,
    show: totalPages > 1,
  }
}

/** `-field` = descending. Only whitelisted fields; anything else falls back. */
export function sortOf(raw: string, allowed: readonly string[], fallback: string): { field: string; dir: 'asc' | 'desc'; sort: string } {
  const field = raw.replace(/^-/, '')
  if (!allowed.includes(field)) return { field: fallback.replace(/^-/, ''), dir: fallback.startsWith('-') ? 'desc' : 'asc', sort: fallback }
  return { field, dir: raw.startsWith('-') ? 'desc' : 'asc', sort: raw }
}

/** Header link: first click ascending, next click descending, third clears. */
export function sortHref(base: string, params: Record<string, string | undefined>, field: string, current: { field: string; dir: 'asc' | 'desc' } | null) {
  const active = current?.field === field
  const next = !active ? field : current.dir === 'asc' ? `-${field}` : undefined
  return { href: hrefWith(base, params, { sort: next, page: undefined }), dir: active ? current.dir : null }
}

/* ---------------------------------------------------------------- Overview (staff overview + /admin dashboard) */

export type CollAccess = {
  orders: boolean
  enrollments: boolean
  leads: boolean
  submissions: boolean
  create: { courses: boolean; coupons: boolean; posts: boolean; users: boolean }
}

export type OverviewData = {
  kpis: (KpiCardProps & { key: string })[]
  donut: { segments: (DonutSegment & { display: string })[]; centerValue: string; centerLabel: string } | null
  bars: { what: string; categories: string[]; series: BarSeries[]; empty: boolean } | null
  alerts: AlertItem[]
  quick: QuickAction[]
  activity: ActivityItem[]
  summary: { totalValue: string; rows: { label: string; value: string; pct: number; tone: 'ok' | 'warn' | 'brand' }[]; footer: { label: string; value: string }[] } | null
}

const WEEK_LABELS = ['۶ روز پیش', '۵', '۴', '۳', '۲', 'دیروز', 'امروز']
/** Order states that still carry (or carried) money; cancelled/refunded/failed orders are not "sales". */
const LIVE_ORDERS = ['paid', 'partially_paid', 'pending'] as const

/** Open orders → the E-028 finance-inbox counts (same rule as /staff/finance: Tehran days, last gateway attempt). */
async function openOrderInbox(c: DataCtx, now: Date) {
  try {
    const r = await c.payload.find({
      collection: 'orders',
      where: and(c, { status: { in: ['pending', 'partially_paid'] } }),
      depth: 0,
      limit: TREND_CAP,
      pagination: false,
      select: { status: true, instalments: true, payments: true } as never,
      ...acc(c),
    })
    const docs = r.docs as unknown as Pick<Order, 'id' | 'status' | 'instalments' | 'payments'>[]
    return financeInbox({
      now,
      orders: docs.map((o) => ({
        id: o.id,
        status: o.status,
        instalments: (o.instalments ?? []).map((i) => ({ index: i.index, amount: i.amount, dueDate: i.dueDate, status: i.status })),
        payments: (o.payments ?? []).map((p) => ({ instalmentIndex: p.instalmentIndex, status: p.status })),
      })),
    })
  } catch (err) {
    c.payload.logger.error({ err, msg: 'console: open orders failed' })
    return null
  }
}

export async function getOverview(c: DataCtx, a: CollAccess, now = new Date()): Promise<OverviewData> {
  const since30 = new Date(now.getTime() - PERIOD_DAYS * DAY).toISOString()
  const [enrol, sales, leads, subs, inbox, activeTotal, enrolActive, orderMix, leadsNoFollow, subsWaiting] = await Promise.all([
    a.enrollments ? trend(c, 'enrollments', { now }) : null,
    a.orders ? settledTrend(c, now) : null,
    a.leads ? trend(c, 'leads', { now }) : null,
    a.submissions ? trend(c, 'submissions', { now }) : null,
    a.orders ? openOrderInbox(c, now) : null,
    a.enrollments ? count(c, 'enrollments', { status: { equals: 'active' } }) : null,
    a.enrollments
      ? c.payload
          .find({ collection: 'enrollments', where: and(c, { status: { equals: 'active' } }), depth: 0, limit: TREND_CAP, pagination: false, select: { course: true } as never, ...acc(c) })
          .then((r) => r.docs as unknown as { course: number | Course }[])
          .catch(() => null)
      : null,
    a.orders
      ? c.payload
          .find({ collection: 'orders', where: and(c, { createdAt: { greater_than_equal: since30 } }, { status: { in: [...LIVE_ORDERS] } }), depth: 0, limit: TREND_CAP, pagination: false, select: { total: true, status: true } as never, ...acc(c) })
          .then((r) => r.docs as unknown as Pick<Order, 'total' | 'status'>[])
          .catch(() => null)
      : null,
    a.leads ? count(c, 'leads', { status: { equals: 'new' } }, { nextFollowUpAt: { exists: false } }) : null,
    a.submissions ? count(c, 'submissions', { status: { equals: 'submitted' } }) : null,
  ])

  // KPIs ---------------------------------------------------------------
  const kpis: OverviewData['kpis'] = []
  if (enrol) kpis.push({ key: 'enrol', label: 'ثبت‌نام‌های تازه', value: fa(enrol.current), icon: 'enrol', delta: deltaOf(enrol.current, enrol.previous), spark: { values: enrol.spark, label: sparkLabel('ثبت‌نام‌ها') }, href: '/admin/collections/enrollments' })
  if (sales) {
    const paidShare = orderMix && orderMix.length ? sharePct(orderMix.filter((o) => o.status === 'paid').length, orderMix.length) : null
    kpis.push({
      key: 'sales',
      label: 'فروش تسویه‌شده',
      value: formatToman(rial(sales.current), { unit: false }),
      icon: 'card',
      delta: deltaOf(sales.current, sales.previous),
      spark: { values: sales.spark, label: sparkLabel('مبلغ دریافت‌شده'), tone: 2 },
      progress: paidShare === null ? undefined : { pct: paidShare, text: `${fa(paidShare)}٪ سفارش‌های این دوره کامل پرداخت شده`, tone: 'ok' },
      href: '/admin/collections/orders',
      hint: 'تومان، قسط‌های پرداخت‌شده در این دوره',
    })
  }
  if (leads) {
    kpis.push({ key: 'leads', label: 'سرنخ‌های تازه', value: fa(leads.current), icon: 'leads', delta: deltaOf(leads.current, leads.previous), spark: { values: leads.spark, label: sparkLabel('سرنخ‌ها'), tone: 3 }, href: '/admin/collections/leads' })
  }
  if (inbox) {
    kpis.push({ key: 'overdue', label: 'اقساط سررسیدگذشته', value: fa(inbox.overdue), icon: 'clock', hint: inbox.overdue === 0 ? 'قسط عقب‌افتاده‌ای نیست.' : 'قسط سفارش‌های نیمه‌پرداخت که موعدش گذشته', href: '/admin/collections/orders' })
  }
  if (subsWaiting !== null && kpis.length < 4) {
    kpis.push({ key: 'grading', label: 'تکلیف در انتظار نمره', value: fa(subsWaiting), icon: 'grading', delta: subs ? deltaOf(subs.current, subs.previous, 'up') : undefined, spark: subs ? { values: subs.spark, label: sparkLabel('تحویل تکالیف'), tone: 4 } : undefined, href: '/admin/collections/submissions' })
  }

  // Donut: active enrolments by course -----------------------------------
  let donut: OverviewData['donut'] = null
  if (enrolActive && enrolActive.length) {
    const byCourse = new Map<number, number>()
    for (const e of enrolActive) {
      const id = typeof e.course === 'object' ? e.course.id : e.course
      byCourse.set(id, (byCourse.get(id) ?? 0) + 1)
    }
    const top = [...byCourse.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4)
    const titles = new Map<number, string>()
    try {
      const cs = await c.payload.find({ collection: 'courses', where: and(c, { id: { in: top.map(([id]) => id) } }), depth: 0, limit: 10, pagination: false, select: { title: true } as never, ...acc(c) })
      for (const d of cs.docs as unknown as Pick<Course, 'id' | 'title'>[]) titles.set(d.id, d.title)
    } catch {
      /* titles fall back to «دوره» */
    }
    const rest = enrolActive.length - top.reduce((n, [, v]) => n + v, 0)
    const segs: (DonutSegment & { display: string })[] = top.map(([id, v]) => ({ label: titles.get(id) ?? 'دوره', value: v, display: fa(v) }))
    if (rest > 0) segs.push({ label: 'سایر دوره‌ها', value: rest, display: fa(rest) })
    donut = { segments: segs, centerValue: fa(activeTotal ?? enrolActive.length), centerLabel: 'ثبت‌نام فعال' }
  }

  // Bars: last 7 days vs the 7 before ------------------------------------
  let bars: OverviewData['bars'] = null
  const src = enrol ?? leads
  if (src) {
    bars = {
      what: enrol ? 'ثبت‌نام‌ها' : 'سرنخ‌ها',
      categories: WEEK_LABELS.map((l) => fa(l)),
      series: [
        { label: 'این هفته', values: src.week, tone: 1 },
        { label: 'هفتهٔ قبل', values: src.weekBefore, tone: 4 },
      ],
      empty: [...src.week, ...src.weekBefore].every((v) => v === 0),
    }
  }

  // Alerts: only counts backed by real fields -----------------------------
  const alerts: AlertItem[] = []
  if (inbox?.overdue) alerts.push({ key: 'overdue', icon: 'clock', title: `${fa(inbox.overdue)} قسط سررسیدگذشته`, detail: 'قسط سفارش‌های نیمه‌پرداخت که موعدش گذشته و هنوز پرداخت نشده.', pill: { tone: 'danger', label: 'مالی' }, action: { label: 'بررسی', href: '/staff/finance' } })
  if (inbox && inbox.toVerify + inbox.needsAttention > 0)
    alerts.push({ key: 'payments', icon: 'alert', title: `${fa(inbox.toVerify + inbox.needsAttention)} پرداخت نیازمند بررسی`, detail: 'پرداخت‌های در انتظار تأیید یا تلاش‌های ناموفق درگاه.', pill: { tone: 'warn', label: 'مالی' }, action: { label: 'صندوق مالی', href: '/staff/finance' } })
  if (subsWaiting) alerts.push({ key: 'grading', icon: 'grading', title: `${fa(subsWaiting)} تکلیف در انتظار نمره`, detail: 'تحویل‌هایی که هنوز نمره نگرفته‌اند.', pill: { tone: 'warn', label: 'آموزش' }, action: { label: 'نمره‌دهی', href: '/admin/collections/submissions?where[status][equals]=submitted' } })
  if (leadsNoFollow) alerts.push({ key: 'leads', icon: 'phone', title: `${fa(leadsNoFollow)} سرنخ جدید بدون زمان پیگیری`, detail: 'وضعیت «جدید» و بدون تاریخ پیگیری.', pill: { tone: 'info', label: 'مشتریان' }, action: { label: 'پیگیری', href: '/admin/collections/leads?where[status][equals]=new' } })

  // Quick actions -----------------------------------------------------------
  const quick: QuickAction[] = []
  if (a.create.courses) quick.push({ key: 'course', icon: 'course', title: 'دورهٔ تازه', hint: 'ساخت پیش‌نویس دوره', href: '/admin/collections/courses/create' })
  if (a.create.coupons) quick.push({ key: 'coupon', icon: 'coupon', title: 'کد تخفیف', hint: 'تعریف کد تازه', href: '/admin/collections/coupons/create' })
  if (a.create.posts) quick.push({ key: 'post', icon: 'post', title: 'مقالهٔ تازه', hint: 'نوشتن برای مجله', href: '/admin/collections/posts/create' })
  if (a.create.users) quick.push({ key: 'user', icon: 'users', title: 'کاربر تازه', hint: 'افزودن عضو', href: '/admin/collections/users/create' })

  // Activity: the latest few of each source -----------------------------------
  const events: (ActivityItem & { at: number })[] = []
  const latest = <T,>(collection: Collection, extra?: Where) =>
    c.payload
      .find({ collection, where: and(c, ...(extra ? [extra] : [])), sort: '-createdAt', limit: 5, depth: 1, ...acc(c) })
      .then((r) => r.docs as unknown as (T & { id: number; createdAt: string })[])
      .catch(() => [] as (T & { id: number; createdAt: string })[])
  const [lo, le, ll, ls] = await Promise.all([
    a.orders ? latest<Order>('orders') : [],
    a.enrollments ? latest<{ user: number | User; course: number | Course; status?: string | null }>('enrollments') : [],
    a.leads ? latest<{ name: string; status: string }>('leads') : [],
    a.submissions ? latest<{ user: number | User; status?: string | null }>('submissions') : [],
  ])
  const who = (u: unknown) => docOf<User>(u as User)?.name || docOf<User>(u as User)?.email || 'کاربر'
  const cTitle = (x: unknown) => docOf<Course>(x as Course)?.title
  for (const o of lo) {
    const s = pill(ORDER_STATUS, o.status)
    events.push({ at: +new Date(o.createdAt), key: `o${o.id}`, time: formatJalali(o.createdAt, 'd MMM'), kind: { tone: 'info', label: 'سفارش' }, title: `${who(o.user)}${cTitle(o.course) ? ` · ${cTitle(o.course)}` : ''}`, meta: formatToman(rial(o.total)), status: { tone: s.tone, label: s.label } })
  }
  for (const e of le) {
    const s = pill(ENROLLMENT_STATUS, e.status)
    events.push({ at: +new Date(e.createdAt), key: `e${e.id}`, time: formatJalali(e.createdAt, 'd MMM'), kind: { tone: 'ok', label: 'ثبت‌نام' }, title: `${who(e.user)}${cTitle(e.course) ? ` · ${cTitle(e.course)}` : ''}`, status: { tone: s.tone, label: s.label } })
  }
  for (const l of ll) {
    const s = pill(LEAD_STATUS, l.status)
    events.push({ at: +new Date(l.createdAt), key: `l${l.id}`, time: formatJalali(l.createdAt, 'd MMM'), kind: { tone: 'brand', label: 'سرنخ' }, title: l.name, status: { tone: s.tone, label: s.label } })
  }
  for (const x of ls) {
    const s = pill(SUBMISSION_STATUS, x.status)
    events.push({ at: +new Date(x.createdAt), key: `s${x.id}`, time: formatJalali(x.createdAt, 'd MMM'), kind: { tone: 'warn', label: 'تکلیف' }, title: who(x.user), status: { tone: s.tone, label: s.label } })
  }
  const activity = events.sort((x, y) => y.at - x.at).slice(0, 7).map(({ at: _at, ...rest }) => rest)

  // Orders placed in the last 30 days, by state (value = order totals, integer rials) ------------------------------
  let summary: OverviewData['summary'] = null
  if (orderMix && orderMix.length) {
    const sumBy = (st: string) => orderMix.filter((o) => o.status === st).reduce((n, o) => n + o.total, 0)
    const paid = sumBy('paid')
    const part = sumBy('partially_paid')
    const pend = sumBy('pending')
    const total = paid + part + pend
    summary = {
      totalValue: formatToman(rial(total)),
      rows: [
        { label: 'کامل پرداخت‌شده', value: formatToman(rial(paid)), pct: sharePct(paid, total), tone: 'ok' },
        { label: 'در حال پرداخت اقساط', value: formatToman(rial(part)), pct: sharePct(part, total), tone: 'brand' },
        { label: 'در انتظار پرداخت', value: formatToman(rial(pend)), pct: sharePct(pend, total), tone: 'warn' },
      ],
      footer: [
        { label: 'تعداد سفارش', value: fa(orderMix.length) },
        // Integer rials: floor the mean (never a float into rial()).
        { label: 'میانگین هر سفارش', value: formatToman(rial(Math.floor(total / orderMix.length))) },
      ],
    }
  }

  return { kpis: kpis.slice(0, 4), donut, bars, alerts, quick, activity, summary }
}

/* ---------------------------------------------------------------- Staff helpers */

/** DataCtx for a settled staff session (the academy comes from the Host header, never from the request body). */
export function staffCtx(s: StaffSession & { user: User; req: PayloadRequest }): DataCtx {
  return { payload: s.req.payload, user: s.req.user as TypedUser, scope: { kind: 'academy', tenantId: s.tenant.id }, req: s.req }
}

const has = (who: StaffPerms, ...keys: string[]) => meets(who, { any: keys })

/**
 * Which overview blocks to build, from the person's real permissions (memberships), for /staff and /admin alike.
 * Mirrors each collection's staff read rule (Payload's own `read` is also true for one's OWN orders/enrolments,
 * which would turn a sales KPI into "my purchases"). Cosmetic: the queries still run under access rules.
 */
export function staffAccess(who: StaffPerms): CollAccess {
  return {
    orders: has(who, 'orders.view'),
    enrollments: has(who, 'enrollments.view', 'enrollments.manage'),
    leads: has(who, 'leads.view'),
    submissions: has(who, 'submissions.grade'),
    create: { courses: has(who, 'courses.edit'), coupons: has(who, 'coupons.manage'), posts: has(who, 'content.edit'), users: has(who, 'users.create') },
  }
}
export { has }
